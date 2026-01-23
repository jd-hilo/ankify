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

  const { data: deck, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  return NextResponse.json({ deck });
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
  const { data: deck, error: fetchError } = await supabase
    .from('decks')
    .select('id, processing_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  }

  if (deck.processing_status === 'processing') {
    return NextResponse.json(
      { error: 'Cannot delete deck while processing' },
      { status: 400 }
    );
  }

  // Delete the deck (cascades to card_concepts and related data)
  const { error: deleteError } = await supabase
    .from('decks')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Deck deleted successfully' });
}
