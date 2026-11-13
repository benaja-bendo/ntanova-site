/**
 * La paie des relais : les dates et les montants, tels que l'administration les lit. Le calcul de ce qui est
 * dû est fait par la base (`payout_preview`), qui est la seule source : ici, rien que de l'affichage.
 */

import type { Valeur } from './listes';
import type { LigneDeFacture } from './ports';

/** Le fuseau de Brazzaville et de Pointe-Noire (UTC+1, pas d'heure d'été) : la semaine se clôt là-bas. */
const FUSEAU = 'Africa/Brazzaville';

/** Le jour (AAAA-MM-JJ) à Brazzaville pour un instant donné. */
export function jourABrazzaville(instant: Date): string {
  const parties = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return parties; // en-CA écrit AAAA-MM-JJ
}

/** Le vendredi de la semaine en cours : aujourd'hui s'il l'est, sinon le prochain (comme la base). */
export function prochainVendredi(instant = new Date()): string {
  const [a = 0, m = 1, j = 1] = jourABrazzaville(instant).split('-').map(Number);
  const jourUtc = new Date(Date.UTC(a, m - 1, j));
  const decalage = (5 - jourUtc.getUTCDay() + 7) % 7; // 5 = vendredi
  jourUtc.setUTCDate(jourUtc.getUTCDate() + decalage);
  return jourUtc.toISOString().slice(0, 10);
}

/** Est-ce un vendredi ? (La base refuse une clôture un autre jour.) */
export function estUnVendredi(jour: string): boolean {
  const [a = 0, m = 1, j = 1] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay() === 5;
}

/** « 1 500 FCFA », avec des espaces insécables : le montant ne se coupe pas en fin de ligne. */
export function francs(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(montant).replace(/[\u202f\u00a0\s]/g, '\u00a0')}\u00a0FCFA`;
}

/** « vendredi 6 novembre » */
export function vendrediLong(jour: string): string {
  const [a = 0, m = 1, j = 1] = jour.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, j)));
}

// « Ma paie » : ce que le relais lit de sa propre paie (ticket #55) -----------------------------------------------------

const s = (n: number) => (n > 1 ? 's' : '');

/** Ce qui compte dans une ligne de paie, en clair : « 3 fiches acceptées », « 1 contact de direction confirmé »… */
export function detailDeLaPaie(ligne: {
  fiches: number;
  contacts: number;
  essais: number;
  missions?: number;
}): string[] {
  const lignes: string[] = [];
  if (ligne.fiches > 0)
    lignes.push(`${ligne.fiches} fiche${s(ligne.fiches)} acceptée${s(ligne.fiches)}`);
  const missions = ligne.missions ?? 0;
  if (missions > 0) lignes.push(`${missions} mission${s(missions)} faite${s(missions)}`);
  if (ligne.contacts > 0) {
    lignes.push(
      `${ligne.contacts} contact${s(ligne.contacts)} de direction confirmé${s(ligne.contacts)}`,
    );
  }
  if (ligne.essais > 0) lignes.push('L’essai validé');
  return lignes;
}

export interface CompteDesFiches {
  envoyees: number;
  acceptees: number;
  enAttente: number;
  aCorriger: number;
  refusees: number;
}

/**
 * Combien de fiches le relais a envoyées à NTanova, et ce qu'elle en a fait. Une correction n'est pas une fiche de plus :
 * la fiche qu'elle corrige est celle qui compte (et qui se paie).
 */
export function compteDesFiches(
  releves: readonly { statut: Valeur<'statut_releve'>; type?: Valeur<'type_releve'> }[],
): CompteDesFiches {
  const fiches = releves.filter((r) => r.type !== 'correction');
  const de = (statut: Valeur<'statut_releve'>) => fiches.filter((r) => r.statut === statut).length;
  return {
    envoyees: fiches.length,
    acceptees: de('accepte'),
    enAttente: de('a_valider'),
    aCorriger: de('a_corriger'),
    refusees: de('refuse'),
  };
}

// Lot F (13/11) : la paie comme une facture claire, « N × tarif = sous-total » ----------------------------------------------------

/** Une ligne de facture, prête à écrire : « 2 fiches acceptées », « 2 × 500 FCFA », « 1 000 FCFA ». */
export interface LigneEcrite {
  libelle: string;
  /** « 2 × 500 FCFA » ; nul quand la base n'a pas dit le tarif (paie gardée avant la mise à jour). */
  calcul: string | null;
  sousTotal: number | null;
}

const libelleDeLaLigne = (genre: LigneDeFacture['genre'], n: number): string =>
  genre === 'fiche'
    ? `${n} fiche${s(n)} acceptée${s(n)}`
    : genre === 'mission'
      ? `${n} mission${s(n)} faite${s(n)}`
      : genre === 'contact'
        ? `${n} contact${s(n)} de direction confirmé${s(n)}`
        : 'L’essai validé';

/**
 * Les lignes de la paie, façon facture : une par genre et par tarif, dans l'ordre fiches, missions, contacts, essai. Sans
 * le détail de la base (paie gardée par le téléphone avant la mise à jour), les quantités seules, comme avant.
 */
export function factureDeLaPaie(ligne: {
  fiches: number;
  contacts: number;
  essais: number;
  missions?: number;
  lignes?: readonly LigneDeFacture[];
}): LigneEcrite[] {
  if (!ligne.lignes)
    return detailDeLaPaie(ligne).map((libelle) => ({ libelle, calcul: null, sousTotal: null }));
  const ordre: LigneDeFacture['genre'][] = ['fiche', 'mission', 'contact', 'essai'];
  return [...ligne.lignes]
    .filter((l) => l.nombre > 0)
    .sort((a, b) => ordre.indexOf(a.genre) - ordre.indexOf(b.genre) || b.tarifXaf - a.tarifXaf)
    .map((l) => ({
      libelle: libelleDeLaLigne(l.genre, l.nombre),
      calcul: l.genre === 'essai' && l.nombre === 1 ? null : `${l.nombre} × ${francs(l.tarifXaf)}`,
      sousTotal: l.nombre * l.tarifXaf,
    }));
}

/** Ce qu'une fiche rapporte, d'après la paie : acquis pour vendredi, à payer, ou payé. Nul si elle n'est dans aucune ligne. */
export interface PaieDUneFiche {
  montantXaf: number;
  etat: 'acquis' | 'a_payer' | 'paye';
  vendredi: string;
  payeLe: string | null;
  /** « fiche » : la fiche elle-même ; « mission » : la mission qu'elle ferme ; « contact » : le contact confirmé. */
  genres: LigneDeFacture['genre'][];
}

export function paieDeLaFiche(
  paie: {
    acquis: {
      vendredi: string;
      etat: 'acquis' | 'a_payer' | 'paye';
      payeLe: string | null;
      lignes?: readonly LigneDeFacture[];
    };
    historique: readonly {
      vendredi: string;
      etat: 'acquis' | 'a_payer' | 'paye';
      payeLe: string | null;
      lignes?: readonly LigneDeFacture[];
    }[];
  },
  releveId: string,
): PaieDUneFiche | null {
  for (const semaine of [paie.acquis, ...paie.historique]) {
    const siennes = (semaine.lignes ?? []).filter((l) => l.fiches.includes(releveId));
    if (siennes.length === 0) continue;
    return {
      montantXaf: siennes.reduce((t, l) => t + l.tarifXaf, 0),
      etat: semaine.etat,
      vendredi: semaine.vendredi,
      payeLe: semaine.payeLe,
      genres: siennes.map((l) => l.genre),
    };
  }
  return null;
}
