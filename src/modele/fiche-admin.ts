/**
 * La fiche d'une école dans l'administration, v2 (lot D du ticket 165, canevas « Fiche d'école », planches admin) : ce qui
 * manque et qui peut le donner, les demandes faites, les images de l'école. Pur : ni DOM, ni réseau.
 */
import type { Valeur } from './listes';

/** Un manque : ce qui manque au site (calculé par la base, ou une demande précisée), qui peut le donner, et sa demande. */
export interface Manque {
  sujet: Valeur<'request_topic'>;
  detail: string | null;
  quiPeut: Valeur<'request_target'>[];
  demandeLe: string | null;
  demandeA: Valeur<'request_target'> | null;
  demandeId: string | null;
}

export const libelleSujetDemande: Record<Valeur<'request_topic'>, string> = {
  logo: 'Logo',
  frais: 'Frais',
  agrement: 'Agrément',
  photos: 'Photos',
  contact: 'Contact',
  admission: 'Admission',
  horaires: 'Horaires et langue',
  autre: 'Autre',
};

/** Ce qu'un relais doit faire pour un manque, prérempli dans la mission (le fondateur le corrige). */
export const tacheDuManque: Partial<Record<Valeur<'request_topic'>, string>> = {
  frais: 'Photographier le prospectus des frais, en entier.',
  photos: 'Photographier la cour et une salle vides, sans enfant.',
  contact: 'Demander le contact de la direction, avec son accord.',
  admission: 'Photographier l’affiche des inscriptions ou de l’admission.',
};

/** « Logo : demandé à l'école le 13 nov. » ; « Frais : à faire ». */
export function etatDuManque(m: Manque, dateCourte: (j: string) => string): string {
  if (m.demandeLe && m.demandeA === 'ecole')
    return `demandé à l’école le ${dateCourte(m.demandeLe)}`;
  if (m.demandeLe && m.demandeA === 'relais')
    return `confié à un relais le ${dateCourte(m.demandeLe)}`;
  return 'à faire';
}

/** Le message WhatsApp à l'école : une seule phrase, qui nomme l'école et ce qui manque ; jamais un lien privé. */
export function messageALEcole(nom: string, manques: Manque[]): string {
  const sujets = manques.map((m) =>
    m.detail ? m.detail : libelleSujetDemande[m.sujet].toLowerCase(),
  );
  const liste =
    sujets.length <= 1
      ? (sujets[0] ?? '')
      : `${sujets.slice(0, -1).join(', ')} et ${sujets.at(-1)}`;
  return `Bonjour, c’est NTanova. Pour compléter la fiche de ${nom}, pourriez-vous nous envoyer : ${liste} ? Merci.`;
}

/** Une image de l'école, vue par l'administration. */
export interface MediaAdmin {
  id: string;
  genre: Valeur<'media_kind'>;
  sujet: Valeur<'media_subject'>;
  legende: string | null;
  /** Une adresse signée, le temps de la relire (jamais publiée). */
  adresse: string | null;
  controleLe: string | null;
  publique: boolean;
  source: Valeur<'media_source'>;
}

/** Ce que l'administration envoie pour une image : déjà réduite dans le navigateur, avec sa miniature. */
export interface ImagePreparee {
  plein: Blob;
  miniature: Blob;
  mime: 'image/webp' | 'image/jpeg';
  largeur: number;
  hauteur: number;
}

export interface NouveauMedia {
  genre: Valeur<'media_kind'>;
  sujet: Valeur<'media_subject'>;
  legende: string | null;
  /** « Sans enfant ni personne reconnaissable », coché par l'administration : sans lui, rien n'est public. */
  controle: boolean;
  publique: boolean;
  /** Une photo d'un relevé (reprise telle quelle), ou un fichier envoyé. */
  photoDuReleve?: string;
  image?: ImagePreparee;
}

export const GALERIE_MAX = 12;

/** Ce qu'on peut ajouter : un logo par école, une couverture par site, douze images de galerie au plus. */
export function placesLibres(medias: MediaAdmin[]): Record<Valeur<'media_kind'>, boolean> {
  return {
    logo: !medias.some((m) => m.genre === 'logo'),
    cover: !medias.some((m) => m.genre === 'cover'),
    gallery: medias.filter((m) => m.genre === 'gallery').length < GALERIE_MAX,
  };
}

/** Une mission confiée avec ce qu'il faut faire, pourquoi, la date limite et le montant (base du 13/11, M1). */
export interface DetailsMission {
  tache: string | null;
  raison: string | null;
  avantLe: string | null;
  paieXaf: number | null;
}

/** Une nouvelle, vue par l'administration ; l'accord de l'école (qui, canal, date) reste privé. */
export interface NouvelleAdmin {
  id: string;
  genre: Valeur<'post_kind'>;
  titre: string;
  texte: string;
  publieeLe: string;
  fournieParLEcole: boolean;
  etat: Valeur<'post_state'>;
}

export interface NouvelleASaisir {
  genre: Valeur<'post_kind'>;
  titre: string;
  texte: string;
  publieeLe: string;
  fournieParLEcole: boolean;
  accord: {
    qui: Valeur<'fonction_direction'>;
    canal: 'whatsapp' | 'appel' | 'sur_place' | 'autre';
    le: string;
  } | null;
}

