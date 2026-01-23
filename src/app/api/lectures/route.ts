import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: lectures, error } = await supabase
    .from('lectures')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lectures });
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
    if (!['.pdf', '.pptx'].includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file type. Supported: PDF, PPTX' },
        { status: 400 }
      );
    }

    const fileType = ext === '.pdf' ? 'pdf' : 'pptx';

    // Store file temporarily in Supabase Storage
    const storagePath = `${user.id}/lectures/${crypto.randomUUID()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Create lecture record
    const { data: lecture, error: insertError } = await supabase
      .from('lectures')
      .insert({
        user_id: user.id,
        name: name.trim(),
        file_type: fileType,
        slide_count: 0,
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
    await supabase.from('processing_jobs').insert({
      user_id: user.id,
      job_type: 'lecture_processing',
      target_id: lecture.id,
      status: 'pending',
      progress: 0,
    });

    return NextResponse.json({
      lecture,
      message: 'Lecture uploaded successfully. Processing will begin when you start it.',
    });
  } catch (error) {
    console.error('Lecture upload error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
