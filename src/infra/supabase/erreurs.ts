// Les réponses de Supabase traduites dans les termes des ports.
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import {
  ErreurDecision,
  ErreurRejet,
  ErreurReseau,
  ErreurSession,
  type Reponse,
} from '../../modele/ports';

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

/** Un refus du stockage (403) n'est une session perdue que s'il parle du jeton ; sinon c'est un refus de droits. */
const PARLE_DU_JETON = /jwt|token|jeton|expired|expir/i;

function estSessionPerdue(erreur: ErreurApi): boolean {
  if (erreur.code === 'PGRST301' || erreur.code === 'PGRST303') return true;
  if (erreur.status === 401 || erreur.statusCode === '401') return true;
  return erreur.statusCode === '403' && PARLE_DU_JETON.test(erreur.message ?? '');
}

/**
 * Les refus de la base, ceux que rejouer ne changera pas : une donnée hors règle (classes 22 et 23 de PostgreSQL),
 * un refus écrit par la base (`raise exception` : P0001, P0002), un compte sans droit (42501). Le refus de
 * droits du stockage (403) en est un aussi.
 */
function estUnRefus(erreur: ErreurApi): boolean {
  const code = erreur.code ?? '';
  return (
    /^(22|23)[0-9A-Z]{3}$/.test(code) ||
    code === 'P0001' ||
    code === 'P0002' ||
    code === '42501' ||
    erreur.statusCode === '403'
  );
}

/**
 * Traduit la réponse d'un envoi : « reçu », « déjà reçu » (doublon : code 23505,
 * ou 409 pour une photo), ou une erreur que la file d'envoi sait traiter :
 * `ErreurReseau` (la fiche reste en file), `ErreurSession` (le relais se reconnecte),
 * `ErreurRejet` (la base refuse : la fiche sort de la file avec ce message), ou une `Error`
 * pour une panne dont on ne sait rien (la fiche reste en file).
 *
 * Seul le `message` est repris : le détail d'un refus (« Failing row contains … ») porte des données.
 */
export function traduire(erreur: ErreurApi | null): Reponse {
  if (erreur === null) return 'recu';
  if (erreur.code === '23505' || erreur.status === 409 || erreur.statusCode === '409') {
    return 'deja_recu';
  }
  if (estErreurReseau(erreur)) throw new ErreurReseau(erreur.message ?? 'réseau');
  if (estSessionPerdue(erreur)) throw new ErreurSession(erreur.message ?? 'session');
  if (estUnRefus(erreur)) {
    throw new ErreurRejet(erreur.code ?? erreur.statusCode ?? 'refus', erreur.message ?? '');
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
 * Pour une fonction de la base qui rend une liste (`rpc`) : les lignes, ou une liste vide. Le type des lignes est
 * celui que l'appelant écrit : la base n'a pas de types générés ici.
 */
export function lireListe<T>(reponse: { data: unknown; error: ErreurApi | null }): T[] {
  if (reponse.error) traduire(reponse.error);
  return Array.isArray(reponse.data) ? (reponse.data as T[]) : [];
}

const TAILLE_PAGE = 1000;

/**
 * Toutes les lignes d'une lecture, page après page (l'API plafonne chaque réponse). `requete` reçoit les bornes
 * `de` et `a` (incluses) et doit trier sur une clé unique, sinon deux pages peuvent se recouvrir.
 */
export async function toutesLesLignes<T>(
  requete: (de: number, a: number) => PromiseLike<{ data: unknown; error: ErreurApi | null }>,
): Promise<T[]> {
  const tout: T[] = [];
  for (let de = 0; ; de += TAILLE_PAGE) {
    const lignes = lireListe<T>(await requete(de, de + TAILLE_PAGE - 1));
    tout.push(...lignes);
    if (lignes.length < TAILLE_PAGE) return tout;
  }
}

/**
 * Pour une décision de l'administration : la base refuse avec un message écrit
 * pour un humain (« Relevé du lot d'essai : il ne se publie jamais. »), qu'on garde.
 */
export function decider(erreur: ErreurApi | null): void {
  if (erreur === null) return;
  if (erreur.code === '23505') throw new ErreurDecision('Cet enregistrement existe déjà.');
  if (erreur.code && ['P0002', '22023', '42501', '23514'].includes(erreur.code)) {
    throw new ErreurDecision(erreur.message ?? 'Décision refusée.');
  }
  traduire(erreur);
}
