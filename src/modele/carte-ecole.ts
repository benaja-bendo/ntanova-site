/**
 * La carte d'une école, écrite une seule fois (lot 4 bis, 16/11/2026) : la page construite (`ui/CarteEcole.astro`) et le
 * navigateur (la liste filtrée de « Les écoles », la vue Carte) posent le même HTML, tiré de la même ligne du fichier de
 * recherche. Plus de jumeaux à tenir d'accord. Chaque ligne n'existe que si sa donnée existe (carte « sp-cartes-ecoles » de
 * la version 46). Tout le texte est échappé. Pur : ni DOM, ni Astro.
 *
 * - `colonne` : la vignette en haut (accueil, grille de la liste sur ordinateur) ;
 * - `ligne` : la vignette carrée à gauche sur téléphone, en haut à partir de 48 rem (liste, « Écoles proches »).
 */
import { cycleLePlusEleve, lettresDesCycles } from './carte/cycles';
import { ICONES, type NomIcone } from './carte/icones';
import { distanceCourte } from './fiche-mince';
import { ligneDeRecherche } from './ligne-ecole';
import { dateCourte } from './pointe-noire';
import type { LigneRecherche } from './recherche';

const ECHAPPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const echapper = (texte: string): string => texte.replace(/[&<>"']/g, (c) => ECHAPPES[c]!);

/** Une icône, comme `Icone.astro` (petite, décorative). */
export const htmlIcone = (nom: NomIcone): string =>
  `<svg class="ico ico-s" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nom]
    .map((d) => `<path d="${d}"></path>`)
    .join('')}</svg>`;

export interface OptionsCarte {
  forme?: 'colonne' | 'ligne';
  /** La distance à un point (la fiche ouverte, la position donnée), en mètres. */
  distanceM?: number | null;
  /** Une image chargée tout de suite (les premières cartes de la page) ; sinon à l'approche de l'écran. */
  prioritaire?: boolean;
}

function vignette(l: LigneRecherche, forme: 'colonne' | 'ligne', prioritaire: boolean): string {
  const chargement = prioritaire ? '' : ' loading="lazy"';
  if (l.vc && l.vl) {
    if (forme === 'ligne')
      return (
        `<picture><source media="(min-width: 48rem)" srcset="${echapper(l.vl)}" width="400" height="208">` +
        `<img class="vignette-ecole vignette-adaptee" src="${echapper(l.vc)}" alt="" width="152" height="152"${chargement} decoding="async"></picture>`
      );
    return `<img class="vignette-ecole vignette-large" src="${echapper(l.vl)}" alt="" width="400" height="208"${chargement} decoding="async">`;
  }
  const classe = `vignette-ecole vignette-vide ${forme === 'ligne' ? 'vignette-adaptee' : 'vignette-large'}`;
  let rond = '';
  if (l.lg)
    rond = `<span class="vignette-rond vignette-logo"><img src="${echapper(l.lg)}" alt="" width="100" height="100" loading="lazy"></span>`;
  else if (l.si) rond = `<span class="vignette-rond vignette-sigle">${echapper(l.si)}</span>`;
  else {
    const lettre = cycleLePlusEleve(l.c)?.lettre;
    if (lettre)
      rond = `<span class="disque c-${lettre} vignette-rond vignette-cycle">${lettre}</span>`;
  }
  return `<span class="${classe}" aria-hidden="true">${rond}</span>`;
}

/** Le HTML d'une carte d'école. */
export function htmlCarteEcole(l: LigneRecherche, o: OptionsCarte = {}): string {
  const forme = o.forme ?? 'colonne';
  const d = ligneDeRecherche(l, null);
  const confirmee = !!l.v;
  const vue = !!l.o;
  const morceaux: string[] = [];
  morceaux.push(
    `<span class="carte-ecole-nom">${echapper(l.n)}${l.si ? `<span class="carte-ecole-sigle"> · ${echapper(l.si)}</span>` : ''}</span>`,
  );
  if (d.niveaux) {
    const puces = lettresDesCycles(l.c)
      .map((x) => `<span class="disque disque-s c-${x}">${x}</span>`)
      .join('');
    morceaux.push(
      `<span class="carte-ecole-niveaux"><span class="carte-ecole-puces" aria-hidden="true">${puces}</span>${echapper(d.niveaux)}</span>`,
    );
  }
  const lieu = [
    `<b>${echapper(d.lieu.fort)}</b>`,
    forme === 'colonne' && d.lieu.reste ? echapper(d.lieu.reste) : '',
    forme === 'ligne' && l.r ? echapper(l.r) : '',
    o.distanceM !== undefined && o.distanceM !== null ? distanceCourte(o.distanceM) : '',
  ].filter(Boolean);
  morceaux.push(`<span class="carte-ecole-lieu">${lieu.join(' · ')}</span>`);
  if (confirmee || vue) {
    const date = l.t ? ` · ${dateCourte(l.t).replace(/ /g, ' ')}` : '';
    morceaux.push(
      `<span class="carte-ecole-preuve${confirmee ? ' carte-ecole-preuve-confirmee' : ''}">${htmlIcone(
        confirmee ? 'bouclier' : 'oeil',
      )}${confirmee ? 'Confirmée par la direction' : 'Vue sur place'}${date}</span>`,
    );
  } else {
    morceaux.push(`<span class="carte-ecole-preuve carte-ecole-preuve-faible">${echapper(d.preuveTexte)}</span>`);
  }
  const chevron = forme === 'ligne' ? '<span class="carte-ecole-chevron" aria-hidden="true">›</span>' : '';
  return (
    `<a class="carte-ecole carte-ecole-${forme}" href="${echapper(l.u)}" data-ecole="${echapper(l.i)}">` +
    vignette(l, forme, !!o.prioritaire) +
    `<span class="carte-ecole-texte">${morceaux.join('')}</span>${chevron}</a>`
  );
}
