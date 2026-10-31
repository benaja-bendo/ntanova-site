/**
 * La position devant l'entrée : on écoute le GPS une vingtaine de secondes et on
 * garde la meilleure mesure. Le GPS marche sans données, mais le premier
 * repérage peut être lent sans réseau.
 */
import type { Point } from '../../modele/geo';

export interface Mesure extends Point {
  precisionM: number;
  prisLe: string;
}

export type ErreurPosition = 'refusee' | 'indisponible' | 'trop_longue' | 'absente';

const DUREE_MS = 20_000;
const PRECISION_IDEALE_M = 10;

export function mesurerPosition(surMesure: (m: Mesure) => void): {
  fin: Promise<Mesure>;
  arreter: () => void;
} {
  let arreter = () => {};
  const fin = new Promise<Mesure>((resoudre, rejeter) => {
    if (!('geolocation' in navigator)) {
      rejeter(new Error('absente' satisfies ErreurPosition));
      return;
    }
    let meilleure: Mesure | null = null;
    const terminer = () => {
      navigator.geolocation.clearWatch(veille);
      clearTimeout(minuterie);
      if (meilleure) resoudre(meilleure);
      else rejeter(new Error('trop_longue' satisfies ErreurPosition));
    };
    const veille = navigator.geolocation.watchPosition(
      (p) => {
        const mesure: Mesure = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisionM: p.coords.accuracy,
          prisLe: new Date(p.timestamp).toISOString(),
        };
        if (!meilleure || mesure.precisionM <= meilleure.precisionM) {
          meilleure = mesure;
          surMesure(mesure);
        }
        if (mesure.precisionM <= PRECISION_IDEALE_M) terminer();
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(veille);
          clearTimeout(minuterie);
          rejeter(new Error('refusee' satisfies ErreurPosition));
        } else if (e.code === e.POSITION_UNAVAILABLE && !meilleure) {
          navigator.geolocation.clearWatch(veille);
          clearTimeout(minuterie);
          rejeter(new Error('indisponible' satisfies ErreurPosition));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: DUREE_MS },
    );
    const minuterie = setTimeout(terminer, DUREE_MS);
    arreter = terminer;
  });
  return { fin, arreter: () => arreter() };
}
