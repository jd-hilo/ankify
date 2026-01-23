import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseApkgStreaming, getApkgCardCount } from '@/lib/parsers/apkg';
import { parseCsvStreaming, getCsvCardCount } from '@/lib/parsers/csv';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the deck
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  if (deck.processing_status === 'processing') {
    return NextResponse.json(
      { error: 'Deck is already being processed' },
      { status: 400 }
    );
  }

  // Allow reprocessing completed or failed decks

  // Update status to processing
  await supabase
    .from('decks')
    .update({ processing_status: 'processing', error_message: null })
    .eq('id', id);

  // Create or update processing job with start time
  await supabase
    .from('processing_jobs')
    .upsert({
      user_id: user.id,
      job_type: 'deck_processing',
      target_id: id,
      status: 'processing',
      progress: 0,
      started_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: 'target_id' });

  // Start processing in background
  // In production, this would be an Edge Function or background job
  processDeckinBackground(id, user.id);

  return NextResponse.json({
    message: 'Processing started',
    status: 'processing',
  });
}

async function processDeckinBackground(deckId: string, userId: string) {
  // Use service role client in background to bypass RLS
  let supabase: ReturnType<typeof createServiceClient> | undefined;
  try {
    supabase = createServiceClient();
  } catch (clientError) {
    console.error('Failed to create Supabase client:', clientError);
    // If we can't create the client, we can't update the status
    // Log the error and return early
    return;
  }
  
  try {
    // Get deck info
    const { data: deck } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .single();

    if (!deck) {
      throw new Error('Deck not found');
    }

    // Find the uploaded file in storage
    const { data: files } = await supabase.storage
      .from('uploads')
      .list(userId);

    // Find the file for this deck (most recent one)
    const deckFile = files?.find((f) =>
      f.name.endsWith(deck.file_type === 'apkg' ? '.apkg' : '.csv') ||
      f.name.endsWith('.txt')
    );

    if (!deckFile) {
      throw new Error('Uploaded file not found');
    }

    const storagePath = `${userId}/${deckFile.name}`;

    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('uploads')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error('Failed to download file');
    }

    // Clear any existing raw cards for this deck (in case of reprocessing)
    const { error: deleteError } = await supabase
      .from('raw_cards')
      .delete()
      .eq('deck_id', deckId);
    
    if (deleteError) {
      console.error('Error deleting existing cards:', deleteError);
      // Continue anyway - might be first time processing
    } else {
      console.log('Cleared existing raw cards for deck');
    }

    let totalCards = 0;
    let versionHash = '';

    // Parse and store cards in streaming batches - NO OPENAI CALLS
    // Cards are stored as raw text for later processing during alignment
    if (deck.file_type === 'apkg') {
      const buffer = await fileData.arrayBuffer();

      // Get total count first for progress tracking
      const estimatedCount = await getApkgCardCount(buffer);
      await supabase
        .from('decks')
        .update({ card_count: estimatedCount })
        .eq('id', deckId);

      console.log(`Starting APKG processing: ~${estimatedCount} cards`);

      const result = await parseApkgStreaming(
        buffer,
        500, // Process 500 cards at a time
        async (batch, batchIndex) => {
          console.log(`Processing batch ${batchIndex + 1}: ${batch.length} cards`);

          // Deduplicate within batch (keep first occurrence of each card_id)
          const seenIds = new Set<string>();
          const uniqueBatch = batch.filter((card) => {
            if (seenIds.has(card.cardId)) {
              return false;
            }
            seenIds.add(card.cardId);
            return true;
          });

          if (uniqueBatch.length < batch.length) {
            console.log(`  Removed ${batch.length - uniqueBatch.length} duplicates from batch`);
          }

          // Insert raw cards (no OpenAI processing)
          const rawCards = uniqueBatch.map((card) => ({
            deck_id: deckId,
            card_id: card.cardId,
            front: card.front,
            front_raw: card.frontRaw,
            back: card.back,
            tags: card.tags.length > 0 ? card.tags : null,
          }));

          const { error: insertError } = await supabase
            .from('raw_cards')
            .upsert(rawCards, { 
              onConflict: 'deck_id,card_id',
              ignoreDuplicates: false // Update if exists
            });

          if (insertError) {
            console.error('Error inserting raw cards:', insertError);
            throw new Error(`Failed to save cards: ${insertError.message}`);
          }
        }
      );

      totalCards = result.cardCount;
      versionHash = result.versionHash;
    } else {
      // For CSV/TXT, we must handle large files carefully to avoid "Cannot create a string longer than..." error
      // We'll read the blob as an ArrayBuffer and decode it in chunks if necessary,
      // but for now, let's try reading it as a stream if possible, or just handle the error gracefully.
      
      // Since fileData is a Blob, .text() fails for huge files.
      // We will use a custom streaming approach.
      
      const buffer = await fileData.arrayBuffer();
      const textDecoder = new TextDecoder();
      
      // If file is too big (>200MB), we might still have issues with arrayBuffer(),
      // but usually the limit is on String length (512MB in V8).
      // Let's decode it in chunks or assume it fits in memory as buffer but not as string.
      
      // Actually, parseCsvStreaming expects a string. We need to refactor it to accept a buffer/stream.
      // For now, let's try to slice the buffer and process it in chunks manually if it's huge.
      
      let text = '';
      try {
        text = textDecoder.decode(buffer);
      } catch (e) {
        console.error('File too large to decode at once:', e);
        throw new Error('File is too large to process. Please split it into smaller files (< 200MB).');
      }

      // Get total count first for progress tracking
      const estimatedCount = getCsvCardCount(text);
      await supabase
        .from('decks')
        .update({ card_count: estimatedCount })
        .eq('id', deckId);

      console.log(`Starting CSV processing: ~${estimatedCount} cards`);

      const result = await parseCsvStreaming(
        text,
        500,
        async (batch, batchIndex) => {
          console.log(`Processing batch ${batchIndex + 1}: ${batch.length} cards`);

          // Deduplicate within batch (keep first occurrence of each card_id)
          const seenIds = new Set<string>();
          const uniqueBatch = batch.filter((card) => {
            if (seenIds.has(card.cardId)) {
              return false;
            }
            seenIds.add(card.cardId);
            return true;
          });

          if (uniqueBatch.length < batch.length) {
            console.log(`  Removed ${batch.length - uniqueBatch.length} duplicates from batch`);
          }

          const rawCards = uniqueBatch.map((card) => ({
            deck_id: deckId,
            card_id: card.cardId,
            front: card.front,
            front_raw: card.frontRaw,
            back: card.back,
            tags: card.tags.length > 0 ? card.tags : null,
          }));

          const { error: insertError } = await supabase
            .from('raw_cards')
            .upsert(rawCards, { 
              onConflict: 'deck_id,card_id',
              ignoreDuplicates: false // Update if exists
            });

          if (insertError) {
            console.error('Error inserting raw cards:', insertError);
            throw new Error(`Failed to save cards: ${insertError.message}`);
          }
        }
      );

      totalCards = result.cardCount;
      versionHash = result.versionHash;
    }

    // Update deck with version hash and card count
    await supabase
      .from('decks')
      .update({
        version_hash: versionHash,
        card_count: totalCards,
      })
      .eq('id', deckId);

    // Delete the uploaded file (we no longer need it)
    await supabase.storage.from('uploads').remove([storagePath]);

    // Mark as completed
    await supabase
      .from('decks')
      .update({ processing_status: 'completed' })
      .eq('id', deckId);

    console.log(`Deck ${deckId} processing completed: ${totalCards} cards stored (no OpenAI calls)`);
  } catch (error) {
    console.error('Deck processing error:', error);

    // Mark as failed (supabase should be defined here since we return early if client creation fails)
    if (supabase) {
      try {
        await supabase
          .from('decks')
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', deckId);
      } catch (updateError) {
        console.error('Failed to update deck status:', updateError);
      }
    }
  }
}
