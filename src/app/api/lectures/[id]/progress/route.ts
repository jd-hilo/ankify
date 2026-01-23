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

  // Get the most recent processing job for this lecture
  const { data: job, error } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('target_id', id)
    .eq('job_type', 'lecture_processing')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !job) {
    return NextResponse.json(
      { error: 'No processing job found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ job });
}
