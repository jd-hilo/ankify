import { createClient } from '@/lib/supabase/server';
import type { Deck } from '@/types/database';
import { DecksWithUpload } from '@/components/decks-with-upload';

export default async function DecksPage() {
  const supabase = await createClient();

  const { data: decksData, error } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });

  const decks = (decksData || []) as Deck[];

  return <DecksWithUpload initialDecks={decks} error={error?.message || null} />;
}
