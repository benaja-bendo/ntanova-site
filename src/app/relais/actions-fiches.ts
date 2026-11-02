/**
 * Ce que le relais peut faire d'une fiche qui est encore dans son téléphone : la réessayer, la modifier, la retirer.
 * Chaque geste relit la fiche au moment d'agir (elle a pu partir entre-temps) et refuse si son envoi est en route.
 */
import { peutEtreModifiee, pourModifier, pourReessayer } from '../../modele/envoi';
import { nouvelleFiche, type ContactSaisi } from '../../modele/fiche';
import type { ReleveRecu } from '../../modele/ports';
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

/** Le téléphone ne garde qu'une fiche en cours de saisie : y en a-t-il déjà une ? */
export async function brouillonEnCours(): Promise<boolean> {
  const id = await lireMemoire('brouillon');
  return id ? (await base.fiches.get(id))?.etat === 'brouillon' : false;
}

/**
 * Ajoute le contact de la direction à une fiche que NTanova a déjà reçue, après « À repasser » : le relais a revu la
 * direction. Le contact part par la file d'envoi comme celui d'une fiche neuve (hors ligne aussi), sur la fiche
 * existante : rien d'autre n'est renvoyé. Si la copie du téléphone n'y est plus, une fiche vide en tient la place.
 */
export async function ajouterLeContact(recu: ReleveRecu, contact: ContactSaisi): Promise<void> {
  await base.transaction('rw', base.fiches, async () => {
    const locale =
      (await base.fiches.get(recu.id)) ??
      ({
        ...nouvelleFiche(recu.id, new Date().toISOString(), null),
        nomEnseigne: recu.nomEnseigne,
        envoyes: { releve: true, photo: true, contact: true },
        etat: 'envoyee',
      } as const);
    await base.fiches.put({
      ...locale,
      direction: 'vue',
      contact,
      etat: 'a_envoyer',
      // Le relevé et les photos sont chez NTanova : seul le contact reste à envoyer.
      envoyes: { ...locale.envoyes, releve: true, contact: false },
      rejet: null,
      essais: 0,
    });
  });
}
