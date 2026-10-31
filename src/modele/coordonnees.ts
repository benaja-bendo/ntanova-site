/**
 * Lire une position collée dans l'administration : ce que Google Maps donne quand on appuie
 * longuement sur un endroit (« -4.79105, 11.92500 »), son adresse de partage, ou les degrés,
 * minutes et secondes de sa fiche (« 4°47'27.8"S 11°55'30.0"E »).
 */
import type { Point } from './geo';

const dansLesBornes = (p: Point): Point | null =>
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  Math.abs(p.latitude) <= 90 &&
  Math.abs(p.longitude) <= 180
    ? p
    : null;

const nombre = (texte: string) => Number(texte.replace(',', '.'));

/** La position lue, ou null si le texte n'en contient pas. La latitude vient d'abord. */
export function lirePosition(texte: string): Point | null {
  const t = texte.trim();
  if (!t) return null;

  // Une adresse Google Maps : l'épingle du lieu (!3d…!4d…) d'abord, puis ?q= ou @ (le centre de la vue).
  const epingle = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t);
  if (epingle)
    return dansLesBornes({ latitude: nombre(epingle[1]!), longitude: nombre(epingle[2]!) });
  const requete =
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(t);
  if (requete)
    return dansLesBornes({ latitude: nombre(requete[1]!), longitude: nombre(requete[2]!) });
  const vue = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t);
  if (vue) return dansLesBornes({ latitude: nombre(vue[1]!), longitude: nombre(vue[2]!) });

  // Degrés, minutes, secondes : 4°47'27.8"S 11°55'30.0"E.
  const dms =
    /(\d+(?:[.,]\d+)?)°\s*(\d+(?:[.,]\d+)?)['′]\s*(\d+(?:[.,]\d+)?)["″]?\s*([NS])[\s,;]*(\d+(?:[.,]\d+)?)°\s*(\d+(?:[.,]\d+)?)['′]\s*(\d+(?:[.,]\d+)?)["″]?\s*([EWO])/i.exec(
      t,
    );
  if (dms) {
    const [, d1, m1, s1, ns, d2, m2, s2, eo] = dms;
    const degres = (d: string, m: string, s: string) =>
      nombre(d) + nombre(m) / 60 + nombre(s) / 3600;
    return dansLesBornes({
      latitude: degres(d1!, m1!, s1!) * (ns!.toUpperCase() === 'S' ? -1 : 1),
      longitude: degres(d2!, m2!, s2!) * (/[WO]/i.test(eo!) ? -1 : 1),
    });
  }

  // Deux nombres décimaux : « -4.79105, 11.92500 », ou à la française « -4,79105 ; 11,92500 ».
  const points = /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/.exec(t);
  if (points) return dansLesBornes({ latitude: nombre(points[1]!), longitude: nombre(points[2]!) });
  const virgules = /^(-?\d{1,2},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/.exec(t);
  if (virgules)
    return dansLesBornes({ latitude: nombre(virgules[1]!), longitude: nombre(virgules[2]!) });
  return null;
}

/** « -4.79105, 11.92500 » : cinq décimales, à un mètre près. */
export function ecrirePosition(p: Point): string {
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}

/** Pour vérifier une position sur Google Maps avant de l'enregistrer. */
export function lienGoogleMaps(p: Point): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
}
