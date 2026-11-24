/**
 * « S'orienter » (refonte publique, lot 2) : ce que la page calcule à la construction, depuis le catalogue publié. Chaque
 * nombre est celui de la liste que son lien ouvre : il est compté par le filtre même de « Les écoles » (`filtrer`), sur le
 * fichier de recherche, et chaque école ne compte qu'une fois. Aucun lien vers une liste vide. Pur : ni DOM, ni Astro.
 *
 * Les règles des activités et des groupes, que le navigateur lit aussi, sont dans `orientation.ts`.
 */
import { filtrer, lireEtat } from './liste-ecoles';
import {
  ACTIVITES,
  GROUPES_DE_DOMAINES,
  dansUnePhrase,
  type Activite,
  type GroupeDeDomaines,
} from './orientation';
import type { DomainePublic } from './ports';
import type { LigneRecherche } from './recherche';

/**
 * Les domaines de l'annuaire et leur nom à leur création (`education_domains`, migration `20261101200300_catalogue.sql` ;
 * un test les compare). Le nom servi par le catalogue l'emporte : celui-ci ne sert que si le catalogue ne le donne pas.
 */
export const DOMAINES_DE_L_ANNUAIRE: Readonly<Record<string, string>> = {
  informatique: 'Informatique',
  gestion: 'Gestion',
  'comptabilite-finance': 'Comptabilité et finance',
  'commerce-marketing': 'Commerce et marketing',
  'secretariat-administration': 'Secrétariat et administration',
  btp: 'BTP',
  'electricite-electronique': 'Électricité et électronique',
  'mecanique-maintenance': 'Mécanique et maintenance',
  'energie-petrole-mines': 'Énergie, pétrole et mines',
  sante: 'Santé',
  'agriculture-environnement': 'Agriculture et environnement',
  'hotellerie-tourisme': 'Hôtellerie et tourisme',
  'transport-logistique': 'Transport et logistique',
  droit: 'Droit et sciences politiques',
  economie: 'Sciences économiques',
  'sciences-technologies': 'Sciences et technologies',
  'lettres-langues': 'Lettres et langues',
  communication: 'Communication et journalisme',
  'arts-mode': 'Arts, couture et mode',
  education: 'Éducation et enseignement',
  'sciences-sociales': 'Sciences sociales',
  sport: 'Sport',
  autre: 'Autre',
};

/** Ce que l'annuaire offre : les écoles (chacune une fois), leurs formations, et la liste qui les montre. */
export interface Offre {
  ecoles: number;
  formations: number;
  /** `/ecoles/?domaine=…` ; `null` sans école : jamais un lien vers une liste vide. */
  lien: string | null;
}

/** Combien d'écoles la liste « Les écoles » montre pour ce lien (`/ecoles/?…`) : son propre filtre, sans position. */
export function compterLaListe(lignes: readonly LigneRecherche[], lien: string): number {
  const requete = lien.includes('?') ? lien.slice(lien.indexOf('?') + 1) : '';
  return filtrer(lignes, lireEtat(new URLSearchParams(requete))).length;
}

/**
 * L'offre de plusieurs domaines réunis : le lien ne nomme que ceux qui ont au moins une formation (la liste ne garde pas
 * une puce cochée à 0), et ouvre leur union ; les écoles qui forment à plusieurs d'entre eux comptent une fois.
 */
export function offreDesDomaines(
  lignes: readonly LigneRecherche[],
  domaines: readonly string[],
): Offre {
  const presents = domaines.filter((d) => lignes.some((l) => l.f.some((f) => f.m === d)));
  if (presents.length === 0) return { ecoles: 0, formations: 0, lien: null };
  const lien = `/ecoles/?domaine=${presents.join(',')}`;
  const requete = lien.slice(lien.indexOf('?') + 1);
  const trouvees = filtrer(lignes, lireEtat(new URLSearchParams(requete)));
  const formations = trouvees.reduce(
    (n, t) => n + t.ligne.f.filter((f) => f.m !== undefined && presents.includes(f.m)).length,
    0,
  );
  return { ecoles: trouvees.length, formations, lien };
}

