import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ lectureId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
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

  // Get coverage gaps
  const { data: gaps, error } = await supabase
    .from('coverage_gaps')
    .select(`
      *,
      slide_concepts(slide_number, concept_summary)
    `)
    .eq('lecture_id', lectureId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gaps });
}
