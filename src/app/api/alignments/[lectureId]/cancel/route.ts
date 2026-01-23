import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

interface Params {
  params: Promise<{ lectureId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { lectureId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify lecture ownership
  const { data: lecture, error: lectureError } = await supabase
    .from('lectures')
    .select('id')
    .eq('id', lectureId)
    .eq('user_id', user.id)
    .single();

  if (lectureError || !lecture) {
    return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
  }

  // Use service client to delete alignments and gaps
  const serviceClient = createServiceClient();

  // Delete all alignments for this lecture
  await serviceClient
    .from('card_alignments')
    .delete()
    .eq('lecture_id', lectureId);

  // Delete all coverage gaps for this lecture
  await serviceClient
    .from('coverage_gaps')
    .delete()
    .eq('lecture_id', lectureId);

  // Mark processing job as cancelled/failed
  await supabase
    .from('processing_jobs')
    .update({
      status: 'failed',
      error_message: 'Cancelled by user',
      completed_at: new Date().toISOString(),
    })
    .eq('target_id', lectureId)
    .eq('job_type', 'alignment_generation')
    .eq('user_id', user.id);

  return NextResponse.json({ message: 'Alignment cancelled successfully' });
}
