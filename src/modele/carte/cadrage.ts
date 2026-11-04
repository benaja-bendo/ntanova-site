/**
 * Le cadre par défaut de la carte interactive (ticket 103, décision du 03/11) : la **ville qui a le plus d'écoles sur la
 * carte** (à égalité, celle qui a une zone « relevé en cours »), cadrée sur ses zones « relevé en cours » et sur ses
 * écoles. Sans école ni zone « relevé en cours » nulle part : le pays entier. Le téléphone ne s'approche jamais plus que
 * `ZOOM_MAX_DU_CADRE_PAR_DEFAUT` (le cadre ne tombe pas sur du vide : c'est le zoom de l'îlot qui le borne).
 *
 * Calculé à la construction à partir des deux fichiers GeoJSON de la carte : le même instantané que ce que la carte affiche.
 */
import { BOITE_DU_PAYS, type Fenetre } from './fond';
import type { FeatureEcole, FeatureZone } from './donnees';

export interface CadreParDefaut {
  /** La ville cadrée (`congo/pointe-noire`), ou rien pour le pays entier. */
  ville: string | null;
  /** Ouest, sud, est, nord. */
  boite: Fenetre;
  /** Les écoles de la carte dans cette ville. */
  ecoles: number;
}

/** La ville d'une adresse du site : `/ecoles/congo/pointe-noire/tie-tie/` → `congo/pointe-noire`. */
export function villeDuLien(lien: string): string | null {
  const m = /^\/ecoles\/([^/]+)\/([^/]+)(?:\/|$)/.exec(lien);
  return m ? `${m[1]}/${m[2]}` : null;
}

type Coordonnee = readonly number[];

function pointsDeLaZone(zone: FeatureZone): Coordonnee[] {
  const g = zone.geometry;
  return g.type === 'Point' ? [g.coordinates] : g.coordinates.flat(2);
}

/** La plus petite boîte qui contient ces points ; rien quand il n'y en a aucun. */
export function boiteDes(points: readonly Coordonnee[]): Fenetre | null {
  if (points.length === 0) return null;
  let ouest = Infinity;
  let sud = Infinity;
  let est = -Infinity;
  let nord = -Infinity;
  for (const [lng, lat] of points) {
    if (lng === undefined || lat === undefined) continue;
    ouest = Math.min(ouest, lng);
    est = Math.max(est, lng);
    sud = Math.min(sud, lat);
    nord = Math.max(nord, lat);
  }
  return [ouest, sud, est, nord];
}

export function cadreParDefaut(
  zones: readonly FeatureZone[],
  ecoles: readonly FeatureEcole[],
): CadreParDefaut {
  const ecolesParVille = new Map<string, FeatureEcole[]>();
  for (const e of ecoles) {
    const ville = villeDuLien(e.properties.lien);
    if (ville) ecolesParVille.set(ville, [...(ecolesParVille.get(ville) ?? []), e]);
  }
  const zonesActives = (ville: string) =>
    zones.filter((z) => z.properties.etat === 'actif' && villeDuLien(z.properties.lien) === ville);

  const villes = new Set<string>([
    ...ecolesParVille.keys(),
    ...zones
      .filter((z) => z.properties.etat === 'actif')
      .flatMap((z) => villeDuLien(z.properties.lien) ?? []),
  ]);
  const classees = [...villes].sort(
    (a, b) =>
      (ecolesParVille.get(b)?.length ?? 0) - (ecolesParVille.get(a)?.length ?? 0) ||
      zonesActives(b).length - zonesActives(a).length ||
      a.localeCompare(b, 'fr'),
  );
  const ville = classees[0];
  if (!ville) return { ville: null, boite: BOITE_DU_PAYS, ecoles: 0 };

  const dedans = ecolesParVille.get(ville) ?? [];
  const boite = boiteDes([
    // Une zone « relevé en cours » en polygone donne son contour ; en point (contour inconnu), son point.
    ...zonesActives(ville)
      .filter((z) => z.properties.genre === 'zone')
      .flatMap(pointsDeLaZone),
    ...dedans.map((e) => e.geometry.coordinates),
  ]);
  // Une ville dont la seule zone « relevé en cours » est un point (ou qui n'en a plus) : son point, faute de mieux.
  const repli = boiteDes(zonesActives(ville).flatMap(pointsDeLaZone));
  return { ville, boite: boite ?? repli ?? BOITE_DU_PAYS, ecoles: dedans.length };
}
