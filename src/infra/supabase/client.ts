import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';

/** La session est gardée sous ce nom dans le téléphone : on la relit sans réseau. */
export const CLE_SESSION = 'ntanova-session';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_PUBLISHABLE_KEY manquent (voir .env.example).');
  }
  client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey: CLE_SESSION,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
