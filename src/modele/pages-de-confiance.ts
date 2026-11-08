/**
 * Les pages qu'une administration, une direction ou une famille lit pour savoir à qui elle a affaire (ticket 149, décision du
 * fondateur du 08/11/2026) : la méthode, les données, la confidentialité et les mentions légales. Leurs adresses sont écrites ici
 * une fois : le pied de page, le plan du site, les liens des fiches et les tests les lisent.
 */
export const LIEN_METHODE = '/methode/';
export const LIEN_DONNEES = '/donnees/';
export const LIEN_CONDITIONS = '/donnees/#conditions';
export const LIEN_CONFIDENTIALITE = '/confidentialite/';
export const LIEN_MENTIONS_LEGALES = '/mentions-legales/';
export const LIEN_A_PROPOS = '/a-propos/';

/** Le groupe « Transparence » du pied de page, dans l'ordre où il s'écrit. */
export const PAGES_DE_TRANSPARENCE = [
  { href: LIEN_METHODE, texte: 'Méthode' },
  { href: LIEN_DONNEES, texte: 'Données' },
  { href: LIEN_CONFIDENTIALITE, texte: 'Confidentialité' },
  { href: LIEN_MENTIONS_LEGALES, texte: 'Mentions légales' },
] as const;

/**
 * Le délai que NTanova se donne pour corriger, retirer ou effacer dans sa base (décision du fondateur, 01/11/2026). C'est son
 * engagement, pas un délai de la loi. Une correction n'est visible sur ntanova.com qu'à la mise en ligne suivante : les pages
 * qui le promettent le disent.
 */
export const DELAI_DROITS_JOURS = 7;
