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
 * soir d'abord, sinon le week-end. La page S'orienter (refonte, lot 2) reprend ces cinq situations, avec les mêmes nombres.
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
