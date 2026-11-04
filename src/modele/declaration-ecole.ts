import { dateDeclareeValide } from './date-declaration';
import type { Erreurs } from './fiche';

export interface DeclarationEcole {
  declareeLe: string;
  confirmee: boolean;
}
export function erreursDeclaration(d: DeclarationEcole): Erreurs {
  const erreurs: Erreurs = {};
  if (!dateDeclareeValide(d.declareeLe))
    erreurs.declareeLe = 'Indique une date réelle, non future.';
  if (!d.confirmee)
    erreurs.confirmee = 'Confirme que l’école a transmis ces informations pour publication.';
  return erreurs;
}
