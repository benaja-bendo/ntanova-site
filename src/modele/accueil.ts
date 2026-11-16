/**
 * L'accueil du site public à trois piliers (lot 3 ; planches « Accueil » de la version 44 du canevas, validées le 15/11/2026) :
 * ce que la page calcule à la construction. Ni carte ni image au premier écran : la recherche et les villes.
 *
 * - « Où ? » : les villes qui ont au moins une école publiée, côte à côte ; dans chacune, une puce par arrondissement qui a
 *   des fiches, avec leur nombre. Un arrondissement sans fiche n'a pas de puce ; une troisième ville paraît d'elle-même.
 * - « Pour qui ? » : les niveaux d'avant le bac qui ont au moins une école, et le nombre d'établissements du supérieur.
 * - « Vues sur place récemment » : les écoles du passage le plus récent.
 *
 * Pur : ni DOM, ni Astro.
 */
import { lettresDesCycles } from './carte/cycles';
import { ecolesSous, lienDivision, type ArbrePublic, type PageDivision } from './geo-divisions';
import type { EcolePubliee } from './ports';

const collateur = new Intl.Collator('fr', { sensitivity: 'base' });

export interface LieuDeLAccueil {
  nom: string;
  /** La page du lieu : `/ecoles/pointe-noire/loandjili/`. */
  lien: string;
  /** Les écoles publiées du lieu, sous-lieux compris. */
  total: number;
}

export interface VilleDeLAccueil extends LieuDeLAccueil {
  /** Ses arrondissements (ou ses quartiers) qui ont au moins une fiche, du plus fourni au moins fourni. */
  puces: LieuDeLAccueil[];
}

const lieu = (p: PageDivision): LieuDeLAccueil => ({
  nom: p.division.nom,
  lien: lienDivision(p.chemin),
  total: ecolesSous(p).length,
});

/**
 * « Où ? » : les lieux de premier rang (villes, communes, districts : un département n'a pas de page, ticket 147) qui ont au
 * moins une école, par ordre alphabétique (Brazzaville, puis Pointe-Noire, comme sur la planche). Les puces vont du lieu le
 * plus fourni au moins fourni, puis par nom.
 */
export function villesDeLAccueil(arbre: Pick<ArbrePublic, 'racines'>): VilleDeLAccueil[] {
  return arbre.racines
    .flatMap((pays) => pays.enfants)
    .map((ville) => ({
      ...lieu(ville),
      puces: ville.enfants
        .map(lieu)
        .filter((p) => p.total > 0)
        .sort((a, b) => b.total - a.total || collateur.compare(a.nom, b.nom)),
    }))
    .filter((v) => v.total > 0)
    .sort((a, b) => collateur.compare(a.nom, b.nom));
}

/** Combien de cartes « Vues sur place récemment » : quatre, une rangée sur ordinateur. */
export const NOMBRE_VUES_RECEMMENT = 4;

/**
 * « Vues sur place récemment » : les écoles dont le passage d'un relais est le plus récent (le jour du relevé, qui ne bouge
 * pas quand l'administration publie). Une école seulement déclarée, jamais vue sur place, n'y est pas.
 */
export function vuesRecemment(
  ecoles: readonly EcolePubliee[],
  nombre = NOMBRE_VUES_RECEMMENT,
): EcolePubliee[] {
  return ecoles
    .filter((e) => !!e.releveeLe)
    .sort(
      (a, b) =>
        (b.releveeLe ?? '').localeCompare(a.releveeLe ?? '') || collateur.compare(a.nom, b.nom),
    )
    .slice(0, nombre);
}

/** « Pour mon enfant » : les niveaux d'avant le bac, avec la lettre et la couleur de leur cycle. */
const NIVEAUX_POUR_MON_ENFANT = [
  { lettre: 'M', mot: 'Maternelle' },
  { lettre: 'P', mot: 'Primaire' },
  { lettre: 'C', mot: 'Collège' },
  { lettre: 'L', mot: 'Lycée' },
] as const;

export interface NiveauDeLAccueil {
  lettre: string;
  mot: string;
  /** La liste « Écoles » filtrée sur ce cycle : `/ecoles/?niveau=M`. */
  lien: string;
}

/** Les niveaux de « Pour mon enfant » qui ont au moins une école : jamais une puce qui mène à une liste vide. */
export function niveauxDeLAccueil(ecoles: readonly EcolePubliee[]): NiveauDeLAccueil[] {
  const presentes = new Set(ecoles.flatMap((e) => [...lettresDesCycles(e.niveaux)]));
  return NIVEAUX_POUR_MON_ENFANT.filter((n) => presentes.has(n.lettre)).map((n) => ({
    ...n,
    lien: `/ecoles/?niveau=${n.lettre}`,
  }));
}

/** Les établissements du supérieur ou d'une autre formation (la lettre S) : ceux que montre `/ecoles/?niveau=S`. */
export function compterSuperieur(ecoles: readonly EcolePubliee[]): number {
  return ecoles.filter((e) => lettresDesCycles(e.niveaux).includes('S')).length;
}

/** « Voir les 3 établissements du supérieur », « Voir l'établissement du supérieur » ; rien sans établissement. */
export function lienDuSuperieur(total: number): string | null {
  if (total <= 0) return null;
  return total === 1
    ? 'Voir l’établissement du supérieur'
    : `Voir les ${total} établissements du supérieur`;
}

/** Un profil de « S'orienter » (planche « S'orienter, départ » de la version 44) et la liste qu'il ouvre. */
export interface ProfilDOrientation {
  titre: string;
  detail: string;
  lien: string;
  icone: 'livre' | 'toque' | 'mallette';
  /** La couleur du cycle de son icône. */
  lettre: 'L' | 'S' | 'T';
}

/**
 * « S'orienter », en attendant les questions du lot 5 : chaque profil de la planche ouvre la liste « Écoles » qui lui
 * correspond, et seulement s'il y trouve au moins une adresse (comme les puces de l'accueil). La liste ne filtre qu'un cycle à
 * la fois : après le BEPC, l'enseignement technique et professionnel (la lettre T) a son propre lien, pour qu'un parent ne le
 * perde pas derrière les lycées généraux.
 *
 * @param rythmes les rythmes de formation publiés (facette `rythme`) : « Je travaille » n'a de sens qu'avec le soir ou le
 * week-end.
 */
export function orientationDePassage(
  ecoles: readonly EcolePubliee[],
  rythmes: readonly string[],
): { profils: ProfilDOrientation[]; technique: string | null } {
  const presentes = new Set(ecoles.flatMap((e) => [...lettresDesCycles(e.niveaux)]));
  const rythme = (['soir', 'weekend'] as const).find((r) => rythmes.includes(r));
  const profils: ProfilDOrientation[] = [];
  if (presentes.has('L'))
    profils.push({
      titre: 'En 3e, ou j’ai le BEPC',
      detail: 'Choisir un lycée et une série',
      lien: '/ecoles/?niveau=L',
      icone: 'livre',
      lettre: 'L',
    });
  if (presentes.has('S'))
    profils.push({
      titre: 'Au lycée, ou j’ai le bac',
      detail: 'Choisir des études : BTS, licence, master',
      lien: '/ecoles/?niveau=S',
      icone: 'toque',
      lettre: 'S',
    });
  if (rythme)
    profils.push({
      titre: 'Je travaille, je veux me former',
      detail: 'Cours du soir, du week-end, formations courtes',
      lien: `/ecoles/?rythme=${rythme}`,
      icone: 'mallette',
      lettre: 'T',
    });
  return { profils, technique: presentes.has('T') ? '/ecoles/?niveau=T' : null };
}
