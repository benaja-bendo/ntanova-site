/**
 * La date limite des inscriptions (ticket 148) : déclarée par l'école et datée, comme ses frais. Le site est statique : il écrit
 * « Date limite annoncée », vrai quel que soit le jour où on le lit, jamais « ouvertes », et retire la date à la construction une
 * fois passée. Les règles sont celles de `set_campus_enrollment_deadline`.
 */
import { dateDeclareeValide, jourDuCongo } from './date-declaration';

export interface DateInscription {
  id: string;
  anneeScolaire: string;
  limite: string;
  declareeLe: string;
}

export type DateInscriptionASaisir = Omit<DateInscription, 'id'>;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export function lireDateInscription(
  s: { anneeScolaire: string; limite: string; declareeLe: string },
  aujourdHui = jourDuCongo(),
): { date: DateInscriptionASaisir | null; erreur: string | null } {
  const anneeScolaire = s.anneeScolaire.trim();
  let erreur: string | null = null;
  if (!anneeScolaire || anneeScolaire.length > 30)
    erreur = 'Indique l’année scolaire (30 caractères au plus).';
  else if (!JOUR.test(s.limite) || !Number.isFinite(Date.parse(s.limite)))
    erreur = 'Indique la date limite annoncée par l’école.';
  else if (!dateDeclareeValide(s.declareeLe, aujourdHui))
    erreur = 'Indique la date réelle de la déclaration, pas une date future.';
  else if (s.limite < s.declareeLe) erreur = 'La date limite ne précède pas la déclaration.';
  return {
    date: erreur ? null : { anneeScolaire, limite: s.limite, declareeLe: s.declareeLe },
    erreur,
  };
}

/** La date à montrer : la prochaine à venir, celle du jour comprise ; aucune une fois toutes passées. */
export function prochaineInscription(
  lignes: readonly DateInscription[],
  aujourdHui = jourDuCongo(),
): DateInscription | null {
  return (
    lignes
      .filter((l) => l.limite >= aujourdHui)
      .sort((a, b) => a.limite.localeCompare(b.limite))[0] ?? null
  );
}
