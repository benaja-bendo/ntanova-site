/**
 * Le port des formulaires publics, branché (refonte, lot 3C). À la construction, la page écrit où envoyer (`pointDesEnvois`) ;
 * dans le navigateur, son script demande le port à cette adresse. Seule la clé `publishable` voyage.
 *
 * Le vrai adaptateur est toujours dans le script de la page, même construite avec le faux serveur : c'est lui que `pnpm poids`
 * pèse. Le faux serveur n'existe que dans une construction de parcours, et se charge à part.
 */
import {
  PUBLIC_ADAPTATEUR,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from 'astro:env/client';
import type { PortDemandes } from '../modele/envoi-public';
import { creerPortDemandes } from './supabase/demandes-publiques';

/** Où les formulaires envoient, écrit dans la page ; rien sans adresse de base : la page ne montre alors aucun formulaire. */
export function pointDesEnvois(): { url: string; cle: string } | null {
  if (PUBLIC_ADAPTATEUR === 'faux') return { url: '', cle: '' };
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  return { url: new URL(PUBLIC_SUPABASE_URL).origin, cle: PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

export async function obtenirPortDemandes(url: string, cle: string): Promise<PortDemandes | null> {
  if (url) return creerPortDemandes(url, cle);
  if (PUBLIC_ADAPTATEUR === 'faux') {
    return (await import('./faux/demandes-publiques')).demandesFausses();
  }
  return null;
}
