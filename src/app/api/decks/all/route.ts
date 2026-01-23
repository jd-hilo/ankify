import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service client to bypass RLS and get all completed decks from all users
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

  const { data: decks, error } = await serviceClient
    .from('decks')
    .select('id, name, card_count, processing_status, user_id')
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ decks });
}
