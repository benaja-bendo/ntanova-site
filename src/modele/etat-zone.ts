/**
 * L'état public d'une zone : ce que la carte et les pages disent d'elle, écrit une seule fois (audit du 05/11/2026, D2).
 *
 * Avant ce fichier, la carte lisait l'état réglé dans l'administration (`division.deploiement`) et les pages de zone
 * écrivaient « relevé en cours » pour toute zone sans école : une famille lisait « Déploiement programmé » sur la carte
 * et « relevé en cours » sur la page du même quartier. Les deux passent maintenant par `etatPublicDe`.
 *
 * Pur : ce fichier ne connaît ni la base ni Astro.
 */
import type { DivisionPublique } from './ports';

export type EtatDeploiement = NonNullable<DivisionPublique['deploiement']>;

/** Les mots de l'état public d'une zone : jamais « complet », rien ne le mesure. */
export const libelleDeploiement: Record<EtatDeploiement, string> = {
  actif: 'Relevé en cours',
  programme: 'Déploiement programmé',
};

const adresseDe = (d: Pick<DivisionPublique, 'adresse'>) =>
  d.adresse.filter((x, i, tout) => i === 0 || x !== tout[i - 1]).join('/');

/**
 * L'état public d'une zone, ou `null` quand elle n'en a pas (pas encore couverte : la carte n'en dit rien).
 * Une zone a d'abord son propre état ; sans lui, elle prend celui de ce qu'elle contient : « relevé en cours » dès qu'une
 * zone dessous l'est, sinon « déploiement programmé » dès qu'une zone dessous l'est.
 */
export function etatPublicDe(
  division: Pick<DivisionPublique, 'adresse' | 'deploiement'>,
  divisions: readonly Pick<DivisionPublique, 'adresse' | 'deploiement'>[],
): EtatDeploiement | null {
  if (division.deploiement) return division.deploiement;
  const prefixe = `${adresseDe(division)}/`;
  const dessous = divisions.filter((x) => adresseDe(x).startsWith(prefixe));
  if (dessous.some((x) => x.deploiement === 'actif')) return 'actif';
  if (dessous.some((x) => x.deploiement === 'programme')) return 'programme';
  return null;
}

/** Les mots d'une zone qui n'a pas encore d'école publiée : son état, dit tel quel, sans rien promettre de plus. */
export function phraseSansEcole(etat: EtatDeploiement | null): string {
  if (etat === 'actif') return 'Aucune école publiée pour l’instant : le relevé est en cours.';
  if (etat === 'programme')
    return 'Aucune école publiée pour l’instant : le déploiement est programmé.';
  return 'Aucune école publiée pour l’instant.';
}

/** La phrase d'une zone qui a des écoles, sur ce qui reste à relever. */
export function phraseDeLaSuite(etat: EtatDeploiement | null): string {
  if (etat === 'actif') return 'Le relevé est en cours : d’autres écoles peuvent encore s’ajouter.';
  if (etat === 'programme')
    return 'Le déploiement est programmé : le relevé n’a pas encore commencé partout.';
  return 'Une partie du territoire n’est pas encore relevée.';
}
