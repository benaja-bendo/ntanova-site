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
  /** Lot I : « Au nom de » — le nom du titulaire, que MTN ou Airtel affiche avant l'envoi. Absent d'un numéro d'avant. */
  titulaire: string | null;
  majLe: string | null;
}

/**
 * Le nom du titulaire, prêt à enregistrer : espaces resserrés, de 2 à 80 caractères. Au Congo, l'opérateur affiche ce nom
 * avant d'envoyer l'argent : NTanova le compare à celui-ci.
 */
export function lireTitulaire(
  saisie: string,
): { ok: true; titulaire: string } | { ok: false; erreur: string } {
  const titulaire = saisie.replace(/\s+/g, ' ').trim();
  if (titulaire === '')
    return { ok: false, erreur: 'Écrivez le nom du titulaire, tel que MTN ou Airtel l’affiche.' };
  if (titulaire.length < 2 || titulaire.length > 80)
    return { ok: false, erreur: 'Le nom du titulaire fait de 2 à 80 caractères.' };
  return { ok: true, titulaire };
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
