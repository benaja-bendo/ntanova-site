import { createContext, useContext, useEffect, useState } from 'react';
import type { Adaptateurs } from '../../infra/index';
import type { ResultatEnvoi } from './file-envoi';

export interface Contexte {
  adaptateurs: Adaptateurs;
  /** Le résultat du dernier envoi : « reconnecter » affiche le bandeau de connexion. */
  envoi: ResultatEnvoi | 'en_cours' | null;
  synchroniser: () => void;
  /** Après une connexion Google réussie. */
  surConnexion: () => void;
  /** Après « Se déconnecter » : retour à l'écran de connexion. Les fiches du téléphone restent. */
  surDeconnexion: () => void;
  /** Le lien WhatsApp vers NTanova (de la configuration) ; nul quand aucun numéro n'est configuré. */
  lienNTanova: string | null;
}

export const ContexteRelais = createContext<Contexte | null>(null);

export function useRelais(): Contexte {
  const contexte = useContext(ContexteRelais);
  if (!contexte) throw new Error('ContexteRelais manquant');
  return contexte;
}

export { useEnLigne } from '../commun/BoutonGoogle';

// La navigation : #lot, #fiches, #ajouter/1… Le dièse survit à la fermeture de
// l'onglet pendant la photo, et la page /relais/ reste la seule à mettre en cache.

export { aller, useAdresse } from '../commun/adresse';

/** L'heure, mise à jour chaque minute (pour « Dernier envoi à 14 h 05 »). */
export function useMaintenant(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(minuterie);
  }, []);
  return maintenant;
}