const compter = (n: number, mot: string): string =>
  `${n.toLocaleString('fr-FR')} ${mot}${n > 1 ? 's' : ''}`;

/** « 6 formations · 5 écoles », « 1 formation · 1 école » (les cartes des domaines). */
export const formationsEtEcoles = (
  o: Pick<Offre, 'ecoles' | 'formations'>,
  entre = ' · ',
): string => `${compter(o.formations, 'formation')}${entre}${compter(o.ecoles, 'école')}`;

// Le parcours scolaire --------------------------------------------------------------------------------------------------

/** Un niveau du schéma : le nombre d'écoles de sa liste, et son lien quand elle n'est pas vide. */
export interface NiveauDuParcours {
  ecoles: number;
  lien: string | null;
}

const LETTRES_DU_PARCOURS = ['M', 'P', 'C', 'L', 'T', 'S'] as const;
export type LettreDuParcours = (typeof LETTRES_DU_PARCOURS)[number];

/** Les niveaux du schéma, chacun vers `/ecoles/?niveau=X` s'il a au moins une école. */
export function niveauxDuParcours(
  lignes: readonly LigneRecherche[],
): Record<LettreDuParcours, NiveauDuParcours> {
  return Object.fromEntries(
    LETTRES_DU_PARCOURS.map((lettre) => {
      const lien = `/ecoles/?niveau=${lettre}`;
      const ecoles = compterLaListe(lignes, lien);
      return [lettre, { ecoles, lien: ecoles > 0 ? lien : null }];
    }),
  ) as Record<LettreDuParcours, NiveauDuParcours>;
}

// Les activités et les domaines -----------------------------------------------------------------------------------------

export interface DomaineDUnePiste {
  slug: string;
  nom: string;
  offre: Offre;
}

export interface ActiviteDeLaPage extends Activite {
  rang: number;
  /** « réparer un téléphone qui ne charge plus », après « Vous aimez : ». */
  phrase: string;
  pistes: DomaineDUnePiste[];
}

const nomDuDomaine = (slug: string, catalogue: readonly DomainePublic[]): string =>
  catalogue.find((d) => d.slug === slug)?.nom ?? DOMAINES_DE_L_ANNUAIRE[slug] ?? slug;

/** Les six activités, chacune avec ses pistes et l'offre de chacune (une piste sans formation n'a pas de lien). */
export function activitesDeLaPage(
  lignes: readonly LigneRecherche[],
  catalogue: readonly DomainePublic[],
): ActiviteDeLaPage[] {
  return ACTIVITES.map((a, rang) => ({
    ...a,
    rang,
    phrase: dansUnePhrase(a.texte),
    pistes: a.domaines.map((slug) => ({
      slug,
      nom: nomDuDomaine(slug, catalogue),
      offre: offreDesDomaines(lignes, [slug]),
    })),
  }));
}

export interface GroupeDeLaPage extends GroupeDeDomaines {
  offre: Offre;
}

/** Les dix grands domaines, chacun avec l'offre réunie de ses domaines. Un groupe sans formation reste, sans lien. */
export const groupesDeLaPage = (lignes: readonly LigneRecherche[]): GroupeDeLaPage[] =>
  GROUPES_DE_DOMAINES.map((g) => ({ ...g, offre: offreDesDomaines(lignes, g.domaines) }));

// Les questions des familles --------------------------------------------------------------------------------------------

/** « Je travaille : puis-je reprendre une formation ? » : le nombre d'écoles qui ont des cours du soir documentés. */
export function reponseCoursDuSoir(lignes: readonly LigneRecherche[], jour: string): string {
  const n = compterLaListe(lignes, '/ecoles/?rythme=soir');
  const debut =
    n === 0
      ? `Oui, c’est possible. Au ${jour}, aucune école de l’annuaire n’a encore de cours du soir documentés.`
      : `Oui. ${n === 1 ? '1 école' : `${n.toLocaleString('fr-FR')} écoles`} de l’annuaire ${n === 1 ? 'a' : 'ont'} des cours du soir documentés au ${jour}.`;
  return `${debut} Les conditions se demandent à chaque établissement.`;
}
