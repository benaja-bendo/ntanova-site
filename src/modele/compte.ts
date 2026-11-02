/**
 * Un téléphone peut servir à deux relais (ticket #55). Les fiches non envoyées d'un relais restent sur le téléphone
 * quand il se déconnecte, mais ne sont ni vues ni envoyées sous le nom d'un autre : une fiche envoyée sous le mauvais
 * compte attribuerait la paie au mauvais relais. Des fonctions pures : la file, les écrans et le compte les appellent.
 */
import type { FicheLocale } from './fiche';

/**
 * À qui est cette fiche : au compte qui l'a commencée. Une fiche d'avant la mise à jour n'a pas de compte : elle est à
 * celui qui se connecte (c'était le comportement d'avant). Quand on ne sait pas encore qui est connecté, une fiche
 * d'un compte n'est à personne.
 */
export function appartientAuCompte(
  fiche: Pick<FicheLocale, 'compteId'>,
  compteId: string | null,
): boolean {
  return fiche.compteId == null || fiche.compteId === compteId;
}

/** Le brouillon d'un compte : le plus récent des siens, jamais celui d'un autre. Le téléphone en garde un par compte. */
export function duBrouillon<T extends Pick<FicheLocale, 'etat' | 'compteId' | 'creeeLe'>>(
  fiches: readonly T[],
  compteId: string | null,
): T | undefined {
  return fiches
    .filter((f) => f.etat === 'brouillon' && appartientAuCompte(f, compteId))
    .sort((a, b) => b.creeeLe.localeCompare(a.creeeLe))[0];
}

export interface ResteSurLeTelephone {
  brouillons: number;
  aEnvoyer: number;
  refusees: number;
  total: number;
}

/** Ce que NTanova n'a pas encore reçu des fiches de ce compte : un brouillon, des fiches en file, des fiches refusées. */
export function ceQuiResteSurLeTelephone(
  fiches: readonly Pick<FicheLocale, 'etat' | 'compteId'>[],
  compteId: string | null,
): ResteSurLeTelephone {
  const siennes = fiches.filter((f) => appartientAuCompte(f, compteId));
  const brouillons = siennes.filter((f) => f.etat === 'brouillon').length;
  const aEnvoyer = siennes.filter((f) => f.etat === 'a_envoyer').length;
  const refusees = siennes.filter((f) => f.etat === 'refusee').length;
  return { brouillons, aEnvoyer, refusees, total: brouillons + aEnvoyer + refusees };
}

/** Les phrases qui précèdent « Se déconnecter » : ce qui reste sur le téléphone, et ce que la déconnexion change. */
export function avertissementDeDeconnexion(reste: ResteSurLeTelephone, enLigne: boolean): string[] {
  const phrases: string[] = [];
  if (reste.total === 0) {
    phrases.push('Toutes vos fiches sont reçues par NTanova.');
  } else {
    const detail = [
      reste.brouillons > 0 && `${reste.brouillons} brouillon${reste.brouillons > 1 ? 's' : ''}`,
      reste.aEnvoyer > 0 && `${reste.aEnvoyer} à envoyer`,
      reste.refusees > 0 && `${reste.refusees} refusée${reste.refusees > 1 ? 's' : ''}`,
    ].filter(Boolean);
    const pluriel = reste.total > 1;
    phrases.push(
      `${reste.total} fiche${pluriel ? 's ne sont' : ' n’est'} pas encore reçue${pluriel ? 's' : ''} par NTanova (${detail.join(', ')}).`,
    );
    phrases.push(
      'Vos fiches non reçues restent sur ce téléphone, mais ne partiront qu’à votre prochaine connexion avec ce compte.',
    );
  }
  if (!enLigne) {
    phrases.push(
      'Vous êtes hors ligne : sans réseau, vous ne pourrez pas vous reconnecter. Attendez d’avoir du réseau.',
    );
  }
  return phrases;
}

/**
 * Ce que dit l'écran de connexion des fiches restées dans le téléphone (de n'importe quel compte), pour que personne
 * ne les croie perdues : null quand il n'y en a aucune.
 */
export function phraseFichesEnAttente(nombre: number): string | null {
  if (nombre <= 0) return null;
  return nombre === 1
    ? '1 fiche de ce téléphone attend d’être envoyée. Elle part quand le relais qui l’a commencée se connecte.'
    : `${nombre} fiches de ce téléphone attendent d’être envoyées. Elles partent quand le relais qui les a commencées se connecte.`;
}
