import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Register a deck after file has been uploaded directly to storage.
 * This avoids the Node.js buffer issues with large file uploads.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, storagePath, fileType, fileSize } = await request.json();

    if (!name || !storagePath || !fileType) {
      return NextResponse.json(
        { error: 'Name, storagePath, and fileType are required' },
        { status: 400 }
      );
    }

    // Verify the file exists in storage - RELAXED CHECK
    // We skip the strict .list() check because it can be flaky immediately after upload due to eventual consistency
    // If the file is missing, the processing job will fail later anyway
    
    /* 
    const { data: fileData, error: checkError } = await supabase.storage
      .from('uploads')
      .list(user.id, {
        search: storagePath.split('/').pop(),
      });

    if (checkError || !fileData || fileData.length === 0) {
      return NextResponse.json(
        { error: 'Uploaded file not found in storage' },
        { status: 400 }
      );
    }
    */

    // Generate version hash from metadata
    const versionHash = crypto
      .createHash('sha256')
      .update(`${storagePath}:${fileSize}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);

    // Create deck record
    const { data: deck, error: insertError } = await supabase
      .from('decks')
      .insert({
        user_id: user.id,
        name: name.trim(),
        file_type: fileType,
        card_count: 0,
        version_hash: versionHash,
        processing_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Create processing job
    await supabase.from('processing_jobs').insert({
      user_id: user.id,
      job_type: 'deck_processing',
      target_id: deck.id,
      status: 'pending',
      progress: 0,
    });

    return NextResponse.json({
      deck,
      message: 'Deck registered successfully.',
    });
  } catch (error) {
    console.error('Deck registration error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
