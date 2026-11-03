/**
 * Les numéros de téléphone, rangés au format de la base : chiffres seulement,
 * indicatif compris (domaine `telephone` : ^[1-9][0-9]{7,14}$).
 * Au Congo, un numéro national a 9 chiffres (06 123 45 67) : on ajoute 242.
 */

const INDICATIF_CONGO = '242';

/** Le numéro au format de la base, ou null s'il n'en est pas un. */
export function normaliserTelephone(saisie: string): string | null {
  const brut = saisie.trim();
  if (brut === '') return null;
  if (!/^[+\d\s.\-()/]+$/.test(brut)) return null;
  let chiffres = brut.replace(/\D/g, '');
  if (brut.startsWith('+')) {
    // déjà international
  } else if (chiffres.startsWith('00')) {
    chiffres = chiffres.slice(2);
  } else if (chiffres.length === 9) {
    chiffres = INDICATIF_CONGO + chiffres;
  }
  return /^[1-9]\d{7,14}$/.test(chiffres) ? chiffres : null;
}

/** Pour l'affichage : +242 06 123 45 67. */
export function afficherTelephone(numero: string): string {
  if (numero.startsWith(INDICATIF_CONGO) && numero.length === 12) {
    const n = numero.slice(3);
    return `+242 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  return `+${numero}`;
}

/**
 * Un numéro congolais a 9 chiffres après l'indicatif 242 (06 123 45 67). Un numéro rangé avec l'indicatif mais d'une
 * autre longueur se lit mal : le numéro de l'enseigne d'ESTAM était rangé « +242 0064970301 » pour « 06 497 03 01 », un
 * zéro de trop que rien ne signalait, et qui aurait été public (ticket #95). Rend le nombre de chiffres après
 * l'indicatif quand le numéro est suspect, sinon `null`. Un numéro d'un autre pays, ou qui n'est pas un numéro, n'est
 * jamais suspect. `numero` : au format de la base (`normaliserTelephone`).
 */
export function numeroCongolaisSuspect(numero: string | null): { chiffres: number } | null {
  if (numero === null || !/^242\d+$/.test(numero)) return null;
  const chiffres = numero.length - INDICATIF_CONGO.length;
  return chiffres === 9 ? null : { chiffres };
}
