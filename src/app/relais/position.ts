/**
 * La position devant l'entrée : on écoute le GPS une vingtaine de secondes et on
 * garde la meilleure mesure. Le GPS marche sans données, mais le premier
 * repérage peut être lent sans réseau.
 *
 * Seul un refus de l'utilisateur arrête l'écoute. « Position indisponible » et
 * « délai dépassé » sont souvent passagers (macOS en envoie un avant la première
 * mesure) : on continue d'écouter, et on tente aussi une mesure moins précise
 * (Wi-Fi, antennes). On ne conclut qu'à la fin du délai.
 */
import type { Point } from '../../modele/geo';

export interface Mesure extends Point {
  precisionM: number;
  prisLe: string;
}

export type ErreurPosition = 'refusee' | 'indisponible' | 'trop_longue' | 'absente';

/** Les codes de GeolocationPositionError. */
const REFUSEE = 1;
const INDISPONIBLE = 2;

const DUREE_MS = 20_000;
const PRECISION_IDEALE_M = 10;

export function mesurerPosition(
  surMesure: (m: Mesure) => void,
  geolocalisation: Geolocation | undefined = globalThis.navigator?.geolocation,
  dureeMs = DUREE_MS,
): { fin: Promise<Mesure>; arreter: () => void } {
  let arreter = () => {};
  const fin = new Promise<Mesure>((resoudre, rejeter) => {
    if (!geolocalisation) {
      rejeter(new Error('absente' satisfies ErreurPosition));
      return;
    }
    const geo = geolocalisation;
    let meilleure: Mesure | null = null;
    let derniereErreur: ErreurPosition = 'trop_longue';
    let repliTente = false;
    let fini = false;

    const conclure = (refus?: ErreurPosition) => {
      if (fini) return;
      fini = true;
      geo.clearWatch(veille);
      clearTimeout(minuterie);
      if (refus) rejeter(new Error(refus));
      else if (meilleure) resoudre(meilleure);
      else rejeter(new Error(derniereErreur));
    };

    const recevoir = (p: GeolocationPosition) => {
      if (fini) return;
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
      if (mesure.precisionM <= PRECISION_IDEALE_M) conclure();
    };

    const echouer = (e: GeolocationPositionError) => {
      if (fini) return;
      if (e.code === REFUSEE) {
        conclure('refusee');
        return;
      }
      if (e.code === INDISPONIBLE) derniereErreur = 'indisponible';
      if (!repliTente) {
        repliTente = true;
        geo.getCurrentPosition(recevoir, echouer, {
          enableHighAccuracy: false,
          maximumAge: 60_000,
          timeout: dureeMs,
        });
      }
    };

    const veille = geo.watchPosition(recevoir, echouer, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: dureeMs,
    });
    const minuterie = setTimeout(() => conclure(), dureeMs);
    arreter = () => conclure();
  });
  return { fin, arreter: () => arreter() };
}
