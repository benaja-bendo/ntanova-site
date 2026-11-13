/**
 * La fiche d'une école, version 2 (canevas « Site NTanova », page « Fiche d'école », 12/11/2026 ; base du 13/11, M3 à M8).
 * Pur : ni DOM, ni Astro. Chaque fonction dit ce que la page écrit, et surtout ce qu'elle tait : une rubrique sans donnée
 * n'existe pas (ni bloc vide, ni lien dans la barre des rubriques), une date passée ne s'annonce plus.
 */
import type { FraisEcole } from './frais-ecole';
import { libelleNiveau } from './libelles';
import { cycleLePlusEleve } from './carte/cycles';
import type { Valeur } from './listes';
import type { EcolePubliee } from './ports';

// Les données ------------------------------------------------------------------------------------------------------------

/** Une image publique d'une école (logo, couverture ou galerie), contrôlée par l'administration. */
export interface MediaPublic {
  id: string;
  sujet: Valeur<'media_subject'>;
  legende: string | null;
  prisLe: string | null;
}

export interface MediasEcole {
  logo: MediaPublic | null;
  couverture: MediaPublic | null;
  galerie: MediaPublic[];
}

export const mediasVides = (): MediasEcole => ({ logo: null, couverture: null, galerie: [] });

/** Une nouvelle publiée par l'administration, avec l'accord daté de l'école (gardé en privé). */
export interface NouvellePublique {
  id: string;
  genre: Valeur<'post_kind'>;
  titre: string;
  texte: string;
  publieeLe: string;
  /** « Nouvelle de l'école » si l'école l'a fournie ; sinon « Nouvelle », jamais « publiée par l'école ». */
  fournieParLEcole: boolean;
  media: MediaPublic | null;
}

export interface EtapeAdmission {
  etape: Valeur<'admission_step'>;
  debut: string;
  fin: string | null;
}

/** L'admission d'un site du supérieur, pour une année : pièces, où déposer, calendrier. */
export interface AdmissionPublique {
  anneeScolaire: string;
  pieces: string[];
  ouDeposer: string | null;
  surPlaceSeulement: boolean;
  declareeLe: string;
  etapes: EtapeAdmission[];
}

// Les images servies par le site ---------------------------------------------------------------------------------------

/**
 * Chaque image publique est réduite à la construction (sharp), à la taille de son usage : la page ne charge jamais une
 * photo plus grande que sa place. Les budgets tiennent une fiche complète (couverture, logo, trois vignettes, deux
 * nouvelles) sous 200 Ko avec son HTML, sa feuille de style et ses trois polices.
 */
export const FORMATS_MEDIA = {
  couverture: { largeur: 720, hauteur: 300, budget: 28 * 1024 },
  vignette: { largeur: 400, hauteur: 300, budget: 10 * 1024 },
  logo: { largeur: 152, hauteur: 152, budget: 6 * 1024 },
} as const;
export type FormatMedia = keyof typeof FORMATS_MEDIA;
export const cheminMedia = (m: Pick<MediaPublic, 'id'>, format: FormatMedia): string =>
  `/medias/${m.id}-${format}.webp`;

/** La fiche montre au plus trois vignettes ; au-delà, « Voir les N » mène à la page des photos. */
export const VIGNETTES_SUR_LA_FICHE = 3;

// Ce que la fiche écrit ------------------------------------------------------------------------------------------------

export const estDuSuperieur = (e: Pick<EcolePubliee, 'niveaux'>): boolean =>
  e.niveaux.length > 0 && e.niveaux.every((n) => n === 'superieur' || n === 'technique');

/**
 * Le rond de l'école : son logo ; sinon son sigle dans un cercle vert foncé (décision du 12/11) ; sinon la lettre du
 * cycle le plus élevé, dans sa couleur, comme aujourd'hui ; sinon un disque gris, sans lettre.
 */
export type RondEcole =
  | { genre: 'logo'; media: MediaPublic }
  | { genre: 'sigle'; texte: string }
  | { genre: 'cycle'; lettre: string }
  | { genre: 'vide' };

export function rondDeLEcole(e: Pick<EcolePubliee, 'medias' | 'sigle' | 'niveaux'>): RondEcole {
  if (e.medias?.logo) return { genre: 'logo', media: e.medias.logo };
  const sigle = e.sigle?.trim();
  if (sigle) return { genre: 'sigle', texte: sigle };
  const lettre = cycleLePlusEleve(e.niveaux)?.lettre;
  return lettre ? { genre: 'cycle', lettre } : { genre: 'vide' };
}

