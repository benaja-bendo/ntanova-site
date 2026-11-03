/**
 * Les fiches renvoyées au relais (ticket #92).
 *
 * Une fiche renvoyée « à corriger » sort de la file de l'administration : elle attend le relais. Sans rien pour la
 * montrer, elle « disparaissait » (le fondateur ne retrouvait plus une fiche reçue la veille). L'administration la
 * retrouve dans « Renvoyées » et sur l'accueil, avec depuis quand elle attend.
 *
 * Côté relais, un refus gardé dans le téléphone (« la photo n'est plus lisible… prévenez NTanova ») n'a plus lieu d'être
 * quand NTanova a déjà décidé : il dit « prévenez NTanova » à un relais que NTanova a déjà prévenu, et « Réessayer » ne
 * peut pas redonner une photo perdue.
 */
import { ageDe, type AgeDeFiche } from './age';
import type { Valeur } from './listes';

/** Le refus gardé dans le téléphone est-il périmé ? Oui dès que NTanova a décidé de la fiche. */
export function refusEstPerime(statut: Valeur<'statut_releve'>): boolean {
  return statut !== 'a_valider';
}

/** Combien de fiches attendent leur relais, et depuis quand la plus ancienne. */
export function resumerLesRenvoyees(
  decides: readonly { statut: Valeur<'statut_releve'>; decideLe: string | null }[],
  maintenant: Date,
): { nombre: number; plusAncienne: AgeDeFiche | null } {
  const renvoyees = decides.filter((d) => d.statut === 'a_corriger');
  const dates = renvoyees
    .map((d) => d.decideLe)
    .filter((d): d is string => d !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const premiere = dates[0];
  return {
    nombre: renvoyees.length,
    plusAncienne: premiere === undefined ? null : ageDe(premiere, maintenant),
  };
}
