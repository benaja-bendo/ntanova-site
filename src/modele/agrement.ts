/**
 * L'agrément d'une école ou d'une filière (ticket 148) : la référence d'un document officiel, saisie par l'administration seule
 * après l'avoir vu. Sans référence en base, la fiche n'écrit rien du tout. Cette ligne cite un document : elle n'est ni un badge,
 * ni une garantie de NTanova. Les règles sont les mêmes que celles de la base (`set_campus_accreditation`).
 */
import { dateDeclareeValide, jourDuCongo } from './date-declaration';
import { libelleGenreAgrement } from './libelles';
import { listes, type Valeur } from './listes';
import { dateLongue } from './pointe-noire';

export interface AgrementPublic {
  genre: Valeur<'accreditation_kind'>;
  /** L'intitulé écrit sur le document, quand la liste ne le connaît pas (`autre`). */
  precision: string | null;
  /** Telle qu'elle est écrite sur le document : « arrêté n° [référence] ». */
  reference: string;
  /** Ticket 205 (A22) : nulle seulement quand l'agrément est cité par l'école, sans document vu. */
  delivreLe: string | null;
  /** Où se trouve le document, en mots : toujours renseigné, même sans lien. */
  sourceTexte: string;
  sourceLien: string | null;
  /** Lot F : comment NTanova connaît la référence (la page dit « vue sur le document » ou « dite par l'école »). */
  preuve?: 'photo' | 'document_vu' | 'dit_ecole' | null;
}

export interface AgrementASaisir extends AgrementPublic {
  /** Nul : l'établissement. Sinon, la filière concernée. */
  formationId: string | null;
  /** Le jour où NTanova a vu le document : jamais publié. */
  controleLe: string;
}

export interface AgrementEnregistre extends AgrementASaisir {
  id: string;
  /** Lot F : la preuve, avec sa photo ou son fichier (jamais publics). */
  preuveDetail?: import('./fiche-admin').PreuveAgrement | null;
}

/** Lot F : ce que la page publique ajoute à la référence, jamais « reconnue par l'État ». */
export function preuveEnMots(preuve: AgrementPublic['preuve']): string | null {
  if (preuve === 'photo' || preuve === 'document_vu') return 'vue sur le document';
  if (preuve === 'dit_ecole') return 'dite par l’école, document pas encore vu';
  return null;
}

export const LIEN_HTTPS = /^https:\/\/\S+$/;

export function lireAgrement(
  s: {
    formationId: string;
    genre: string;
    precision: string;
    reference: string;
    delivreLe: string;
    sourceTexte: string;
    sourceLien: string;
    controleLe: string;
    /**
     * Ticket 205 (A22) : sur quoi l'agrément a été vu. Le document (sa date est obligatoire) ou l'école qui le cite (la date
     * est facultative) ; « photo » : la preuve déjà jointe, que la modification ne change pas.
     */
    preuve: string;
  },
  aujourdHui = jourDuCongo(),
): { agrement: AgrementASaisir | null; erreur: string | null } {
  const reference = s.reference.trim();
  const sourceTexte = s.sourceTexte.trim();
  const sourceLien = s.sourceLien.trim();
  const genre = s.genre as Valeur<'accreditation_kind'>;
  const precision = genre === 'autre' ? s.precision.trim() : '';
  const cite = s.preuve === 'dit_ecole';
  const sansDate = cite && !s.delivreLe;
  let erreur: string | null = null;
  if (!listes.accreditation_kind.includes(genre)) erreur = 'Choisis l’intitulé du document.';
  else if (genre === 'autre' && (!precision || precision.length > 80))
    erreur = 'Précise l’intitulé écrit sur le document (80 caractères au plus).';
  else if (!reference || reference.length > 160)
    erreur = 'Recopie la référence écrite sur le document (160 caractères au plus).';
  else if (!s.preuve) erreur = 'Dis sur quoi tu l’as vu : le document, ou l’école qui le cite.';
  else if (!sansDate && !dateDeclareeValide(s.delivreLe, aujourdHui))
    erreur = 'Indique la date réelle du document, pas une date future.';
  else if (!sourceTexte || sourceTexte.length > 200)
    erreur = 'Dis où se trouve le document : la source est obligatoire, même sans lien.';
  else if (sourceLien && (!LIEN_HTTPS.test(sourceLien) || sourceLien.length > 500))
    erreur = 'Un lien commence par https:// et ne contient aucune espace.';
  else if (
    !dateDeclareeValide(s.controleLe, aujourdHui) ||
    (!sansDate && s.controleLe < s.delivreLe)
  )
    erreur = cite
      ? 'Indique le jour où l’école l’a dit : ni dans le futur, ni avant la date du document.'
      : 'Indique le jour où tu as vu le document : ni dans le futur, ni avant sa date.';
  return {
    agrement: erreur
      ? null
      : {
          formationId: s.formationId || null,
          genre,
          precision: precision || null,
          reference,
          delivreLe: sansDate ? null : s.delivreLe,
          sourceTexte,
          sourceLien: sourceLien || null,
          controleLe: s.controleLe,
          // La photo déjà jointe ne change pas : la base garde la preuve telle quelle.
          preuve: s.preuve === 'document_vu' || s.preuve === 'dit_ecole' ? s.preuve : null,
        },
    erreur,
  };
}

/** L'intitulé que la fiche écrit : celui du document. Une valeur inconnue d'une version future n'invente rien. */
export function intituleAgrement(a: Pick<AgrementPublic, 'genre' | 'precision'>): string {
  if (a.genre === 'autre' && a.precision) return a.precision;
  if (a.genre === 'autre') return 'Référence officielle';
  return (
    (libelleGenreAgrement as Record<string, string | undefined>)[a.genre] ?? 'Référence officielle'
  );
}

/** « arrêté n° [référence] du 12 mars 2024 » ; sans date (cité par l'école, ticket 205), la référence seule. */
export function referenceEnMots(a: Pick<AgrementPublic, 'reference' | 'delivreLe'>): string {
  return a.delivreLe ? `${a.reference} du ${dateLongue(a.delivreLe)}` : a.reference;
}
