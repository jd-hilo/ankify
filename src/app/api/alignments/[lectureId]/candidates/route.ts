import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ lectureId: string }>;
}

interface SlideConcept {
  id: string;
  slide_number: number;
  concept_summary: string;
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

  const url = new URL(request.url);
  const deckId = url.searchParams.get('deckId');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  if (!deckId) {
    return NextResponse.json({ error: 'deckId is required' }, { status: 400 });
  }

  if (limitParam && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    return NextResponse.json({ error: 'limit must be a positive number' }, { status: 400 });
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

  // Verify deck exists and is completed (allow any user's deck)
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, processing_status')
    .eq('id', deckId)
    .eq('processing_status', 'completed')
    .single();

  if (deckError || !deck) {
    return NextResponse.json({ error: 'Deck not found or not completed' }, { status: 404 });
  }

  const { count: rawCardCount, error: rawCardCountError } = await supabase
    .from('raw_cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', deckId);

  const { data: slides, error: slidesError } = await supabase
    .from('slide_concepts')
    .select('id, slide_number, concept_summary')
    .eq('lecture_id', lectureId)
    .order('slide_number', { ascending: true })
    .limit(limit ? limit : 10000);

  if (slidesError || !slides) {
    return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 });
  }

  const candidates = [];
  const slideConcepts = slides as SlideConcept[];

  for (const slide of slideConcepts) {
    const rawSearchText = slide.concept_summary.trim();
    const searchText =
      rawSearchText.length > 1000 ? rawSearchText.slice(0, 1000) : rawSearchText;

    const { data, error } = await supabase.rpc('find_candidate_cards', {
      search_text: searchText,
      deck_id_filter: deckId,
      match_count: 60,
    });

    candidates.push({
      slideId: slide.id,
      slideNumber: slide.slide_number,
      candidateCount: Array.isArray(data) ? data.length : 0,
      error: error?.message ?? null,
    });
  }

  return NextResponse.json({
    lectureId,
    deckId,
    rawCardCount: rawCardCountError ? null : rawCardCount ?? 0,
    slideCount: slideConcepts.length,
    candidates,
  });
}
