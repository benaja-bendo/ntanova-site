import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import { ErreurReseau, ErreurSession, type Reponse } from '../../modele/ports';

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

interface ErreurApi {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
  statusCode?: string | undefined;
}

function estErreurReseau(erreur: ErreurApi | unknown): boolean {
  if (isAuthRetryableFetchError(erreur)) return true;
  const message = (erreur as ErreurApi | null)?.message ?? '';
  return /fetch|network|load failed|timed? ?out/i.test(message);
}

/**
 * Traduit la réponse d'un envoi : « reçu », « déjà reçu » (doublon : code 23505,
 * ou 409 pour une photo), ou une erreur que la file d'envoi sait traiter.
 */
export function traduire(erreur: ErreurApi | null): Reponse {
  if (erreur === null) return 'recu';
  if (erreur.code === '23505' || erreur.status === 409 || erreur.statusCode === '409') {
    return 'deja_recu';
  }
  if (estErreurReseau(erreur)) throw new ErreurReseau(erreur.message ?? 'réseau');
  if (
    erreur.code === 'PGRST301' ||
    erreur.code === 'PGRST303' ||
    erreur.status === 401 ||
    erreur.statusCode === '401' ||
    erreur.statusCode === '403'
  ) {
    throw new ErreurSession(erreur.message ?? 'session');
  }
  throw new Error(`${erreur.code ?? erreur.statusCode ?? 'erreur'} : ${erreur.message ?? ''}`);
}

/** Pour une lecture : rend les données, ou lève la même erreur qu'un envoi raté. */
export function lire<T>(reponse: { data: T | null; error: ErreurApi | null }): T {
  if (reponse.error) traduire(reponse.error);
  if (reponse.data === null) throw new Error('Réponse vide');
  return reponse.data;
}
