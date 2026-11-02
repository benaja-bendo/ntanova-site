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

/** Les tâches d'une fiche renvoyée au relais, d'après le motif de NTanova. */
export function tachesDeLaCorrection(recu: ReleveRecu): Taches {
  const motif = recu.motif;
  return {
    photo: motif === 'photo_floue' || motif === 'enfant_sur_photo',
    position: motif === 'hors_lot' || motif === 'position_imprecise' || motif === 'doublon',
    // Un motif qui ne dit rien de précis (« autre », ou aucun) : le relais relit les informations avec le message.
    informations: motif === 'autre' || motif === null,
    // Le contact de la direction est parti avec la fiche : une correction ne le redemande pas.
    direction: false,
    consigne: recu.messageAuRelais ?? (motif ? libelleMotif[motif] : null),
    titre: 'NTanova vous renvoie cette fiche. Corrigez seulement ce qui est demandé.',
  };
}
