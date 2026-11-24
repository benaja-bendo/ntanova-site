/**
 * « Toutes les villes » (`/villes/`, refonte publique, lot 4, 24/11/2026 ; canevas « Points de repère », planche « Toutes les
 * villes ») : les villes qui ont des fiches, leur département, leurs arrondissements et leurs nombres, puis les lieux connus du
 * référentiel qui n'en ont pas encore.
 *
 * Tout vient de l'arbre public et des divisions de la base, jamais de la maquette : une ville paraît dès qu'une fiche y est
 * publiée, avec ou sans dessin ; les nombres sont ceux de l'accueil, du pied de page et de la page du lieu (`villesDeLAccueil`,
 * `ecolesSous`). Un lieu sans fiche reste du texte, sans lien (fondateur, 16/11/2026) ; rien n'en déduit qu'aucune école n'y a
 * été relevée. Le référentiel ne dit pas quel lieu est un chef-lieu : la page ne le prétend pas.
 *
 * Pur : ni DOM, ni Astro.
 */
import { villesDeLAccueil, type LieuDeLAccueil } from './accueil';
import { ecolesSous, type ArbrePublic } from './geo-divisions';
import type { DivisionPublique } from './ports';

const collateur = new Intl.Collator('fr', { sensitivity: 'base' });

/** L'adresse de « Toutes les villes » : l'accueil, le pied et « À propos » y mènent. */
export const LIEN_VILLES = '/villes/';

export interface VilleAvecFiches {
  nom: string;
  /** La page du lieu : `/ecoles/pointe-noire/`. */
  lien: string;
  /** Les fiches publiées du lieu, ce qu'il contient compris : le nombre de sa page. */
  total: number;
  /** Le département qui la contient, quand le référentiel le dit. */
  departement: string | null;
  /** Ses arrondissements (ou quartiers) qui ont au moins une fiche, du plus fourni au moins fourni. */
  lieux: LieuDeLAccueil[];
}

export interface LieuSansFiche {
  nom: string;
  departement: string | null;
}

export interface PageDesVilles {
  avecFiches: VilleAvecFiches[];
  sansFiche: LieuSansFiche[];
}

/** Le département d'une division (niveau 1), en remontant ses parents ; elle-même si elle en est un. */
function departementDe(
  d: DivisionPublique,
  parId: ReadonlyMap<string, DivisionPublique>,
): string | null {
  for (
    let x: DivisionPublique | undefined = d;
    x;
    x = x.parentId ? parId.get(x.parentId) : undefined
  )
    if (x.niveau === 1) return x.nom;
  return null;
}

/** Le niveau des villes, communes et districts dans la base (`geo_divisions_genre_du_niveau`). */
const NIVEAU_VILLE = 2;

export function pageDesVilles(
  arbre: Pick<ArbrePublic, 'racines' | 'parId'>,
  divisions: readonly DivisionPublique[],
): PageDesVilles {
  const parId = new Map(divisions.map((d) => [d.id, d]));
  const avecFiches = villesDeLAccueil(arbre).map((v) => {
    const division = parId.get(v.divisionId);
    return {
      nom: v.nom,
      lien: v.lien,
      total: v.total,
      departement: division ? departementDe(division, parId) : null,
      lieux: v.puces,
    };
  });

  const sansFiche = divisions
    .filter((d) => d.niveau === NIVEAU_VILLE)
    .filter((d) => {
      const page = arbre.parId.get(d.id);
      return !page || ecolesSous(page).length === 0;
    })
    .map((d) => ({ nom: d.nom, departement: departementDe(d, parId) }))
    .sort(
      (a, b) =>
        collateur.compare(a.nom, b.nom) ||
        collateur.compare(a.departement ?? '', b.departement ?? ''),
    );

  return { avecFiches, sansFiche };
}
