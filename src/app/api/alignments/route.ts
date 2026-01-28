import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateAlignmentsInBackground } from '@/lib/alignments';
import type { ProcessingStatus } from '@/types/database';

interface ProcessingStatusCheck {
  id: string;
  processing_status: ProcessingStatus;
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
    const { lectureId, deckId } = await request.json();

    console.log(`[Alignment] User ${user.id} attempting to align lecture ${lectureId} with deck ${deckId}`);

    if (!lectureId || !deckId) {
      return NextResponse.json(
        { error: 'Lecture ID and Deck ID are required' },
        { status: 400 }
      );
    }

    // Verify lecture ownership and status
    // First check if lecture exists (without user filter)
    const { data: lectureExists } = await supabase
      .from('lectures')
      .select('id, user_id, processing_status')
      .eq('id', lectureId)
      .single();

    if (!lectureExists) {
      return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
    }

    // Check if user owns the lecture
    if (lectureExists.user_id !== user.id) {
      console.log(`Alignment blocked: User ${user.id} tried to align lecture ${lectureId} owned by ${lectureExists.user_id}`);
      return NextResponse.json({ 
        error: 'You can only align cards to lectures you own. Please upload your own lecture first.' 
      }, { status: 403 });
    }

    const lecture = lectureExists as ProcessingStatusCheck;

    if (lecture.processing_status !== 'completed') {
      console.log(`[Alignment] Lecture ${lectureId} status is ${lecture.processing_status}, not completed`);
      return NextResponse.json(
        { error: `Lecture must be processed before alignment. Current status: ${lecture.processing_status}` },
        { status: 400 }
      );
    }

    console.log(`[Alignment] Lecture ${lectureId} verified: owned by user ${user.id}, status: completed`);

    // Ensure service role is available before checking deck (need to bypass RLS)
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

    // Verify deck exists and is completed (allow any user's deck)
    // Use service client to bypass RLS so any user can use any completed deck
    const { data: deckExists, error: deckCheckError } = await serviceClient
      .from('decks')
      .select('id, processing_status, name')
      .eq('id', deckId)
      .single();

    if (deckCheckError || !deckExists) {
      console.log(`Alignment failed: Deck ${deckId} not found or error:`, deckCheckError);
      return NextResponse.json({ error: 'Deck not found. Please select a valid deck.' }, { status: 404 });
    }

    if (deckExists.processing_status !== 'completed') {
      console.log(`Alignment failed: Deck ${deckId} (${deckExists.name}) status is ${deckExists.processing_status}, not completed`);
      return NextResponse.json({ 
        error: `Deck "${deckExists.name}" is not completed yet. Status: ${deckExists.processing_status}. Please wait for deck processing to finish.` 
      }, { status: 400 });
    }

    const deck = deckExists as ProcessingStatusCheck & { name?: string };
    
    console.log(`[Alignment] Deck ${deckId} (${deckExists.name}) verified: status completed, accessible to all users`);

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

    console.log(`[Alignment] All checks passed. Starting alignment for lecture ${lectureId} with deck ${deckId}`);
    
    // Start alignment in background with service client
    generateAlignmentsInBackground(lectureId, deckId, user.id);

    return NextResponse.json({
      message: 'Alignment started',
      status: 'processing',
    });
  } catch (error) {
    console.error('Alignment error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

