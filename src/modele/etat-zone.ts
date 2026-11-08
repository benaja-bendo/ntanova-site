/**
 * L'état d'une zone, réglé dans l'administration (audit du 05/11/2026, D2) : « relevé en cours », « déploiement
 * programmé », ou rien.
 *
 * Depuis le 08/11/2026 (décision du fondateur qui revient sur D2, ticket 146), le site public ne l'écrit plus : ni la
 * carte, ni les pages de lieu. Le réglage décide encore quelles zones la carte dessine (`carte/donnees.ts`) et où elle
 * s'ouvre (`carte/cadrage.ts`) ; l'administration en garde les mots.
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
