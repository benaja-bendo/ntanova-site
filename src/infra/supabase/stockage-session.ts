/**
 * Où le client Supabase garde la session de connexion : dans IndexedDB, jamais dans `localStorage`. Le téléphone
 * relit la session sans réseau (le relais reste « connecté » hors ligne, même si son jeton a expiré).
 *
 * Une session ouverte par la version d'avant est dans `localStorage` : elle est reprise une seule fois, puis retirée
 * de là. C'est le seul endroit du code qui touche encore `localStorage`.
 */
import Dexie, { type EntityTable } from 'dexie';

interface Ligne {
  cle: string;
  valeur: string;
}

const base = new Dexie('ntanova-session') as Dexie & { lignes: EntityTable<Ligne, 'cle'> };
base.version(1).stores({ lignes: 'cle' });

async function reprendreLAncienne(cle: string): Promise<string | null> {
  try {
    if (typeof localStorage === 'undefined') return null;
    const ancienne = localStorage.getItem(cle);
    if (ancienne === null) return null;
    await base.lignes.put({ cle, valeur: ancienne });
    localStorage.removeItem(cle);
    return ancienne;
  } catch {
    return null;
  }
}

/** Le contrat de stockage du client d'authentification (asynchrone). */
export const stockageSession = {
  async getItem(cle: string): Promise<string | null> {
    const ligne = await base.lignes.get(cle);
    return ligne ? ligne.valeur : reprendreLAncienne(cle);
  },
  async setItem(cle: string, valeur: string): Promise<void> {
    await base.lignes.put({ cle, valeur });
  },
  async removeItem(cle: string): Promise<void> {
    await base.lignes.delete(cle);
  },
};
