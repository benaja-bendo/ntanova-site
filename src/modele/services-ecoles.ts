/**
 * Ce que NTanova propose aux écoles, et l'état réel de chaque service (refonte publique, lot 5, 25/11/2026 ; canevas « Points de
 * repère », planche « Pour les écoles »). Trois libellés d'état et pas un de plus. « À l'essai » s'explique dans la légende ; il
 * ne se pose sur un service que si un essai existe, avec ses conditions écrites. Aucun n'existe aujourd'hui.
 *
 * Changer un état ici est une décision du fondateur, pas une retouche de texte. Pur : ni Astro, ni réseau.
 */
export const LIEN_POUR_LES_ECOLES = '/pour-les-ecoles/';
/** La présentation des deux pistes d'outils : une page à lire, pas un logiciel. */
export const LIEN_OUTILS = '/pour-les-ecoles/outils/';

export type EtatDeService = 'disponible' | 'essai' | 'preparation';

export const ETATS_DE_SERVICE: readonly EtatDeService[] = ['disponible', 'essai', 'preparation'];

export const libelleEtatDeService: Readonly<Record<EtatDeService, string>> = {
  disponible: 'Disponible',
  essai: 'À l’essai',
  preparation: 'En préparation',
};

/** Ce que veut dire chaque état, dans la légende. */
export const SENS_DES_ETATS: Readonly<Record<EtatDeService, string>> = {
  disponible: 'utilisable maintenant',
  essai: 'quelques écoles, conditions écrites',
  preparation: 'pas encore utilisable',
};

export interface Service {
  nom: string;
  etat: EtatDeService;
}
export interface Besoin {
  titre: string;
  /** L'ancre de la section qui l'explique, sur `/pour-les-ecoles/`. */
  ancre: string;
  services: readonly Service[];
}

export const BESOINS_DES_ECOLES: readonly Besoin[] = [
  {
    titre: 'Présenter et corriger sa fiche',
    ancre: 'e-fiche',
    services: [
      { nom: 'Relire, corriger, faire retirer', etat: 'disponible' },
      { nom: 'Confirmer sa fiche', etat: 'disponible' },
      { nom: 'Confirmer ses frais', etat: 'disponible' },
      { nom: 'Envoyer photos et contact', etat: 'disponible' },
    ],
  },
  {
    titre: 'Mieux communiquer',
    ancre: 'e-com',
    services: [
      { nom: 'Partager sa fiche\u00a0: un lien, une image', etat: 'disponible' },
      { nom: 'Le mot de la direction, sur une fiche confirmée', etat: 'disponible' },
      { nom: 'Des visuels et des contenus pour l’école', etat: 'preparation' },
    ],
  },
  {
    titre: 'Gérer des tâches du quotidien',
    ancre: 'e-outils',
    services: [
      { nom: 'Inscriptions', etat: 'preparation' },
      { nom: 'Frais et reçus', etat: 'preparation' },
    ],
  },
];

/** Le message WhatsApp prérempli de « Raconter votre dernière rentrée » : ni engagement, ni donnée d'élève demandée. */
export const MESSAGE_RACONTER =
  'Bonjour NTanova, voici ce qui a pris du temps à mon école à la dernière rentrée : … Ce qui a coincé : …';

/** Combien de services sont à l'essai, dans la liste : la phrase de la page se règle dessus, jamais l'inverse. */
export const servicesALEssai = (besoins: readonly Besoin[] = BESOINS_DES_ECOLES): number =>
  besoins.flatMap((b) => b.services).filter((s) => s.etat === 'essai').length;
