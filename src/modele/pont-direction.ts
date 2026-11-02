/**
 * Le pont avec la direction : le premier message WhatsApp, écrit pour que le directeur ou la directrice sache
 * qui écrit, pourquoi, et ce qu'on lui demande. Ce texte ne dit que ce qui est vrai aujourd'hui :
 *   - pas de prix, ni de « gratuit » (le service vendu aux écoles n'est pas choisi) ;
 *   - pas d'audience, ni de couverture (« toutes les écoles de la ville ») ;
 *   - rien de ce que gagne le relais ;
 *   - l'accord pour le badge « Vérifié » est demandé, jamais présumé.
 * Le numéro de NTanova n'est pas ici : il vient de la configuration, jamais du dépôt.
 */
import { lienWhatsApp } from './whatsapp';

export interface InfosMessage {
  /** Le nom de l'école, tel que la fiche le dit. */
  ecole: string;
  /** La ville (« Pointe-Noire »), quand on la connaît ; sinon le message ne la nomme pas. */
  ville: string | null;
  /** La fiche est-elle déjà en ligne sur ntanova.com ? */
  enLigne: boolean;
}

/** Le premier message à la direction. Vouvoiement, court, sans promesse. */
export function messageDirection({ ecole, ville, enLigne }: InfosMessage): string {
  const annuaire = ville ? `l’annuaire des écoles de ${ville}` : 'un annuaire des écoles';
  const fiche = enLigne
    ? `La fiche de ${ecole} est en ligne sur ntanova.com.`
    : `La fiche de ${ecole} est en préparation.`;
  return [
    `Bonjour, ici NTanova (ntanova.com), ${annuaire}.`,
    `Un de nos relais est passé devant ${ecole} et a noté ce qui se voit de la rue : le nom, les niveaux, le repère. ${fiche}`,
    'Pouvez-vous nous dire quelle est votre fonction dans l’école (promoteur, directeur, DG, gestionnaire…) ?',
    'Si les informations de la fiche sont justes, nous pouvons y ajouter la mention « Vérifié par la direction ». Répondez « OK » si vous êtes d’accord : nous noterons la date de votre accord. Sinon, dites-nous ce qu’il faut corriger.',
    'Merci !',
  ].join('\n\n');
}

/**
 * Le lien qui ouvre la conversation avec le contact de la direction, message prêt à envoyer. Il n'existe que si la
 * direction a donné son accord pour être contactée : sans accord, pas de lien, donc pas de message.
 */
export function lienPont(
  contact: { whatsapp: string | null; accord: boolean },
  infos: InfosMessage,
): string | null {
  if (!contact.accord || !contact.whatsapp) return null;
  return lienWhatsApp(contact.whatsapp, messageDirection(infos));
}

/**
 * Les mots que le message ne doit jamais contenir : une promesse que l'on ne tient pas encore, un chiffre,
 * ou ce qui regarde le relais. Les tests s'en servent ; l'écran aussi, avant d'ouvrir WhatsApp.
 */
export const MOTS_INTERDITS: readonly RegExp[] = [
  /gratuit/i,
  /\bFCFA\b|\bXAF\b|\bfrancs?\b/i,
  /\bprix\b|\btarif\b|\babonnement\b/i,
  /\bvisiteurs?\b|\baudience\b|\bparents?\s+nous\b|\bmillier/i,
  /\btoutes les écoles\b/i,
  /\brelais\s+(est|sera)\s+pay/i,
];

/**
 * Le message ne promet-il rien d'interdit ? Le nom de l'école (`noms`) n'est pas contrôlé : « Collège Grand Prix »
 * ou « Les Visiteurs » ne parlent pas de prix ni d'audience, ils sont un nom propre.
 */
export function messageHonnete(message: string, noms: readonly string[] = []): boolean {
  const sansNoms = noms
    .filter((nom) => nom.trim() !== '')
    .reduce((texte, nom) => texte.split(nom).join('l’école'), message);
  return !MOTS_INTERDITS.some((mot) => mot.test(sansNoms));
}
