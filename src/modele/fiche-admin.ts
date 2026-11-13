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
