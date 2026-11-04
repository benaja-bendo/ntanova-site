/** Vue publique et filtres de la carte : aucune position personnelle persistée. */
import type { FeatureEcole } from './donnees';
import { BOITE_DU_PAYS, ZOOM_MIN_DE_LA_CARTE, zoomMaxEn, type Fenetre } from './fond';
export interface VueCarte {
  zoom: number;
  latitude: number;
  longitude: number;
}
export function lireVue(hash: string): VueCarte | null {
  const m = /^#([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)$/.exec(hash);
  if (!m) return null;
  const [zoom, latitude, longitude] = m.slice(1).map(Number);
  if (![zoom, latitude, longitude].every(Number.isFinite)) return null;
  const [o, s, e, n] = BOITE_DU_PAYS;
  if (latitude! < s || latitude! > n || longitude! < o || longitude! > e) return null;
  return {
    zoom: Math.max(ZOOM_MIN_DE_LA_CARTE, Math.min(zoom!, zoomMaxEn(longitude!, latitude!))),
    latitude: latitude!,
    longitude: longitude!,
  };
}
export const adresseVue = (v: VueCarte): string =>
  `#${Number(v.zoom.toFixed(2))}/${Number(v.latitude.toFixed(5))}/${Number(v.longitude.toFixed(5))}`;
export function filtrerEcoles(
  ecoles: readonly FeatureEcole[],
  cycle = '',
  boite?: Fenetre,
): FeatureEcole[] {
  return ecoles
    .filter((e) => {
      const [x, y] = e.geometry.coordinates;
      return (
        (!cycle || e.properties.lettres.includes(cycle)) &&
        (!boite || (x >= boite[0] && x <= boite[2] && y >= boite[1] && y <= boite[3]))
      );
    })
    .map((e) =>
      cycle
        ? {
            ...e,
            properties: { ...e.properties, lettre: cycle, rang: 'MPCLTS'.indexOf(cycle) + 1 },
          }
        : e,
    );
}
