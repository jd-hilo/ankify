import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// Increase max duration for large uploads
export const maxDuration = 300; // 5 minutes

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: decks, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ decks });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string | null;

    if (!file || !name) {
      return NextResponse.json(
        { error: 'File and name are required' },
        { status: 400 }
      );
    }

    // Validate file type
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.apkg', '.csv', '.txt'].includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file type. Supported: APKG, CSV, TXT' },
        { status: 400 }
      );
    }

    const fileType = ext === '.apkg' ? 'apkg' : 'csv';

    // Generate a temporary version hash (real hash computed during processing)
    // Using file metadata instead of content to avoid loading large files into memory
    const tempVersionHash = crypto
      .createHash('sha256')
      .update(`${file.name}:${file.size}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);

    // Store file temporarily in Supabase Storage
    const storagePath = `${user.id}/${crypto.randomUUID()}_${file.name}`;

    // Read file in chunks to avoid Node.js buffer issues with large files
    const chunks: Uint8Array[] = [];
    const reader = file.stream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks into single buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const fileData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      fileData.set(chunk, offset);
      offset += chunk.length;
    }

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, fileData, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Create deck record
    const { data: deck, error: insertError } = await supabase
      .from('decks')
      .insert({
        user_id: user.id,
        name: name.trim(),
        file_type: fileType,
        card_count: 0,
        version_hash: tempVersionHash,
        processing_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file
      await supabase.storage.from('uploads').remove([storagePath]);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Store the storage path for later processing
    // We'll use a simple approach: store it in a processing job
    await supabase.from('processing_jobs').insert({
      user_id: user.id,
      job_type: 'deck_processing',
      target_id: deck.id,
      status: 'pending',
      progress: 0,
    });

    return NextResponse.json({
      deck,
      message: 'Deck uploaded successfully. Processing will begin when you start it.',
    });
  } catch (error) {
    console.error('Deck upload error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
