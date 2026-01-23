import { createClient } from '@supabase/supabase-js';

/**
 * Service role client for server-side operations that bypass RLS
 * Use ONLY in secure server contexts (API routes, background jobs)
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase service role credentials');
    console.error('URL:', supabaseUrl ? 'Set' : 'Missing');
    console.error('Service Key:', supabaseServiceKey ? 'Set' : 'Missing');
    throw new Error('Missing Supabase service role credentials');
  }

  // Verify it's a service role key (starts with eyJ)
  if (!supabaseServiceKey.startsWith('eyJ')) {
    console.warn('Service role key format looks incorrect');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
