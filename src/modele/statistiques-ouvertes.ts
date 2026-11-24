/**
 * Les statistiques ouvertes de la page « Données » (ticket 149, décision du fondateur du 08/11/2026) : des nombres et des
 * dates, jamais un pourcentage (le nombre total d'écoles du pays est inconnu : un pourcentage serait faux). Ce que le site
 * publie déjà, compté : aucun nom d'école, aucun numéro, aucune position, rien de privé.
 *
 * Refonte publique, lot 4 (24/11/2026) : les mentions se comptent comme elles s'affichent, côte à côte (`modele/mentions.ts`).
 * Une fiche vue sur place puis confirmée compte dans les deux ; aucune n'est « la plus forte ». La date de construction, les
 * dates des mentions et la dernière modification restent trois choses distinctes ; une date absente reste absente.
 *
 * Calculées à la construction du site : le chiffre est celui du jour de la dernière mise en ligne, et la page le dit
 * (`construiteLe`). Pur : ni base, ni Astro.
 */
import { ecolesSous, lienDivision, type PageDivision } from './geo-divisions';
import { libelleNiveau } from './libelles';
import { listes, type Valeur } from './listes';
import {
  compterLesMentions,
  datesDesMentions,
  fichesParJourDeMention,
  fichesSansMentionDatee,
  jourDuCongoDe,
  type CompteDesMentions,
  type DatesDUneMention,
} from './mentions';
import type { EcolePubliee } from './ports';

export interface LigneDeLieu {
  nom: string;
  lien: string;
  /** 1 pour une ville, 2 pour un arrondissement, 3 pour un quartier : l'alinéa de la ligne. */
  profondeur: number;
  /** Les fiches publiées dans ce lieu, ce qu'il contient compris. */
  fiches: number;
}

export interface StatistiquesOuvertes {
  fiches: number;
  /** Seulement les lieux qui ont au moins une fiche : une ligne absente veut dire aucune fiche publiée. */
  lieux: LigneDeLieu[];
  /** Seulement les cycles qui ont au moins une fiche. Une fiche compte dans chaque cycle qu'elle enseigne. */
  parCycle: { niveau: Valeur<'niveau'>; libelle: string; fiches: number }[];
  /** Les quatre mentions, toujours, même à zéro : une fiche compte dans chacune des siennes. */
  mentions: CompteDesMentions;
  /** Les dates de chaque mention datée : la plus récente, la plus ancienne, et les fiches qui n'en ont pas. */
  datesDesMentions: DatesDUneMention[];
  /** Les jours où des fiches ont reçu une mention, du plus récent au plus ancien ; une fiche compte à chacun de ses jours. */
  parJour: { jour: string; fiches: number }[];
  /** Les fiches qui ne portent aucune mention datée. */
  sansMentionDatee: number;
  /** Les fiches qui montrent au moins une photo : l'enseigne, la couverture ou la galerie. */
  avecPhoto: number;
  /** Les fiches qui citent au moins une référence officielle (établissement ou filière). Ce n'est pas le nombre d'écoles agréées. */
  avecReference: number;
  derniereMiseAJour: string | null;
  /** Le jour de la construction du site, à l'heure du Congo. */
  construiteLe: string;
}

function lignesDeLieux(pages: readonly PageDivision[]): LigneDeLieu[] {
  const lignes: LigneDeLieu[] = [];
  for (const p of pages) {
    const fiches = ecolesSous(p).length;
    // Le pays et les départements n'ont pas de chemin public : leur page est `/ecoles/`, qui est déjà le total.
    if (p.chemin.length > 0 && fiches > 0) {
      lignes.push({
        nom: p.division.nom,
        lien: lienDivision(p.chemin),
        profondeur: p.chemin.length,
        fiches,
      });
    }
    lignes.push(...lignesDeLieux(p.enfants));
  }
  return lignes;
}

const plusGrand = (jours: readonly string[]): string | null =>
  jours.length > 0 ? jours.reduce((a, b) => (a > b ? a : b)) : null;

export function statistiquesOuvertes({
  racines,
  ecoles,
  construiteLe,
}: {
  racines: readonly PageDivision[];
  ecoles: readonly EcolePubliee[];
  construiteLe: Date;
}): StatistiquesOuvertes {
  return {
    fiches: ecoles.length,
    lieux: lignesDeLieux(racines),
    parCycle: listes.niveau
      .map((niveau) => ({
        niveau,
        libelle: libelleNiveau[niveau],
        fiches: ecoles.filter((e) => e.niveaux.includes(niveau)).length,
      }))
      .filter((c) => c.fiches > 0),
    mentions: compterLesMentions(ecoles),
    datesDesMentions: datesDesMentions(ecoles),
    parJour: fichesParJourDeMention(ecoles),
    sansMentionDatee: fichesSansMentionDatee(ecoles),
    // Lot 4 : une photo publique, c'est l'enseigne, la couverture ou une image de la galerie (la fiche les montre toutes).
    avecPhoto: ecoles.filter(
      (e) => !!e.photo || !!e.medias?.couverture || (e.medias?.galerie.length ?? 0) > 0,
    ).length,
    avecReference: ecoles.filter((e) => !!e.agrement || e.formations.some((f) => !!f.agrement))
      .length,
    derniereMiseAJour: plusGrand(ecoles.map((e) => jourDuCongoDe(e.misAJourLe))),
    construiteLe: jourDuCongoDe(construiteLe),
  };
}
