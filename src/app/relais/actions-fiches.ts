/**
 * Ce que le relais peut faire d'une fiche qui est encore dans son téléphone : la réessayer, la modifier, la retirer.
 * Chaque geste relit la fiche au moment d'agir (elle a pu partir entre-temps) et refuse si son envoi est en route.
 */
import { peutEtreModifiee, pourModifier, pourReessayer } from '../../modele/envoi';
import { base, garder, lireMemoire } from './base-locale';
import { aller } from './contexte';
import { estEnVol } from './file-envoi';

/** `ok` : fait. Sinon la raison : l'envoi est en route, NTanova a déjà le relevé, ou une autre fiche est en cours. */
export type IssueDeLAction = 'ok' | 'en_cours' | 'partie' | 'brouillon_existant';

/** Remet une fiche refusée dans la file, telle quelle. */
export async function reessayer(id: string): Promise<IssueDeLAction> {
  return base.transaction('rw', base.fiches, async (): Promise<IssueDeLAction> => {
    const fiche = await base.fiches.get(id);
    if (fiche?.etat !== 'refusee') return 'partie';
    await base.fiches.update(id, pourReessayer());
    return 'ok';
  });
}

/**
 * Rouvre une fiche pour la modifier : elle redevient le brouillon, avec ses trois étapes et ses photos. Elle
 * repartira quand le relais l'aura de nouveau rangée (« Enregistrer la fiche »). Seulement tant que NTanova n'a pas
 * reçu son relevé, et sans autre fiche en cours (le téléphone n'en garde qu'une à la fois).
 */
export async function modifierLaFiche(id: string): Promise<IssueDeLAction> {
  const enCours = await lireMemoire('brouillon');
  if (enCours && enCours !== id && (await base.fiches.get(enCours))?.etat === 'brouillon') {
    return 'brouillon_existant';
  }
  const issue = await base.transaction('rw', base.fiches, async (): Promise<IssueDeLAction> => {
    const fiche = await base.fiches.get(id);
    if (!fiche || !peutEtreModifiee(fiche)) return 'partie';
    if (estEnVol(id)) return 'en_cours';
    await base.fiches.update(id, pourModifier());
    return 'ok';
  });
  if (issue !== 'ok') return issue;
  await garder('brouillon', id);
  aller('ajouter/1');
  return 'ok';
}

/**
 * Efface une fiche du téléphone : une fiche refusée, ou une fiche enregistrée que NTanova n'a pas encore reçue.
 * Si NTanova a déjà le relevé, seule la copie du téléphone (photos et contact qui attendaient) disparaît.
 */
export async function retirerDuTelephone(id: string): Promise<IssueDeLAction> {
  return base.transaction('rw', base.fiches, async (): Promise<IssueDeLAction> => {
    const fiche = await base.fiches.get(id);
    if (!fiche) return 'partie';
    if (estEnVol(id)) return 'en_cours';
    // Une fiche en file dont le relevé est parti est en cours d'envoi : on la laisse finir.
    if (fiche.etat === 'a_envoyer' && fiche.envoyes.releve) return 'partie';
    if (fiche.etat !== 'a_envoyer' && fiche.etat !== 'refusee') return 'partie';
    await base.fiches.delete(id);
    return 'ok';
  });
}
