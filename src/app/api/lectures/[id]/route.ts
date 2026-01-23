import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: lecture, error } = await supabase
    .from('lectures')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !lecture) {
    return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
  }

  return NextResponse.json({ lecture });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const { data: lecture, error: fetchError } = await supabase
    .from('lectures')
    .select('id, processing_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !lecture) {
    return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
  }

  if (lecture.processing_status === 'processing') {
    return NextResponse.json(
      { error: 'Cannot delete lecture while processing' },
      { status: 400 }
    );
  }

  // Delete the lecture (cascades to slide_concepts and alignments)
  const { error: deleteError } = await supabase
    .from('lectures')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Lecture deleted successfully' });
}
