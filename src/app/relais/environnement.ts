/**
 * Le téléphone et le navigateur du relais, tels que le navigateur les décrit : de quoi écrire l'aide de la position
 * pour SON téléphone (`src/modele/aide-position.ts`). Une application lancée depuis l'écran d'accueil le dit par
 * `navigator.standalone` (iPhone) ou par le mode d'affichage (Android).
 */
import { lireEnvironnement, type Environnement } from '../../modele/aide-position';

export function environnementActuel(): Environnement {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  const installee =
    nav?.standalone === true ||
    (globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false);
  return lireEnvironnement({
    userAgent: nav?.userAgent ?? '',
    platform: nav?.platform,
    maxTouchPoints: nav?.maxTouchPoints,
    installee,
  });
}

/**
 * L'état de l'autorisation de position tel que le navigateur l'annonce : « granted », « denied », « prompt », ou
 * « inconnue » quand il ne sait pas le dire. Pour le journal seulement : sur iPhone, Safari et Chrome annoncent parfois
 * « prompt » après un refus, on ne s'en sert jamais pour décider.
 */
export async function etatDeLAutorisation(): Promise<string> {
  try {
    const etat = await navigator.permissions?.query({ name: 'geolocation' });
    return etat?.state ?? 'inconnue';
  } catch {
    return 'inconnue';
  }
}