/** Ce qui manque à une nouvelle avant de la publier, dit près du bouton ; `null` quand elle peut partir. */
export function raisonDeNePasPublier(n: NouvelleASaisir, aujourdhui: string): string | null {
  if (!n.titre.trim() || n.titre.trim().length > 80) return 'Un titre, 80 caractères au plus.';
  if (!n.texte.trim() || n.texte.trim().length > 400) return 'Un texte, 400 caractères au plus.';
  if (!n.accord || !n.accord.le)
    return 'L’accord daté de l’école manque : sans lui, rien ne paraît.';
  if (n.accord.le > aujourdhui) return 'La date de l’accord ne peut pas être dans le futur.';
  return null;
}

export interface AdmissionASaisir {
  anneeScolaire: string;
  pieces: string[];
  ouDeposer: string | null;
  surPlaceSeulement: boolean;
  declareeLe: string;
  etapes: { etape: Valeur<'admission_step'>; debut: string; fin: string | null }[];
}

/** Une étape dont la fin précède le début ne part pas : la phrase le dit, étape par étape. */
export function erreurDuCalendrier(a: AdmissionASaisir): string | null {
  for (const e of a.etapes)
    if (e.fin && e.fin < e.debut) return 'Une étape finit avant de commencer : vérifie ses dates.';
  if (!a.anneeScolaire.trim() || !a.declareeLe)
    return 'L’année scolaire et la date où l’école l’a dit sont requises.';
  if (a.pieces.length > 10) return 'Dix pièces au plus.';
  return null;
}

// Lot F (13/11) : le détail des formations du supérieur ---------------------------------------------------------------------------

/**
 * Le détail d'une formation, dit par l'école (planche « Sup · formation ») : durée, niveau demandé, sélection, frais de
 * dossier, « Diplôme délivré par » (mot exact à confirmer auprès d'une école, choix C6). Tout est facultatif ; ce qui est
 * dit porte la date où l'école l'a dit. Mêmes règles que `set_program_details`.
 */
export interface DetailsFormation {
  dureeAnnees: number | null;
  niveauDemande: string | null;
  selection: Valeur<'selection_kind'> | null;
  fraisDossier: number | null;
  delivrePar: string | null;
  /** Le jour où l'école l'a dit ; obligatoire dès qu'un détail est rempli. */
  ditLe: string | null;
}

export interface FormationDuSuperieur {
  id: string;
  titre: string;
  cycle: Valeur<'niveau'>;
  details: DetailsFormation;
}

export const detailsVides = (): DetailsFormation => ({
  dureeAnnees: null,
  niveauDemande: null,
  selection: null,
  fraisDossier: null,
  delivrePar: null,
  ditLe: null,
});

export function sansDetail(d: DetailsFormation): boolean {
  return (
    d.dureeAnnees === null &&
    !d.niveauDemande?.trim() &&
    d.selection === null &&
    d.fraisDossier === null &&
    !d.delivrePar?.trim()
  );
}

/** Ce qui ne va pas, en une phrase, ou nul. */
export function erreurDesDetails(d: DetailsFormation, aujourdHui: string): string | null {
  if (
    d.dureeAnnees !== null &&
    !(d.dureeAnnees >= 0.5 && d.dureeAnnees <= 8 && (d.dureeAnnees * 2) % 1 === 0)
  )
    return 'La durée se dit en années, de 0,5 à 8 (par demi-année).';
  if (d.niveauDemande && d.niveauDemande.trim().length > 80)
    return 'Le niveau demandé tient en 80 caractères.';
  if (d.fraisDossier !== null && !(Number.isInteger(d.fraisDossier) && d.fraisDossier >= 0))
    return 'Les frais de dossier sont un montant en FCFA, sans virgule.';
  if (d.delivrePar && d.delivrePar.trim().length > 120)
    return '« Diplôme délivré par » tient en 120 caractères.';
  if (!sansDetail(d) && (!d.ditLe || !/^\d{4}-\d{2}-\d{2}$/.test(d.ditLe) || d.ditLe > aujourdHui))
    return 'Indique le jour où l’école l’a dit (pas une date future).';
  return null;
}

// Lot F : la preuve d'une autorisation ---------------------------------------------------------------------------------------------

/** Ce qui prouve la référence d'un agrément : la photo du document, le document vu sur place, ou l'école qui le dit. */
export type GenrePreuve = 'photo' | 'document_vu' | 'dit_ecole';

export const libelleGenrePreuve: Record<GenrePreuve, string> = {
  photo: 'Photo du document',
  document_vu: 'Document vu sur place',
  dit_ecole: 'Dit par l’école, sans document',
};

export interface PreuveAgrement {
  genre: GenrePreuve;
  /** La photo d'un relevé accepté (photo de travail). */
  photoId: string | null;
  /** Le fichier téléversé par l'administration (sous `ecoles/<site>/preuves/`), jamais public. */
  chemin: string | null;
}

/** Ce que l'admin envoie : une photo de relevé, ou un fichier à téléverser, ou rien (document vu, dit par l'école). */
export interface PreuveASaisir {
  genre: GenrePreuve;
  photoId?: string | null;
  image?: ImagePreparee | null;
}
