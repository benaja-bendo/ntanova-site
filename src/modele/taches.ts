/**
 * Ce que NTanova attend du relais sur une école qu'elle lui confie, ou pour une fiche qu'elle lui renvoie (ticket
 * #55). Le relais ne redonne que ce qui manque : une photo que NTanova a déjà n'est pas à reprendre quand le motif
 * de la correction ne la concerne pas. Des fonctions pures, gardées dans la fiche au moment où le relais la commence :
 * l'écran ne dépend plus du réseau ensuite.
 *
 * Dans le doute, on demande : mieux vaut une photo de trop qu'une école sans enseigne. Une ligne reçue avant la
 * mise à jour du téléphone n'a pas les derniers champs ; elle se lit comme « on ne sait rien ».
 */
import { libelleMotif } from './libelles';
import type { Valeur } from './listes';
import type { EcoleACompleter, ReleveRecu } from './ports';

export interface Taches {
  /** La photo de l'enseigne est à prendre. Sinon NTanova l'a déjà : la reprendre est facultatif. */
  photo: boolean;
  /** La position est à prendre devant l'entrée. Sinon NTanova la connaît : la reprendre est facultatif. */
  position: boolean;
  /** Le nom, les niveaux, le repère… sont à vérifier sur place (ils sont déjà remplis). */
  informations: boolean;
  /** La direction est à voir. Sinon son contact est déjà confirmé ou arrivé : rien à refaire. */
  direction: boolean;
  /** Ce que NTanova a écrit : la consigne de la mission, ou le message de la correction. */
  consigne: string | null;
  /** Pourquoi le relais est là, en une phrase. */
  titre: string;
}

const titreDeMission: Record<Valeur<'mission_kind'>, string> = {
  verify: 'NTanova connaît cette école. Passez la vérifier sur place.',
  locate: 'NTanova connaît cette école sans savoir où elle est. Passez la situer.',
  complete: 'NTanova connaît cette école. Passez compléter sa fiche.',
};

/** Les tâches d'une école confiée au relais, d'après ce que NTanova en sait déjà. */
export function tachesDeLaMission(ecole: EcoleACompleter): Taches {
  const aUneEnseigne = (ecole.photos ?? []).includes('signboard');
  const aUnePosition = ecole.position != null;
  const verifiee = ecole.etatVerification === 'verifiee';
  return {
    photo: !aUneEnseigne,
    // Situer et vérifier demandent la position (constater la présence sur place) ; compléter, seulement si elle manque.
    position: ecole.genre !== 'complete' || !aUnePosition,
    informations: true,
    direction: !ecole.contactConfirme,
    consigne: ecole.note ?? null,
    titre: verifiee
      ? 'Cette école est déjà vérifiée par la direction : un relevé ne la modifie plus.'
      : titreDeMission[ecole.genre],
  };
}

/**
 * NTanova a-t-elle le contact de cette fiche ? Il reste attaché à la fiche qui l'a reçu : une correction ne le porte que
 * si le relais l'a redonné, alors qu'il a pu arriver avec la fiche d'origine, ou avec une correction d'avant. On remonte
 * donc la chaîne des fiches corrigées, sans jamais boucler (ticket #94).
 */
export function contactArrive(recu: ReleveRecu, autres: readonly ReleveRecu[] = []): boolean {
  const parId = new Map(autres.map((r) => [r.id, r]));
  const vues = new Set<string>();
  let courante: ReleveRecu | undefined = recu;
  while (courante && !vues.has(courante.id)) {
    if (courante.aContact === true) return true;
    vues.add(courante.id);
    courante = courante.corrigeReleveId ? parId.get(courante.corrigeReleveId) : undefined;
  }
  return false;
}

/**
 * Les tâches d'une fiche renvoyée au relais, d'après le motif de NTanova et ce que NTanova a vraiment reçu.
 *
 * La photo de l'enseigne est demandée quand le motif la concerne, **ou quand NTanova n'en a reçu aucune** : sans
 * cela, une fiche arrivée sans photo et renvoyée pour « autre » disait « NTanova a déjà la photo » au relais, qui ne
 * pouvait pas la remettre (ticket #72). Une ligne gardée avant la mise à jour n'a pas la liste des photos : dans le
 * doute, on demande.
 *
 * Le contact de la direction est redemandé **quand il manque** : la direction a été vue et rien n'est arrivé chez
 * NTanova, ni avec cette fiche ni avec celle qu'elle corrige. Avant, une correction ne le redemandait jamais (« il est
 * parti avec la fiche ») : quand le premier envoi s'était arrêté avant lui, il était perdu pour de bon (ESTAM, ticket
 * #94). `autres` : les autres fiches du relais, pour suivre la chaîne des corrections.
 */
export function tachesDeLaCorrection(recu: ReleveRecu, autres: readonly ReleveRecu[] = []): Taches {
  const motif = recu.motif;
  const enseigneRecue = (recu.photos ?? []).includes('signboard');
  return {
    photo: !enseigneRecue || motif === 'photo_floue' || motif === 'enfant_sur_photo',
    position: motif === 'hors_lot' || motif === 'position_imprecise' || motif === 'doublon',
    // Un motif qui ne dit rien de précis (« autre », ou aucun) : le relais relit les informations avec le message.
    informations: motif === 'autre' || motif === null,
    // Une direction absente ou qui a refusé n'a pas de contact à redonner ; une ligne gardée avant la mise à jour, sans
    // « contact arrivé », se lit comme « on ne sait pas » : dans le doute, on demande.
    direction: recu.direction === 'vue' && !contactArrive(recu, autres),
    consigne: recu.messageAuRelais ?? (motif ? libelleMotif[motif] : null),
    titre: 'NTanova vous renvoie cette fiche. Corrigez seulement ce qui est demandé.',
  };
}
