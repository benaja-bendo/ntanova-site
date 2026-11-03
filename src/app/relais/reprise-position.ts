/**
 * La position est bloquée : le relais va dans les réglages du téléphone, change l'autorisation, puis revient. À son
 * retour on relance la mesure, sans qu'il ait à chercher le bouton (ticket #72).
 *
 * Deux signaux, parce qu'aucun n'est sûr partout : le retour dans l'application (la page redevient visible), et le
 * changement d'autorisation (Chrome sur Android et sur ordinateur le disent ; Safari et Chrome sur iPhone le disent mal,
 * et leur état « prompt » ment après un refus : on ne s'en sert que pour relancer, jamais pour décider). Un délai
 * évite deux relances d'un même retour, et une relance juste après l'échec qu'on vient d'afficher.
 */
import { useEffect, useRef } from 'react';

/** Le temps pendant lequel un nouveau signal ne relance pas : un seul retour déclenche parfois plusieurs événements. */
const DELAI_ENTRE_RELANCES_MS = 1500;

export function useReprisePosition(bloquee: boolean, relancer: () => void): void {
  const derniere = useRef(relancer);
  useEffect(() => {
    derniere.current = relancer;
  });

  useEffect(() => {
    if (!bloquee) return;
    let dernierEssai = Date.now();
    const relancerSiRevenu = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - dernierEssai < DELAI_ENTRE_RELANCES_MS) return;
      dernierEssai = Date.now();
      derniere.current();
    };
    document.addEventListener('visibilitychange', relancerSiRevenu);
    window.addEventListener('focus', relancerSiRevenu);
    window.addEventListener('pageshow', relancerSiRevenu);

    let etat: PermissionStatus | null = null;
    let actif = true;
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((e) => {
        if (!actif) return;
        etat = e;
        e.onchange = () => {
          if (e.state === 'granted') relancerSiRevenu();
        };
      })
      .catch(() => {});

    return () => {
      actif = false;
      document.removeEventListener('visibilitychange', relancerSiRevenu);
      window.removeEventListener('focus', relancerSiRevenu);
      window.removeEventListener('pageshow', relancerSiRevenu);
      if (etat) etat.onchange = null;
    };
  }, [bloquee]);
}
