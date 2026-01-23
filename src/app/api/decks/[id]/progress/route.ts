import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export interface ProcessingProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  step: 'uploading' | 'downloading' | 'parsing' | 'storing' | 'completed' | 'failed';
  stepDescription: string;
  cardsProcessed: number;
  totalCards: number;
  percentComplete: number;
  startedAt: string | null;
  estimatedSecondsRemaining: number | null;
  errorMessage: string | null;
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

  // Get deck with processing info
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, name, processing_status, error_message, card_count, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  // Get processing job for more detailed progress
  const { data: job } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('target_id', id)
    .eq('job_type', 'deck_processing')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Count raw cards stored so far
  const { count: rawCardsCount } = await supabase
    .from('raw_cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', id);

  // Determine current step based on status and data
  let step: ProcessingProgress['step'] = 'uploading';
  let stepDescription = 'Preparing upload...';
  let cardsProcessed = 0;
  let totalCards = deck.card_count || 0;
  let estimatedSecondsRemaining: number | null = null;

  if (deck.processing_status === 'pending') {
    step = 'uploading';
    stepDescription = 'Waiting to start...';
  } else if (deck.processing_status === 'processing') {
    cardsProcessed = rawCardsCount || 0;

    if (cardsProcessed === 0) {
      step = 'downloading';
      stepDescription = 'Downloading file from storage...';
    } else if (totalCards > 0 && cardsProcessed < totalCards) {
      step = 'parsing';
      stepDescription = `Parsing cards... (${cardsProcessed.toLocaleString()} / ${totalCards.toLocaleString()})`;

      // Estimate time remaining based on progress
      if (job?.started_at && cardsProcessed > 0) {
        const startTime = new Date(job.started_at).getTime();
        const now = Date.now();
        const elapsedSeconds = (now - startTime) / 1000;
        const cardsPerSecond = cardsProcessed / elapsedSeconds;
        const remainingCards = totalCards - cardsProcessed;
        estimatedSecondsRemaining = Math.ceil(remainingCards / cardsPerSecond);
      }
    } else {
      step = 'storing';
      stepDescription = 'Finalizing and cleaning up...';
    }
  } else if (deck.processing_status === 'completed') {
    step = 'completed';
    stepDescription = 'Processing complete!';
    cardsProcessed = totalCards;
  } else if (deck.processing_status === 'failed') {
    step = 'failed';
    stepDescription = deck.error_message || 'Processing failed';
  }

  const percentComplete = totalCards > 0
    ? Math.min(Math.round((cardsProcessed / totalCards) * 100), 100)
    : deck.processing_status === 'completed' ? 100 : 0;

  const progress: ProcessingProgress = {
    status: deck.processing_status,
    step,
    stepDescription,
    cardsProcessed,
    totalCards,
    percentComplete,
    startedAt: job?.started_at || null,
    estimatedSecondsRemaining,
    errorMessage: deck.error_message,
  };

  return NextResponse.json(progress);
}
