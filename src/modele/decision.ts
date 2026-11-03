/**
 * Une décision qui renvoie ou refuse une fiche dit toujours quoi faire (ticket #80).
 *
 * Chaque motif a sa phrase automatique (`libelleMotif` : « La photo est floue. ») : le message de NTanova y reste
 * facultatif. Le motif « autre » est celui des cas qui ne rentrent dans aucune case : sa phrase de repli (« Une
 * information est à revoir. ») ne dit rien, et le relais est renvoyé sans savoir quoi corriger. Le message y est donc
 * obligatoire, à l'écran comme dans la base (`request_correction` et `refuse_submission` refusent la même chose).
 */
import type { Valeur } from './listes';

/** La phrase que lit l'administration quand il manque le message ; la base écrit la même. */
export const MESSAGE_OBLIGATOIRE =
  'Avec le motif « autre », écris un message : le relais doit savoir quoi faire.';

/** Ce qui manque à la décision, ou `null` quand elle est complète. Des espaces seuls ne sont pas un message. */
export function messageManquant(
  motif: Valeur<'motif_decision'>,
  message: string | null,
): string | null {
  if (motif !== 'autre') return null;
  return (message ?? '').trim() === '' ? MESSAGE_OBLIGATOIRE : null;
}
