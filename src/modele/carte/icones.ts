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
} as const;

export type NomIcone = keyof typeof ICONES;
