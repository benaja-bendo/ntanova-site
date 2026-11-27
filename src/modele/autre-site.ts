/**
 * « Un autre site de cette école ? » (ticket 236, 27/11) : un nom proche ne suffit pas. La base propose des candidats par la
 * ressemblance du nom entier ; un nom de lieu ou un mot commun y comptait (une école à 3 km pour son quartier, une autre à
 * 379 km). L'écran ne garde « autre site » (ou « déjà dans la base ») que sur un mot DISTINCTIF commun : ni un mot qui dit le
 * genre d'établissement, ni un nom de lieu. Et plus l'école est loin, plus il en faut :
 * - jusqu'à 30 km (ou distance inconnue) : au moins un mot distinctif commun ;
 * - au-delà : le même nom distinctif, mot pour mot.
 * Un nom fait seulement de lieux et de mots courants ne se rapproche que d'un nom identique. Sinon, une école à moins de
 * 500 m reste dite « voisine ». Rien n'est jamais fusionné : l'administration choisit. Pur : ni DOM, ni réseau.
 */
import { noyauDuNom, ressemblance, SEUIL_PRES_D_ICI_M, normaliser } from './deja-sur-ntanova';
import type { EcoleSimilaire } from './fiche-admin';

/** Au-delà, les écoles ne sont plus de la même ville. */
export const SEUIL_MEME_VILLE_M = 30_000;
/** Deux mots se confondent à partir de cette ressemblance (un pluriel, une lettre oubliée). */
const SEUIL_MEME_MOT = 0.6;

/** Des mots qui ne distinguent pas une école, en plus de ceux que la base retire déjà. */
const MOTS_COURANTS = new Set(
  'saint sainte st ste notre dame bilingue bilingues international internationale academie academy enseignement superieur superieure technique techniques professionnel professionnelle formation formations creche garderie jardin enfants enfance prescolaire elementaire secondaire general generale moderne nouvelle nouveau pole cours etablissement etablissements campus annexe petit petits petite petites grand grande beau belle'.split(
    ' ',
  ),
);

const mots = (texte: string) =>
  normaliser(texte)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((m) => m !== '');

/** Les mots des lieux connus (villes, arrondissements, quartiers, leurs autres écritures). */
export function motsDeLieux(lieux: readonly (string | null | undefined)[]): Set<string> {
  return new Set(lieux.flatMap((l) => (l ? mots(l) : [])));
}

/** Ce qui distingue un nom : sans mots génériques, sans mots courants, sans noms de lieux. */
export function motsDistinctifs(nom: string, lieux: ReadonlySet<string>): string[] {
  return mots(noyauDuNom(nom)).filter((m) => !MOTS_COURANTS.has(m) && !lieux.has(m));
}

const contient = (liste: readonly string[], mot: string) =>
  liste.some((x) => ressemblance(mot, x) >= SEUIL_MEME_MOT);

/** Les deux noms peuvent-ils être ceux d'une même école, à cette distance ? */
export function memeEcolePossible(
  nom: string,
  autre: string,
  distanceM: number | null,
  lieux: ReadonlySet<string>,
): boolean {
  const a = motsDistinctifs(nom, lieux);
  const b = motsDistinctifs(autre, lieux);
  if (a.length === 0 || b.length === 0) {
    const x = noyauDuNom(nom);
    return x !== '' && x === noyauDuNom(autre);
  }
  if (distanceM !== null && distanceM > SEUIL_MEME_VILLE_M)
    return a.every((m) => contient(b, m)) && b.every((m) => contient(a, m));
  return a.some((m) => contient(b, m));
}

const RANG: Record<EcoleSimilaire['verdict'], number> = { deja_la: 0, autre_site: 1, voisine: 2 };

/** Les candidats de la base, relus : un rapprochement sans mot distinctif tombe, ou devient une simple voisine. */
export function affinerLesCandidats(
  nom: string,
  candidats: readonly EcoleSimilaire[],
  lieux: ReadonlySet<string>,
): EcoleSimilaire[] {
  return candidats
    .flatMap((c): EcoleSimilaire[] => {
      if (c.verdict === 'voisine') return [c];
      // La base écrit « Nom — nom du site » : seul le nom de l'école se compare.
      const ecole = c.nom.split(' — ')[0]!;
      if (memeEcolePossible(nom, ecole, c.distanceM, lieux)) return [c];
      return c.distanceM !== null && c.distanceM <= SEUIL_PRES_D_ICI_M
        ? [{ ...c, verdict: 'voisine' }]
        : [];
    })
    .sort((a, b) => RANG[a.verdict] - RANG[b.verdict]);
}
