/**
 * Les statistiques ouvertes de la page « Données » (ticket 149, décision du fondateur du 08/11/2026) : des nombres et des
 * dates, jamais un pourcentage (le nombre total d'écoles du pays est inconnu : un pourcentage serait faux). Ce que le site
 * publie déjà, compté : aucun nom d'école, aucun numéro, aucune position, rien de privé.
 *
 * Calculées à la construction du site : le chiffre est celui du jour de la dernière mise en ligne, et la page le dit
 * (`construiteLe`). Pur : ni base, ni Astro.
 */
import { ecolesSous, lienDivision, type PageDivision } from './geo-divisions';
import { libelleNiveau, libelleProvenance, provenanceDe, type Provenance } from './libelles';
import { listes, type Valeur } from './listes';
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
  /** Les quatre preuves, toujours, même à zéro : c'est le vocabulaire de la page Méthode. */
  parPreuve: { preuve: Provenance; libelle: string; fiches: number }[];
  /** Le jour de la preuve la plus forte de chaque fiche, du plus récent au plus ancien. */
  parJour: { jour: string; fiches: number }[];
  preuveLaPlusRecente: string | null;
  preuveLaPlusAncienne: string | null;
  /** Les fiches dont la preuve n'a pas de jour connu. */
  sansDate: number;
  avecPhoto: number;
  /** Les fiches qui citent au moins une référence officielle (établissement ou filière). Ce n'est pas le nombre d'écoles agréées. */
  avecReference: number;
  derniereMiseAJour: string | null;
  /** Le jour de la construction du site, à l'heure du Congo. */
  construiteLe: string;
}

const FORMAT_JOUR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Brazzaville',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Un jour `AAAA-MM-JJ` à l'heure du Congo, d'un jour déjà écrit ou d'un instant. */
function jourDuCongoDe(valeur: string | Date): string {
  if (typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur;
  return FORMAT_JOUR.format(new Date(valeur));
}

type Fiche = Pick<
  EcolePubliee,
  'etat' | 'origine' | 'verifieeLe' | 'releveeLe' | 'situeeLe' | 'declareeLe'
>;

/** Le jour de la preuve la plus forte de la fiche, dans l'ordre de `provenanceDe` ; rien quand la base ne le sait pas. */
function jourDeLaPreuve(e: Fiche): string | null {
  const jour = {
    verifiee: e.verifieeLe,
    relevee: e.releveeLe,
    declaree: e.declareeLe ?? null,
    ajoutee: e.situeeLe,
  }[provenanceDe(e)];
  return jour ? jourDuCongoDe(jour) : null;
}

const PREUVES: readonly Provenance[] = ['verifiee', 'relevee', 'declaree', 'ajoutee'];

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
const plusPetit = (jours: readonly string[]): string | null =>
  jours.length > 0 ? jours.reduce((a, b) => (a < b ? a : b)) : null;

export function statistiquesOuvertes({
  racines,
  ecoles,
  construiteLe,
}: {
  racines: readonly PageDivision[];
  ecoles: readonly EcolePubliee[];
  construiteLe: Date;
}): StatistiquesOuvertes {
  const jours = ecoles.map(jourDeLaPreuve);
  const datees = jours.filter((j): j is string => j !== null);
  const parJour = new Map<string, number>();
  for (const j of datees) parJour.set(j, (parJour.get(j) ?? 0) + 1);

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
    parPreuve: PREUVES.map((preuve) => ({
      preuve,
      libelle: libelleProvenance[preuve],
      fiches: ecoles.filter((e) => provenanceDe(e) === preuve).length,
    })),
    parJour: [...parJour.entries()]
      .map(([jour, fiches]) => ({ jour, fiches }))
      .sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0)),
    preuveLaPlusRecente: plusGrand(datees),
    preuveLaPlusAncienne: plusPetit(datees),
    sansDate: jours.length - datees.length,
    avecPhoto: ecoles.filter((e) => !!e.photo).length,
    avecReference: ecoles.filter((e) => !!e.agrement || e.formations.some((f) => !!f.agrement))
      .length,
    derniereMiseAJour: plusGrand(ecoles.map((e) => jourDuCongoDe(e.misAJourLe))),
    construiteLe: jourDuCongoDe(construiteLe),
  };
}
