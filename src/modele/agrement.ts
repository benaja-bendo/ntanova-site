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
  delivreLe: string;
  /** Où se trouve le document, en mots : toujours renseigné, même sans lien. */
  sourceTexte: string;
  sourceLien: string | null;
}

export interface AgrementASaisir extends AgrementPublic {
  /** Nul : l'établissement. Sinon, la filière concernée. */
  formationId: string | null;
  /** Le jour où NTanova a vu le document : jamais publié. */
  controleLe: string;
}

export interface AgrementEnregistre extends AgrementASaisir {
  id: string;
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
    documentVu: boolean;
  },
  aujourdHui = jourDuCongo(),
): { agrement: AgrementASaisir | null; erreur: string | null } {
  const reference = s.reference.trim();
  const sourceTexte = s.sourceTexte.trim();
  const sourceLien = s.sourceLien.trim();
  const genre = s.genre as Valeur<'accreditation_kind'>;
  const precision = genre === 'autre' ? s.precision.trim() : '';
  let erreur: string | null = null;
  if (!listes.accreditation_kind.includes(genre)) erreur = 'Choisis l’intitulé du document.';
  else if (genre === 'autre' && (!precision || precision.length > 80))
    erreur = 'Précise l’intitulé écrit sur le document (80 caractères au plus).';
  else if (!reference || reference.length > 160)
    erreur = 'Recopie la référence écrite sur le document (160 caractères au plus).';
  else if (!dateDeclareeValide(s.delivreLe, aujourdHui))
    erreur = 'Indique la date réelle du document, pas une date future.';
  else if (!sourceTexte || sourceTexte.length > 200)
    erreur = 'Dis où se trouve le document : la source est obligatoire, même sans lien.';
  else if (sourceLien && (!LIEN_HTTPS.test(sourceLien) || sourceLien.length > 500))
    erreur = 'Un lien commence par https:// et ne contient aucune espace.';
  else if (!dateDeclareeValide(s.controleLe, aujourdHui) || s.controleLe < s.delivreLe)
    erreur = 'Indique le jour où tu as vu le document : ni dans le futur, ni avant sa date.';
  else if (!s.documentVu) erreur = 'Confirme que tu as vu ce document.';
  return {
    agrement: erreur
      ? null
      : {
          formationId: s.formationId || null,
          genre,
          precision: precision || null,
          reference,
          delivreLe: s.delivreLe,
          sourceTexte,
          sourceLien: sourceLien || null,
          controleLe: s.controleLe,
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

/** « arrêté n° [référence] du 12 mars 2024 » */
export function referenceEnMots(a: Pick<AgrementPublic, 'reference' | 'delivreLe'>): string {
  return `${a.reference} du ${dateLongue(a.delivreLe)}`;
}
