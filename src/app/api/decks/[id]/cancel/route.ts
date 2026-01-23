import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the deck
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  if (deck.processing_status !== 'processing') {
    return NextResponse.json(
      { error: 'Deck is not currently processing' },
      { status: 400 }
    );
  }

  // Update status to failed with cancellation message
  const { error: updateError } = await supabase
    .from('decks')
    .update({
      processing_status: 'failed',
      error_message: 'Processing cancelled by user',
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to cancel processing' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
