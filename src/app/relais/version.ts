/**
 * Une nouvelle version de l'application. Le service worker (`outils/sw-relais.js`) prend la main dès qu'une nouvelle
 * version est installée, mais la page ouverte garde son ancien code jusqu'au prochain chargement : sans mot, le relais
 * ne sait pas qu'elle existe. Ici on la détecte, et c'est le relais qui décide de recharger. Jamais de rechargement
 * tout seul : une saisie ne se coupe pas.
 */
import { useEffect, useState } from 'react';

/** Un téléphone resté ouvert demande de temps en temps s'il existe une nouvelle version. */
const VERIFICATION_MS = 15 * 60_000;

/** Vrai quand une nouvelle version a pris la main sur celle qui est ouverte. */
export function useNouvelleVersion(): boolean {
  const [disponible, setDisponible] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const conteneur = navigator.serviceWorker;
    // Le tout premier service worker prend la main sans qu'il y ait une version à remplacer : rien à annoncer.
    let avaitUneVersion = conteneur.controller !== null;
    const surChangement = () => {
      if (avaitUneVersion) setDisponible(true);
      avaitUneVersion = true;
    };
    // Le navigateur ne cherche une nouvelle version qu'à l'ouverture d'une page : on la demande aussi quand
    // le réseau revient, quand l'application repasse devant, et de temps en temps. Sans réseau, rien ne se passe.
    const verifier = () => {
      void conteneur
        .getRegistration('/relais/')
        .then((inscription) => inscription?.update())
        .catch(() => undefined);
    };
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') verifier();
    };
    conteneur.addEventListener('controllerchange', surChangement);
    addEventListener('online', verifier);
    document.addEventListener('visibilitychange', surVisibilite);
    const minuterie = setInterval(verifier, VERIFICATION_MS);
    return () => {
      conteneur.removeEventListener('controllerchange', surChangement);
      removeEventListener('online', verifier);
      document.removeEventListener('visibilitychange', surVisibilite);
      clearInterval(minuterie);
    };
  }, []);

  return disponible;
}
