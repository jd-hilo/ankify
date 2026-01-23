import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateAlignmentsInBackground } from '@/lib/alignments';
import type { ProcessingStatus } from '@/types/database';

interface Params {
  params: Promise<{ lectureId: string }>;
}

interface ProcessingStatusCheck {
  id: string;
  processing_status: ProcessingStatus;
}

interface RawCardCandidate {
  raw_card_id: string;
  card_id: string;
  front: string;
  back: string;
  tags: string[] | null;
  similarity: number;
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

  try {
    // Verify lecture ownership and status
    const { data: lectureData, error: lectureError } = await supabase
      .from('lectures')
      .select('id, processing_status')
      .eq('id', lectureId)
      .eq('user_id', user.id)
      .single();

    if (lectureError || !lectureData) {
      return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
    }

    const lecture = lectureData as ProcessingStatusCheck;

    if (lecture.processing_status !== 'completed') {
      return NextResponse.json(
        { error: 'Lecture must be processed before alignment' },
        { status: 400 }
      );
    }

    // Get deck_id from existing alignments
    const { data: alignmentData, error: alignmentError } = await supabase
      .from('card_alignments')
      .select(`
        card_concepts!inner(deck_id)
      `)
      .eq('lecture_id', lectureId)
      .limit(1)
      .maybeSingle();

    if (alignmentError || !alignmentData) {
      return NextResponse.json(
        { error: 'No existing alignments found. Please create alignments first.' },
        { status: 400 }
      );
    }

    const cardConcepts = alignmentData.card_concepts as { deck_id: string };
    const deckId = cardConcepts?.deck_id;

    if (!deckId) {
      return NextResponse.json(
        { error: 'Could not determine deck ID from existing alignments.' },
        { status: 400 }
      );
    }

    // Verify deck exists and is completed (allow any user's deck)
    const { data: deckData, error: deckError } = await supabase
      .from('decks')
      .select('id, processing_status')
      .eq('id', deckId)
      .eq('processing_status', 'completed')
      .single();

    if (deckError || !deckData) {
      return NextResponse.json({ error: 'Deck not found or not completed' }, { status: 404 });
    }

    const deck = deckData as ProcessingStatusCheck;

    if (deck.processing_status !== 'completed') {
      return NextResponse.json(
        { error: 'Deck must be processed before alignment' },
        { status: 400 }
      );
    }

    // Ensure service role is available before starting background job
    let serviceClient;
    try {
      serviceClient = createServiceClient();
    } catch (error) {
      console.error('Missing service role credentials:', error);
      return NextResponse.json(
        { error: 'Server misconfigured: missing service role key' },
        { status: 500 }
      );
    }

    // Clear any existing alignments for this lecture (using service client to bypass RLS)
    await serviceClient
      .from('card_alignments')
      .delete()
      .eq('lecture_id', lectureId);

    await serviceClient
      .from('coverage_gaps')
      .delete()
      .eq('lecture_id', lectureId);

    // Create processing job
    await supabase.from('processing_jobs').insert({
      user_id: user.id,
      job_type: 'alignment_generation',
      target_id: lectureId,
      status: 'processing',
      progress: 0,
      started_at: new Date().toISOString(),
    });

    // Start alignment in background with service client
    generateAlignmentsInBackground(lectureId, deckId, user.id);

    return NextResponse.json({
      message: 'Alignment regeneration started',
      status: 'processing',
    });
  } catch (error) {
    console.error('Regenerate alignment error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

