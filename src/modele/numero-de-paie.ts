/**
 * Le numéro Mobile Money du relais (lot H, 13/11/2026), saisi dans « Compte › Pour recevoir la paie ». Il est rangé dans la
 * partie privée de la base (`prive.relay_payment_details`) ; le relais ne lit et ne change que le sien.
 */
import { normaliserTelephone, numeroCongolaisSuspect } from './telephone';

export type OperateurMobileMoney = 'mtn' | 'airtel' | 'autre';

export const OPERATEURS: { valeur: OperateurMobileMoney; libelle: string }[] = [
  { valeur: 'mtn', libelle: 'MTN' },
  { valeur: 'airtel', libelle: 'Airtel' },
  { valeur: 'autre', libelle: 'Autre' },
];

export const libelleOperateur = (o: OperateurMobileMoney): string =>
  OPERATEURS.find((x) => x.valeur === o)?.libelle ?? o;

export interface NumeroDePaie {
  operateur: OperateurMobileMoney;
  /** Au format de la base : chiffres, indicatif compris (242…). */
  numero: string;
  majLe: string | null;
}

/** Le numéro prêt à enregistrer, ou ce qui ne va pas, en une phrase. */
export function lireNumeroDePaie(
  operateur: OperateurMobileMoney | null,
  saisie: string,
): { ok: true; numero: string } | { ok: false; erreur: string } {
  if (!operateur) return { ok: false, erreur: 'Choisissez l’opérateur : MTN, Airtel ou autre.' };
  const numero = normaliserTelephone(saisie);
  if (!numero) return { ok: false, erreur: 'Écrivez le numéro, par exemple 06 123 45 67.' };
  const suspect = numeroCongolaisSuspect(numero);
  if (suspect)
    return {
      ok: false,
      erreur: `Ce numéro a ${suspect.chiffres} chiffres après 242 : un numéro du Congo en a 9.`,
    };
  return { ok: true, numero };
}
