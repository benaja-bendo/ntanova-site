/**
 * Le mot de la direction (ticket 148) : une parole de l'école, telle qu'elle l'a remise, datée, sans nom de personne. Il ne paraît
 * que sur une fiche confirmée par la direction (la vue de la base le garde). Les règles sont celles de `set_campus_statement`.
 */
import { dateDeclareeValide, jourDuCongo } from './date-declaration';
import { listes, type Valeur } from './listes';

export const LONGUEUR_MAX_MOT = 400;

export interface MotDirection {
  texte: string;
  ditLe: string;
}

export interface AccordMotDirection extends MotDirection {
  fonction: Valeur<'fonction_direction'>;
  canal: 'whatsapp' | 'appel' | 'sur_place' | 'autre';
}

export function lireMotDirection(
  s: { texte: string; ditLe: string; fonction: string; canal: string; accord: boolean },
  aujourdHui = jourDuCongo(),
): { mot: AccordMotDirection | null; erreur: string | null } {
  const texte = s.texte.trim();
  let erreur: string | null = null;
  if (!texte || texte.length > LONGUEUR_MAX_MOT)
    erreur = `Écris le mot de la direction (${LONGUEUR_MAX_MOT} caractères au plus).`;
  else if (!dateDeclareeValide(s.ditLe, aujourdHui))
    erreur = 'Indique la date réelle du mot, pas une date future.';
  else if (
    !listes.fonction_direction.includes(s.fonction as Valeur<'fonction_direction'>) ||
    !['whatsapp', 'appel', 'sur_place', 'autre'].includes(s.canal)
  )
    erreur = 'Indique la fonction et le canal de l’accord.';
  else if (!s.accord) erreur = 'Confirme que la direction accepte la publication de ce mot.';
  return {
    mot: erreur
      ? null
      : {
          texte,
          ditLe: s.ditLe,
          fonction: s.fonction as Valeur<'fonction_direction'>,
          canal: s.canal as AccordMotDirection['canal'],
        },
    erreur,
  };
}
