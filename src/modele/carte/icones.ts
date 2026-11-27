/**
 * Les tracés des icônes du site (viewBox 24, trait de 2) : un cercle est écrit par deux arcs. Un seul endroit, lu par la fiche
 * d'aperçu de la carte (`app/carte/apercu.ts`, qui les dessine en DOM) et par les pages (`ui/Icone.astro`, qui les écrit en
 * HTML) : une icône ne se redessine pas deux fois.
 */
export const ICONES = {
  lieu: [
    'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z',
    'M9.7 10a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0',
  ],
  repere: ['M12 3v18', 'M5 6h10l3 2.5-3 2.5H5z'],
  oeil: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  bouclier: ['M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z', 'M9 12l2.2 2.2L15.5 10'],
  fleche: ['M5 12h14', 'M13 6l6 6-6 6'],
  aller: ['M3 11l18-8-8 18-2-8z'],
  appeler: [
    'M5 4h3.5l1.8 4.5-2.2 1.4a11 11 0 0 0 6 6l1.4-2.2L20 15.5V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z',
  ],
  partage: [
    'M15.5 5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    'M3.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    'M15.5 19a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
    'M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4',
  ],
  coche: ['M5 12.5l4.5 4.5L19 7.5'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  croix: ['M6 6l12 12M18 6L6 18'],
  retour: ['M15 6l-6 6 6 6'],
  suite: ['M9 6l6 6-6 6'],
  // Le pays de l'en-tête (ticket 146) : un globe, et la flèche qui dit que l'étiquette s'ouvre.
  globe: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
    'M3.5 9h17M3.5 15h17',
    'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  ],
  bas: ['M6 9l6 6 6-6'],
  // La page « Écoles » (ticket 146) : chercher, autour de moi, la bascule Liste | Carte.
  loupe: ['M4 10.5a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0', 'M15.5 15.5L20 20'],
  cible: [
    'M12 2v3M12 19v3M2 12h3M19 12h3',
    'M5.5 12a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0',
    'M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  ],
  liste: ['M9 6h11M9 12h11M9 18h11', 'M4.5 6h.01M4.5 12h.01M4.5 18h.01'],
  plan: ['M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z', 'M9 4v13.5M15 6.5v13.5'],
  // La fiche d'école (canevas du 08/11/2026, ticket 148) : une déclaration écrite, WhatsApp, l'écusson encore vide.
  document: ['M6 3.5h8l4 4V20.5H6z', 'M14 3.5v4h4', 'M9 13h6M9 16.5h4'],
  bulle: ['M4 19.5l1.4-4.2A7.5 7.5 0 1 1 8.7 18.6z'],
  bouclierVide: ['M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z'],
  // S'orienter (lot 3, planches de la version 44) : la boussole du bouton jaune de l'accueil ; le livre (après le BEPC), la
  // toque (après le bac) et la mallette (je travaille) des trois profils ; le « i » d'une précaution.
  boussole: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M15.5 8.5l-2 5-5 2 2-5z'],
  livre: [
    'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z',
  ],
  toque: ['M2.5 9.5L12 5l9.5 4.5L12 14z', 'M6.5 11.5v4.5c3 2 8 2 11 0v-4.5M21.5 9.5v5'],
  mallette: [
    'M5 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
    'M8.5 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2M3 12.5h18',
  ],
  info: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M12 11v5M12 8h.01'],
  // La fiche (lot 4, planches de la version 44) : l'appareil d'une couverture sans photo, le signet de « Garder », les deux
  // flèches de Comparer.
  appareil: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M9 13a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  garder: ['M6.5 4h11a1 1 0 0 1 1 1v15.5l-6.5-4-6.5 4V5a1 1 0 0 1 1-1z'],
  // Lot 4 bis : le bouton « Filtres » (tabler « adjustments-horizontal », d'icones.js.org).
  reglages: [
    'M14 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M4 6h10M18 6h2',
    'M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M4 12h2M10 12h10',
    'M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M4 18h11M19 18h1',
  ],
  comparer: ['M4 8h14l-3-3M20 16H6l3 3'],
  // Le rond d'une école sans logo (« option C », 27/11/2026) : Tabler « school » (MIT), d'icones.js.org.
  ecoleToque: ['M22 9l-10 -4l-10 4l10 4l10 -4v6', 'M6 10.6v5.4a6 3 0 0 0 12 0v-5.4'],
} as const;

export type NomIcone = keyof typeof ICONES;
