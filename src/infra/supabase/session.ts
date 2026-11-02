import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { EtatSession, PortSession, Utilisateur } from '../../modele/ports';
import { CLE_SESSION, supabase } from './client';
import { stockageSession } from './stockage-session';

export const session: PortSession = {
  async utilisateur(): Promise<Utilisateur | null> {
    // Lu directement dans le téléphone (IndexedDB) : `getSession()` tenterait de renouveler le
    // jeton, et hors ligne il répondrait « personne ».
    try {
      const garde = JSON.parse((await stockageSession.getItem(CLE_SESSION)) ?? 'null') as {
        user?: { id?: string; email?: string };
      } | null;
      const id = garde?.user?.id;
      return id ? { id, email: garde?.user?.email ?? null } : null;
    } catch {
      return null;
    }
  },

  async connecterAvecGoogle(jetonGoogle, nonce) {
    const { data, error } = await supabase().auth.signInWithIdToken({
      provider: 'google',
      token: jetonGoogle,
      nonce,
    });
    if (error) throw error;
    return { id: data.user.id, email: data.user.email ?? null };
  },

  async deconnecter() {
    await supabase().auth.signOut({ scope: 'local' });
  },

  async etat(): Promise<EtatSession> {
    if (!navigator.onLine) return 'hors_ligne';
    const { data, error } = await supabase().auth.getSession();
    if (data.session) return 'pret';
    if (error && isAuthRetryableFetchError(error)) return 'hors_ligne';
    return 'reconnecter';
  },
};
