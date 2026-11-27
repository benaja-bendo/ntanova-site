/**
 * Le rond d'une école sans logo (« option C », fondateur, 27/11/2026 ; remplace pour ce cas le sigle seul et la lettre du
 * cycle du 12/11) : un dessin d'école, jamais le logo NTanova.
 * - avec un sigle : le dessin au-dessus du sigle, sur le vert profond ;
 * - sans sigle : le dessin sur la couleur du cycle le plus élevé ;
 * - sans cycle connu : le dessin sur le disque gris.
 * Écrit une seule fois : la carte d'une école (page construite et navigateur), la fiche et l'aperçu de l'administration.
 * Ce rond n'est pas un logo : la complétude d'une fiche ne le compte pas. Pur : ni DOM, ni Astro.
 */
import { cycleLePlusEleve } from './carte/cycles';
import { ICONES } from './carte/icones';
import { echapper } from './echapper';
import type { Valeur } from './listes';

export type RondSansLogo =
  { genre: 'sigle'; texte: string } | { genre: 'cycle'; lettre: string } | { genre: 'vide' };

export function rondSansLogo(
  sigle: string | null | undefined,
  niveaux: readonly Valeur<'niveau'>[],
): RondSansLogo {
  const texte = sigle?.trim();
  if (texte) return { genre: 'sigle', texte };
  const lettre = cycleLePlusEleve(niveaux)?.lettre;
  return lettre ? { genre: 'cycle', lettre } : { genre: 'vide' };
}

/**
 * La place que prend un sigle sous le dessin : quatre tailles de lettres (`rond-ecole.css`). Dans un petit rond, un sigle
 * long ne se lit plus : la carte le cache, elle l'écrit déjà après le nom.
 */
export type LongueurDeSigle = 'court' | 'moyen' | 'long' | 'tres-long';
export const longueurDuSigle = (sigle: string): LongueurDeSigle => {
  const n = [...sigle].length;
  if (n <= 4) return 'court';
  if (n <= 6) return 'moyen';
  return n <= 9 ? 'long' : 'tres-long';
};

const dessin = `<svg class="rond-dessin" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES.ecoleToque
  .map((d) => `<path d="${d}"></path>`)
  .join('')}</svg>`;

/**
 * Le HTML du rond, décoratif (`aria-hidden`) : le nom, le sigle et les niveaux sont écrits à côté. `classe` dit où il se
 * pose (`vignette-rond`, `rond-ecole`) : c'est lui qui donne le diamètre.
 */
export function htmlRondSansLogo(r: RondSansLogo, classe: string): string {
  if (r.genre === 'sigle')
    return `<span class="${classe} rond-dessine rond-sigle sigle-${longueurDuSigle(r.texte)}" aria-hidden="true">${dessin}<span class="rond-texte">${echapper(r.texte)}</span></span>`;
  const couleur = r.genre === 'cycle' ? `rond-cycle c-${r.lettre}` : 'rond-vide';
  return `<span class="${classe} rond-dessine disque ${couleur}" aria-hidden="true">${dessin}</span>`;
}
