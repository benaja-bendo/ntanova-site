/**
 * Le périmètre de l'annuaire, dit sur « À propos » (refonte publique, lot 4, 24/11/2026 ; planche « À propos ») : des nombres
 * calculés à la construction depuis le catalogue publié, jamais écrits à la main. Les villes sont celles de l'accueil, du pied et
 * de « Toutes les villes » (`villesDeLAccueil`) ; le supérieur compte les fiches qui l'enseignent.
 *
 * Pur : ni DOM, ni Astro.
 */
import { villesDeLAccueil } from './accueil';
import type { ArbrePublic } from './geo-divisions';
import type { EcolePubliee } from './ports';

export interface PerimetreDeLAnnuaire {
  fiches: number;
  /** Les villes qui ont au moins une fiche, par ordre alphabétique. */
  villes: string[];
  /** Les fiches qui enseignent le supérieur. */
  superieur: number;
}

export function perimetreDeLAnnuaire(
  arbre: Pick<ArbrePublic, 'racines'>,
  ecoles: readonly Pick<EcolePubliee, 'niveaux'>[],
): PerimetreDeLAnnuaire {
  return {
    fiches: ecoles.length,
    villes: villesDeLAccueil(arbre).map((v) => v.nom),
    superieur: ecoles.filter((e) => e.niveaux.includes('superieur')).length,
  };
}

/** « Pointe-Noire, Brazzaville et Ouesso » : une liste dite en français. */
export function enumeration(noms: readonly string[]): string {
  if (noms.length <= 1) return noms[0] ?? '';
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}
