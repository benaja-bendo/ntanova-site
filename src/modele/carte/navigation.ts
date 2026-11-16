/** Vue publique et filtres de la carte : aucune position personnelle persistée. */
import type { MultiPolygone, Point } from '../geo';
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

/**
 * La carte cadrée sur un lieu (ticket 146 ; depuis le lot 4 bis, la vue Carte de « Les écoles ») : les anciens plans dessinés
 * et les pages de lieux y mènent. Le cadre couvre le contour de la zone quand la base le connaît, sinon ses écoles situées,
 * sinon son point ; sans rien de tout cela, la vue Carte s'ouvre sur son cadre par défaut.
 */
export function lienCarteDuLieu(lieu: {
  contour: MultiPolygone | null;
  position: Point | null;
  ecoles?: readonly { latitude: number | null; longitude: number | null }[];
}): string {
  const points: (readonly number[])[] = lieu.contour
    ? lieu.contour.flat(2)
    : (lieu.ecoles ?? []).flatMap((e) =>
        e.latitude !== null && e.longitude !== null ? [[e.longitude, e.latitude]] : [],
      );
  if (points.length === 0 && lieu.position)
    points.push([lieu.position.longitude, lieu.position.latitude]);
  let [ouest, sud, est, nord] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of points) {
    if (lng === undefined || lat === undefined) continue;
    ouest = Math.min(ouest, lng);
    est = Math.max(est, lng);
    sud = Math.min(sud, lat);
    nord = Math.max(nord, lat);
  }
  // Lot 4 bis (16/11/2026) : la carte vit dans « Les écoles » ; le lieu devient la « Zone de la carte » de la vue Carte.
  if (!Number.isFinite(ouest)) return '/ecoles/?vue=carte';
  return lienZoneCarte([ouest, sud, est, nord]);
}

/** « Les écoles », vue Carte, limitée à une zone (ouest, sud, est, nord), avec une petite marge autour. */
export function lienZoneCarte([ouest, sud, est, nord]: readonly [
  number,
  number,
  number,
  number,
]): string {
  const marge = Math.max((est - ouest) * 0.08, (nord - sud) * 0.08, 0.004);
  const cadre = [ouest - marge, sud - marge, est + marge, nord + marge].map((x) => x.toFixed(4));
  return `/ecoles/?vue=carte&cadre=${cadre.join(',')}`;
}
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

/** L'identifiant d'une fiche, lu à la fin de son adresse (`/ecoles/complexe-exemple-482913/` → `482913`). */
export function numeroDuLien(lien: string): string | null {
  return /-(\d{6})\/$/.exec(lien)?.[1] ?? null;
}

/**
 * L'école que désigne `/carte/?ecole=…` (ticket 147) : son identifiant, ou son adresse ; un lien d'avant
 * (`/ecoles/congo/pointe-noire/tie-tie/complexe-exemple/`) se lit encore par son dernier nom, s'il ne désigne qu'une école.
 */
export function ecoleDuParametre<F extends { properties: { lien: string } }>(
  ecoles: readonly F[],
  valeur: string | null,
): F | undefined {
  if (!valeur) return undefined;
  if (/^\d{6}$/.test(valeur)) return ecoles.find((e) => numeroDuLien(e.properties.lien) === valeur);
  const exacte = ecoles.find((e) => e.properties.lien === valeur);
  if (exacte) return exacte;
  const nom = valeur.split('/').filter(Boolean).pop();
  if (!nom) return undefined;
  const memes = ecoles.filter((e) => e.properties.lien.startsWith(`/ecoles/${nom}-`));
  return memes.length === 1 ? memes[0] : undefined;
}
