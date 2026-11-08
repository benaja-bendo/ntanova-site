/**
 * Le repère de l'école (« près du marché ») : ce que les familles lisent sous « Où la trouver ». Audit de la fiche
 * relais, 08/11/2026 : il était le 6ᵉ champ sur 7 de l'étape 2/3, avec un libellé abstrait et « facultatif » ; 8 nouveaux
 * relevés sur 17 en avaient un. Il remonte sous le nom, se répond en un toucher (« Près du marché »), et le relais le
 * précise s'il veut. La donnée reste le même texte (`landmark`) : aucune migration.
 *
 * Pur : ni base, ni écran.
 */

export interface RepereRapide {
  cle: string;
  /** Le mot de la puce. */
  libelle: string;
  /** Ce qu'un toucher écrit dans le champ. */
  phrase: string;
}

export const REPERES_RAPIDES: readonly RepereRapide[] = [
  { cle: 'marche', libelle: 'Marché', phrase: 'Près du marché' },
  { cle: 'pharmacie', libelle: 'Pharmacie', phrase: 'Près de la pharmacie' },
  { cle: 'carrefour', libelle: 'Carrefour', phrase: 'Près du carrefour' },
  { cle: 'rond-point', libelle: 'Rond-point', phrase: 'Près du rond-point' },
  { cle: 'eglise', libelle: 'Église', phrase: 'Près de l’église' },
  { cle: 'mosquee', libelle: 'Mosquée', phrase: 'Près de la mosquée' },
  { cle: 'station', libelle: 'Station-service', phrase: 'Près de la station-service' },
  { cle: 'hopital', libelle: 'Hôpital', phrase: 'Près de l’hôpital' },
];

/** Pour comparer sans se soucier de la casse, des espaces ni du type d'apostrophe (un clavier de téléphone met ’ ou '). */
const norme = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** Le texte du champ dit-il déjà cette phrase ? */
export const repereCoche = (texte: string, phrase: string): boolean =>
  norme(texte).includes(norme(phrase));

const majuscule = (t: string) => (t === '' ? t : t.charAt(0).toUpperCase() + t.slice(1));
const minuscule = (t: string) => (t === '' ? t : t.charAt(0).toLowerCase() + t.slice(1));

/**
 * Un toucher : la phrase s'écrit, ou s'efface si elle y est déjà. Le texte que le relais a ajouté de lui-même reste
 * (« Près du marché, derrière la pharmacie de Total » → retirer le marché garde le reste).
 */
export function basculerRepere(texte: string, phrase: string): string {
  const propre = texte.trim();
  if (repereCoche(propre, phrase)) {
    const sans = propre
      // Retire la phrase, à la casse et à l'apostrophe près.
      .split(',')
      .map((morceau) => morceau.trim())
      .filter((morceau) => morceau !== '' && norme(morceau) !== norme(phrase))
      .join(', ');
    return majuscule(sans);
  }
  if (propre === '') return phrase;
  return `${propre.replace(/[,\s]+$/, '')}, ${minuscule(phrase)}`;
}

/** Aucun repère écrit : le texte est vide ou ne contient que des blancs. */
export const repereManquant = (texte: string): boolean => texte.trim() === '';
