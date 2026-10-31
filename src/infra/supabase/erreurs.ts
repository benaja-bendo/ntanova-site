// Les réponses de Supabase traduites dans les termes des ports.
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { ErreurDecision, ErreurReseau, ErreurSession, type Reponse } from '../../modele/ports';

export interface ErreurApi {
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

/**
 * Pour une décision de l'administration : la base refuse avec un message écrit
 * pour un humain (« Relevé du lot d'essai : il ne se publie jamais. »), qu'on garde.
 */
export function decider(erreur: ErreurApi | null): void {
  if (erreur === null) return;
  if (erreur.code && ['P0002', '22023', '42501', '23514'].includes(erreur.code)) {
    throw new ErreurDecision(erreur.message ?? 'Décision refusée.');
  }
  traduire(erreur);
}