/** « Maternelle à collège » : le premier et le dernier niveau du site, ou le seul. */
export function etendueDesNiveaux(niveaux: Valeur<'niveau'>[]): string | null {
  if (niveaux.length === 0) return null;
  const premier = libelleNiveau[niveaux[0]!];
  if (niveaux.length === 1) return premier;
  return `${premier} à ${libelleNiveau[niveaux[niveaux.length - 1]!].toLowerCase()}`;
}

/**
 * La ligne sous le nom : « Site 1 · Maternelle à collège · CSLP · depuis 2012 ». Chaque morceau absent disparaît, sans
 * laisser de point ni de crochet ; le nom du site (« Campus du centre ») passe devant quand il existe.
 */
export function ligneDIdentite(
  e: Pick<EcolePubliee, 'etiquette' | 'niveaux' | 'sigle' | 'fondeeEn'>,
  nombreDeSites: number,
): string {
  return [
    nombreDeSites > 1 ? e.etiquette : null,
    etendueDesNiveaux(e.niveaux),
    e.sigle?.trim() || null,
    e.fondeeEn ? `depuis ${e.fondeeEn}` : null,
  ]
    .filter((x): x is string => !!x)
    .join(' · ');
}

/** Le site web, sans « https:// » ni barre finale : ce qu'on lit et recopie. */
export const siteWebLisible = (url: string): string =>
  url.replace(/^https:\/\//, '').replace(/\/$/, '');

/** Une nouvelle d'événement dont la date est passée depuis plus de 60 jours sort de la page ; les trois plus récentes restent. */
export function nouvellesAMontrer(
  nouvelles: NouvellePublique[],
  aujourdhui: string,
): NouvellePublique[] {
  const limite = decaler(aujourdhui, -60);
  return [...nouvelles]
    .filter((n) => n.publieeLe <= aujourdhui && (n.genre !== 'evenement' || n.publieeLe >= limite))
    .sort((a, b) => b.publieeLe.localeCompare(a.publieeLe) || a.id.localeCompare(b.id))
    .slice(0, 3);
}

export const surtitreNouvelle = (n: Pick<NouvellePublique, 'fournieParLEcole'>): string =>
  n.fournieParLEcole ? 'Nouvelle de l’école' : 'Nouvelle';

/** Un jour décalé de `jours` (format AAAA-MM-JJ, sans fuseau). */
export function decaler(jour: string, jours: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

const joursEntre = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/** Où en est une étape : passée, en cours (aujourd'hui entre son début et sa fin), à venir. */
export type EtatEtape = 'passee' | 'en_cours' | 'a_venir';

export function etatDeLEtape(etape: EtapeAdmission, aujourdhui: string): EtatEtape {
  if (aujourdhui < etape.debut) return 'a_venir';
  const fin = etape.fin ?? etape.debut;
  return aujourdhui <= fin ? 'en_cours' : 'passee';
}

/**
 * Le calendrier qu'on montre : vide quand toutes ses étapes sont passées (l'admission de cette année est finie, la fiche ne
 * la rappelle plus). Le site se reconstruit chaque semaine au moins : l'état est vrai au jour de la construction.
 */
export function calendrierAMontrer(a: AdmissionPublique | null | undefined, aujourdhui: string) {
  if (!a) return [];
  const etapes = [...a.etapes].sort((x, y) => x.debut.localeCompare(y.debut));
  if (etapes.length > 0 && etapes.every((x) => etatDeLEtape(x, aujourdhui) === 'passee')) return [];
  return etapes.map((x) => ({ ...x, etat: etatDeLEtape(x, aujourdhui) }));
}

/** « Dossiers ouverts jusqu'au … » : seulement pendant la période, avec le nombre de jours qui restent. */
export function dossiersOuverts(
  a: AdmissionPublique | null | undefined,
  aujourdhui: string,
): { jusquau: string; joursRestants: number } | null {
  const dossiers = a?.etapes.find((x) => x.etape === 'dossiers');
  if (!dossiers?.fin || etatDeLEtape(dossiers, aujourdhui) !== 'en_cours') return null;
  return { jusquau: dossiers.fin, joursRestants: joursEntre(aujourdhui, dossiers.fin) };
}

/** Une admission dont il ne reste rien à dire (aucune pièce, aucun lieu, calendrier fini) ne paraît pas. */
export function admissionAMontrer(
  a: AdmissionPublique | null | undefined,
  aujourdhui: string,
): boolean {
  if (!a) return false;
  const calendrier = calendrierAMontrer(a, aujourdhui);
  if (a.etapes.length > 0 && calendrier.length === 0) return false;
  return calendrier.length > 0 || a.pieces.length > 0 || !!a.ouDeposer || a.surPlaceSeulement;
}

// Les frais ------------------------------------------------------------------------------------------------------------

/**
 * Une ligne de frais : la classe quand elle est dite (« CP1 à CM2 »), sinon le cycle. Le site ne montre que les lignes
 * publiées par l'administration : une ligne « illisible » n'existe pas dans la base, elle est une demande.
 */
export const libelleLigneDeFrais = (f: Pick<FraisEcole, 'classe' | 'cycle'>): string =>
  f.classe?.trim() || libelleNiveau[f.cycle];

/** Les lignes de l'école (hors formations du supérieur), du plus petit cycle au plus grand, puis par classe. */
export function lignesDeFraisDeLEcole(frais: FraisEcole[]): FraisEcole[] {
  const ordre = [
    'creche',
    'maternelle',
    'primaire',
    'college',
    'lycee',
    'technique',
    'superieur',
    'autre',
  ];
  return frais
    .filter((f) => !f.formationId)
    .sort(
      (a, b) =>
        ordre.indexOf(a.cycle) - ordre.indexOf(b.cycle) ||
        (a.classe ?? '').localeCompare(b.classe ?? '', 'fr', { numeric: true }),
    );
}

/** L'inscription : une seule somme si toutes les lignes ont la même, sinon une fourchette « selon le cycle ». */
export function inscriptionDesFrais(frais: FraisEcole[]): { min: number; max: number } | null {
  const sommes = frais.map((f) => f.inscription).filter((x): x is number => x !== null);
  if (sommes.length === 0) return null;
  return { min: Math.min(...sommes), max: Math.max(...sommes) };
}

/** La date la plus récente des lignes, et si toutes viennent de l'école sans photo (« dit par l'école »). */
export function sourceDesFrais(
  frais: FraisEcole[],
): { declaresLe: string; surProspectus: boolean } | null {
  if (frais.length === 0) return null;
  const declaresLe = frais
    .map((f) => f.declaresLe)
    .sort()
    .at(-1)!;
  return { declaresLe, surProspectus: frais.every((f) => f.preuve === 'prospectus') };
}

/** Une année scolaire commune à toutes les lignes, ou rien. */
export function anneeDesFrais(frais: FraisEcole[]): string | null {
  const annees = new Set(frais.map((f) => f.anneeScolaire));
  return annees.size === 1 ? ([...annees][0] ?? null) : null;
}

// Les rubriques --------------------------------------------------------------------------------------------------------

export interface Rubrique {
  ancre: string;
  titre: string;
}

/**
 * La barre des rubriques : des ancres de la même page (site statique). Seules celles qui ont un contenu y sont ; avec
 * moins de deux, la barre disparaît.
 */
export function rubriquesDeLaFiche(presentes: {
  ecole: boolean;
  formations: boolean;
  admission: boolean;
  photos: boolean;
  frais: boolean;
  nouvelles: boolean;
}): Rubrique[] {
  const toutes: [keyof typeof presentes, Rubrique][] = [
    ['formations', { ancre: 'formations', titre: 'Formations' }],
    ['admission', { ancre: 'admission', titre: 'Admission' }],
    ['ecole', { ancre: 'ecole', titre: 'L’école' }],
    ['photos', { ancre: 'photos', titre: 'Photos' }],
    ['frais', { ancre: 'frais', titre: 'Frais' }],
    ['nouvelles', { ancre: 'nouvelles', titre: 'Nouvelles' }],
  ];
  const r = toutes.filter(([cle]) => presentes[cle]).map(([, x]) => x);
  return r.length >= 2 ? r : [];
}

/**
 * Une fiche « courte » : rien d'autre que le nom, les niveaux et le lieu. Elle porte une seule carte sobre en bas,
 * « Vous êtes de l'école ? » (décision du fondateur du 13/11), au lieu de blocs vides.
 */
export function ficheCourte(e: EcolePubliee): boolean {
  return (
    !e.motDirection &&
    !e.contactPublic &&
    !e.numeroEnseigne &&
    !e.siteWeb &&
    (e.frais ?? []).length === 0 &&
    (e.equipements ?? []).length === 0 &&
    (e.nouvelles ?? []).length === 0 &&
    !e.medias?.couverture &&
    !e.photo &&
    (e.medias?.galerie ?? []).length === 0 &&
    e.formations.length === 0 &&
    !e.admission
  );
}
