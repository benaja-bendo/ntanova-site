/**
 * Ce que partagent les écrans d'une fiche en cours (Ajouter 1 à 3, le bonus, « Déjà sur NTanova ? ») : la façon de la
 * modifier et de l'enregistrer.
 */
import type { FicheLocale } from '../../../modele/fiche';
import { versAutresPersonnes, versContact } from '../../../modele/fiche';
import { base } from '../base-locale';
import { aller, useRelais } from '../contexte';

/** Change des champs de la fiche en cours ; une fonction reçoit la fiche à jour (deux photos qui se suivent ne s'écrasent pas). */
export type Modifier = (
  champs: Partial<FicheLocale> | ((fiche: FicheLocale) => Partial<FicheLocale>),
) => void;

/** Enregistrer la fiche : elle passe dans la file d'envoi, puis « Mes fiches ». */
export function useEnregistrer(fiche: FicheLocale): () => Promise<void> {
  const { synchroniser } = useRelais();
  return async () => {
    const autres = fiche.autresPersonnes ?? [];
    const prete: FicheLocale = {
      ...fiche,
      contact: fiche.direction === 'absente' ? null : fiche.contact,
      autresPersonnes: fiche.direction === 'vue' ? autres : [],
      etat: 'a_envoyer',
      envoyes: {
        releve: false,
        photo: false,
        contact: versContact(fiche) === null && versAutresPersonnes(fiche).length === 0,
      },
      // Une fiche modifiée repart comme neuve : ni refus, ni essais ratés d'avant.
      rejet: null,
      essais: 0,
    };
    await base.fiches.put(prete);
    aller('fiches', true);
    synchroniser();
  };
}
