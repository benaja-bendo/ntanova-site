/**
 * « Déjà sur NTanova ? » (lot B du ticket 165, canevas « Espace relais », étape 2) : en tapant le nom, le téléphone propose les
 * écoles connues, **hors ligne**, en deux groupes :
 * - « Près d'ici » : par la distance (même endroit possible), quel que soit le nom ;
 * - « Même nom, ailleurs » : par le nom, dans tout le Congo (un autre site possible). Un même nom ne prouve rien.
 *
 * La règle est celle de la base (`school_name_core`, `similar_schools` : 100 m, 500 m, ressemblance 0,45), écrite une fois ici
 * pour le téléphone et testée contre les mêmes cas (`deja-sur-ntanova.test.ts`). La réponse du relais part avec la fiche comme
 * un indice : elle ne décide rien, ne fusionne rien et ne bloque jamais l'envoi.
 */
import { distanceMetres, type Point } from './geo';

/** Les mots qui ne distinguent pas une école d'une autre (comme la base). */
const MOTS_GENERIQUES = new Set(
  'complexe complexes scolaire scolaires ecole ecoles groupe groupes institut instituts prive privee prives privees centre centres site sites college lycee primaire maternelle cs gs le la les de du des d l et en a au aux'.split(
    ' ',
  ),
);

/** Le nom sans accents, en minuscules, espaces réduits (`norm_text`). */
export const normaliser = (nom: string): string =>
  nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Le cœur d'un nom : sans accents ni mots génériques (`school_name_core`). « Complexe scolaire Les Palmiers » → « palmiers ». */
export function noyauDuNom(nom: string): string {
  return normaliser(nom)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((m) => m !== '' && !MOTS_GENERIQUES.has(m))
    .join(' ');
}

/** Les trigrammes d'un texte, comme `pg_trgm` : chaque mot entouré de deux espaces devant et d'un derrière. */
function trigrammes(texte: string): Set<string> {
  const t = new Set<string>();
  for (const mot of texte.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!mot) continue;
    const m = `  ${mot} `;
    for (let i = 0; i + 3 <= m.length; i++) t.add(m.slice(i, i + 3));
  }
  return t;
}

/** La ressemblance de deux cœurs de noms (`similarity` de `pg_trgm`), de 0 à 1 ; 0 si l'un des deux est vide. */
export function ressemblance(a: string, b: string): number {
  if (!a || !b) return 0;
  const x = trigrammes(a);
  const y = trigrammes(b);
  let commun = 0;
  for (const g of x) if (y.has(g)) commun++;
  const union = x.size + y.size - commun;
  return union === 0 ? 0 : commun / union;
}

export const SEUIL_MEME_ENDROIT_M = 100;
export const SEUIL_PRES_D_ICI_M = 500;
export const SEUIL_RESSEMBLANCE = 0.45;

/** Une école que le téléphone connaît : un site avec sa position, ou une école du pays sans position (liste nationale). */
export interface EcoleConnue {
  id: string;
  nom: string;
  sigle: string | null;
  /** L'école (institution) : les sites d'une même école la partagent. */
  institutionId: string | null;
  sites: number;
  /** La ville ou le quartier, pour la ligne sous le nom. */
  lieu: string | null;
  position: Point | null;
  /** Lot F : le chemin de sa vignette publique, chargée seulement quand le téléphone capte. */
  vignette?: string | null;
}

export interface Proposition extends EcoleConnue {
  distanceM: number | null;
  ressemblance: number;
}

export interface Propositions {
  presDIci: Proposition[];
  memeNomAilleurs: Proposition[];
}

/**
 * Les deux groupes, cinq écoles au plus chacun. Un nom fait seulement de mots génériques ne rapproche jamais par le nom ;
 * sans position, seul « Même nom, ailleurs » existe. Une école proche n'est jamais répétée dans le second groupe, et
 * une école à plusieurs sites n'y paraît qu'une fois.
 */
export function rapprocher(
  nom: string,
  position: Point | null,
  connues: readonly EcoleConnue[],
): Propositions {
  const noyau = noyauDuNom(nom);
  const jugees = connues.map((e): Proposition => ({
    ...e,
    distanceM: position && e.position ? Math.round(distanceMetres(position, e.position)) : null,
    ressemblance: noyau ? ressemblance(noyau, noyauDuNom(e.nom)) : 0,
  }));
  const presDIci = jugees
    .filter((e) => e.distanceM !== null && e.distanceM <= SEUIL_PRES_D_ICI_M)
    .sort((a, b) => a.distanceM! - b.distanceM! || b.ressemblance - a.ressemblance)
    .slice(0, 5);
  const proches = new Set(presDIci.map((e) => e.institutionId ?? e.id));
  const vues = new Set<string>();
  const memeNomAilleurs = jugees
    .filter((e) => e.ressemblance >= SEUIL_RESSEMBLANCE && !proches.has(e.institutionId ?? e.id))
    .sort((a, b) => b.ressemblance - a.ressemblance || a.nom.localeCompare(b.nom, 'fr'))
    .filter((e) => {
      const cle = e.institutionId ?? e.id;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    })
    .slice(0, 5);
  return { presDIci, memeNomAilleurs };
}

/** « Même endroit possible » : à 100 m, ou à 500 m avec un nom qui ressemble (le verdict `deja_la` de la base). */
export const memeEndroitPossible = (p: Proposition): boolean =>
  p.distanceM !== null &&
  (p.distanceM <= SEUIL_MEME_ENDROIT_M ||
    (p.distanceM <= SEUIL_PRES_D_ICI_M && p.ressemblance >= SEUIL_RESSEMBLANCE));

/** « à 1,1 km », « à 300 m » : la distance comme le relais la lit. */
export function distanceEnMots(m: number): string {
  if (m < 1000) return `à ${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `à ${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

/** Chercher une école dans tout NTanova par son nom ou son sigle (« Un autre site d'une école connue »). */
export function chercherUneEcole(texte: string, ecoles: readonly EcoleConnue[]): EcoleConnue[] {
  const t = normaliser(texte);
  if (t.length < 2) return [];
  const noyau = noyauDuNom(texte);
  return ecoles
    .map((e) => ({
      e,
      score:
        (e.sigle && normaliser(e.sigle) === t ? 2 : 0) +
        (normaliser(e.nom).includes(t) ? 1 : 0) +
        (noyau ? ressemblance(noyau, noyauDuNom(e.nom)) : 0),
    }))
    .filter((x) => x.score >= SEUIL_RESSEMBLANCE)
    .sort((a, b) => b.score - a.score || a.e.nom.localeCompare(b.e.nom, 'fr'))
    .slice(0, 10)
    .map((x) => x.e);
}
