import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { Adaptateurs } from '../../infra/index';
import type { ResultatEnvoi } from './file-envoi';

export interface Contexte {
  adaptateurs: Adaptateurs;
  /** Le résultat du dernier envoi : « reconnecter » affiche le bandeau de connexion. */
  envoi: ResultatEnvoi | 'en_cours' | null;
  synchroniser: () => void;
  /** Après une connexion Google réussie. */
  surConnexion: () => void;
}

export const ContexteRelais = createContext<Contexte | null>(null);

export function useRelais(): Contexte {
  const contexte = useContext(ContexteRelais);
  if (!contexte) throw new Error('ContexteRelais manquant');
  return contexte;
}

function abonnerReseau(rappel: () => void) {
  addEventListener('online', rappel);
  addEventListener('offline', rappel);
  return () => {
    removeEventListener('online', rappel);
    removeEventListener('offline', rappel);
  };
}

export function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerReseau, () => navigator.onLine);
}

// La navigation : #lot, #fiches, #ajouter/1… Le dièse survit à la fermeture de
// l'onglet pendant la photo, et la page /relais/ reste la seule à mettre en cache.

function abonnerAdresse(rappel: () => void) {
  addEventListener('hashchange', rappel);
  return () => removeEventListener('hashchange', rappel);
}

export function useAdresse(): string[] {
  const diese = useSyncExternalStore(abonnerAdresse, () => location.hash);
  return diese.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function aller(chemin: string, remplacer = false): void {
  const cible = `#${chemin}`;
  if (remplacer) history.replaceState(null, '', cible);
  else history.pushState(null, '', cible);
  dispatchEvent(new HashChangeEvent('hashchange'));
}

/** L'heure, mise à jour chaque minute (pour « Dernier envoi à 14 h 05 »). */
export function useMaintenant(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(minuterie);
  }, []);
  return maintenant;
}
