/**
 * L'accueil du site public : ce que la page calcule à la construction, depuis le catalogue publié. Aucun nombre, aucune ville
 * ni aucune date n'est écrit à la main : une ville paraît dès qu'elle a une fiche, un niveau dès qu'une école l'enseigne.
 *
 * Refonte publique, lot 1 (24/11/2026 ; canevas « Accueil : trois directions », exploration « Points de repère ») :
 * - « Par niveau » : les six cycles qui ont au moins une école ;
 * - « S'orienter, à chaque étape » : cinq situations, chacune vers la liste qui lui répond, avec son nombre d'écoles ;
 * - « Par ville » et le pied de page : les villes qui ont des fiches, leurs arrondissements, leur dessin quand il existe.
 * Remplace « Pour mon enfant » (quatre niveaux), le compte du supérieur et « Vues sur place récemment » du lot 3 (15/11).
 *
 * Pur : ni DOM, ni Astro.
 */
import { lettresDesCycles } from './carte/cycles';
import {
  compterEcoles,
  ecolesSous,
  lienDivision,
  type ArbrePublic,
  type PageDivision,
} from './geo-divisions';
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
  /** Le dessin de la ville (canevas du 23/11), quand il existe ; une ville nouvelle n'en a pas. */
  dessin: string | null;
}

/** Les villes dessinées pour l'accueil (dessins originaux du canevas, 23/11/2026), par l'adresse de leur page. */
const DESSINS_DES_VILLES: Readonly<Record<string, string>> = {
  brazzaville: '/dessins/ville-brazzaville.svg',
  'pointe-noire': '/dessins/ville-pointe-noire.svg',
  ouesso: '/dessins/ville-ouesso.svg',
};

const lieu = (p: PageDivision): LieuDeLAccueil => ({
  nom: p.division.nom,
  lien: lienDivision(p.chemin),
  total: ecolesSous(p).length,
});

/**
 * Les lieux de premier rang (villes, communes, districts : un département n'a pas de page, ticket 147) qui ont au moins une
 * école, par ordre alphabétique. Leurs arrondissements vont du plus fourni au moins fourni, puis par nom.
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
      dessin: DESSINS_DES_VILLES[ville.division.slug] ?? null,
    }))
    .filter((v) => v.total > 0)
    .sort((a, b) => collateur.compare(a.nom, b.nom));
}

/** « Bacongo, Makélékélé… » : les deux arrondissements les plus fournis, et des points de suite s'il y en a d'autres. */
export function arrondissementsCites(ville: Pick<VilleDeLAccueil, 'puces'>, nombre = 2): string {
  const noms = ville.puces.slice(0, nombre).map((p) => p.nom);
  return noms.length === 0 ? '' : `${noms.join(', ')}${ville.puces.length > nombre ? '…' : ''}`;
}

/** « 24/11 » : le jour où l'annuaire a été construit, écrit court à côté d'un nombre. */
export function jourEtMois(jour: string): string {
  const [, mois, j] = jour.split('-');
  return `${j}/${mois}`;
}

/** Le lien du repère « Trouver une école » : le nombre de l'annuaire, jamais « toutes les écoles ». */
export function voirLesEcoles(total: number): string {
  if (total <= 0) return 'Voir la liste';
  return total === 1 ? 'Voir l’école' : `Voir les ${total.toLocaleString('fr-FR')} écoles`;
}

/** « Par niveau » : les six cycles, dans l'ordre des puces de « Les écoles ». */
const NIVEAUX_DE_L_ACCUEIL = [
  { lettre: 'M', mot: 'Maternelle' },
  { lettre: 'P', mot: 'Primaire' },
  { lettre: 'C', mot: 'Collège' },
  { lettre: 'L', mot: 'Lycée' },
  { lettre: 'T', mot: 'Technique' },
  { lettre: 'S', mot: 'Supérieur' },
] as const;

export interface NiveauDeLAccueil {
  lettre: string;
  mot: string;
  /** La liste « Écoles » filtrée sur ce cycle : `/ecoles/?niveau=M`. */
  lien: string;
}

const lettresPresentes = (ecoles: readonly EcolePubliee[]) =>
  new Set(ecoles.flatMap((e) => [...lettresDesCycles(e.niveaux)]));

/** Les niveaux qui ont au moins une école : jamais un lien qui mène à une liste vide. */
export function niveauxDeLAccueil(ecoles: readonly EcolePubliee[]): NiveauDeLAccueil[] {
  const presentes = lettresPresentes(ecoles);
  return NIVEAUX_DE_L_ACCUEIL.filter((n) => presentes.has(n.lettre)).map((n) => ({
    ...n,
    lien: `/ecoles/?niveau=${n.lettre}`,
  }));
}

/** Une situation de « S'orienter, à chaque étape » et la liste qu'elle ouvre, avec le nombre d'écoles qu'on y trouve. */
export interface ProfilDeLAccueil {
  titre: string;
  detail: string;
  lien: string;
  /** « 12 écoles » : celles que la liste montre. */
  compte: string;
}

/**
 * « Où en êtes-vous ? » : cinq situations, chacune vers la liste « Les écoles » qui lui répond (plusieurs niveaux à la fois
 * s'additionnent, `niveau=M,P`). Une situation sans école n'est pas proposée. « Je travaille » suit le rythme publié : le
 * soir d'abord, sinon le week-end. Les activités de la future page S'orienter (lot 2) n'y sont pas.
 */
export function profilsDeLAccueil(ecoles: readonly EcolePubliee[]): ProfilDeLAccueil[] {
  const avec = (lettres: readonly string[]) =>
    ecoles.filter((e) => [...lettresDesCycles(e.niveaux)].some((l) => lettres.includes(l))).length;
  const profils: ProfilDeLAccueil[] = [];
  const ajouter = (titre: string, detail: string, lien: string, total: number) => {
    if (total > 0) profils.push({ titre, detail, lien, compte: compterEcoles(total) });
  };
  ajouter(
    'Mon enfant entre à l’école',
    'Maternelle, primaire',
    '/ecoles/?niveau=M,P',
    avec(['M', 'P']),
  );
  ajouter('Après le CM2', 'Le collège', '/ecoles/?niveau=C', avec(['C']));
  ajouter('En 3e, ou j’ai le BEPC', 'Le lycée et ses séries', '/ecoles/?niveau=L', avec(['L']));
  ajouter('Au lycée, ou j’ai le bac', 'BTS, licence, master', '/ecoles/?niveau=S', avec(['S']));
  for (const [rythme, detail] of [
    ['soir', 'Les cours du soir'],
    ['weekend', 'Les cours du week-end'],
  ] as const) {
    const total = ecoles.filter((e) => e.formations.some((f) => f.rythmes.includes(rythme))).length;
    if (total === 0) continue;
    ajouter('Je travaille, je veux me former', detail, `/ecoles/?rythme=${rythme}`, total);
    break;
  }
  return profils;
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
