import { dateDeclareeValide, jourDuCongo } from './date-declaration';
import { listes, type Valeur } from './listes';
import { normaliserTelephone, numeroCongolaisSuspect } from './telephone';
export interface ContactPublic {
  numero: string;
  accordLe: string;
}
export interface AccordContactPublic extends ContactPublic {
  fonction: Valeur<'fonction_direction'>;
  canal: 'whatsapp' | 'appel' | 'sur_place' | 'autre';
}
export function lireAccordContactPublic(
  s: { numero: string; accordLe: string; fonction: string; canal: string; autorise: boolean },
  aujourdHui = jourDuCongo(),
): { contact: AccordContactPublic | null; erreur: string | null } {
  const numero = normaliserTelephone(s.numero);
  const date = dateDeclareeValide(s.accordLe, aujourdHui);
  let erreur: string | null = null;
  if (!numero || numeroCongolaisSuspect(numero)) erreur = 'Vérifie le numéro public de l’école.';
  else if (!s.autorise) erreur = 'Confirme l’autorisation de publier ce numéro sur le site.';
  else if (!date || s.accordLe > aujourdHui)
    erreur = 'Indique la date réelle de l’accord, pas une date future.';
  else if (
    !listes.fonction_direction.includes(s.fonction as Valeur<'fonction_direction'>) ||
    !['whatsapp', 'appel', 'sur_place', 'autre'].includes(s.canal)
  )
    erreur = 'Indique la fonction et le canal de l’accord.';
  return {
    contact: erreur
      ? null
      : {
          numero: numero!,
          accordLe: s.accordLe,
          fonction: s.fonction as Valeur<'fonction_direction'>,
          canal: s.canal as AccordContactPublic['canal'],
        },
    erreur,
  };
}
