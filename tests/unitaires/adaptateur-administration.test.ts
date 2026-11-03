import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortAdministration } from '../../src/infra/supabase/administration';

/**
 * La liste des relais de l'administration (ticket #78) : l'adresse de chaque relais vient d'une fonction de la base
 * (`relay_identities`). Le code peut arriver avant `supabase db push` : sans la fonction, la liste se lit quand même,
 * sans adresses (comme avant), au lieu de tomber en erreur.
 */
function fausseBase(rpc: (nom: string) => { data: unknown; error: unknown }) {
  const tables: Record<string, unknown[]> = {
    relais: [
      {
        id: 'r1',
        prenom: 'Marie',
        statut: 'en_attente',
        lot_id: null,
        cree_le: '2026-11-03T08:00:00Z',
        active_le: null,
      },
      {
        id: 'r2',
        prenom: 'Paul',
        statut: 'actif',
        lot_id: null,
        cree_le: '2026-11-02T08:00:00Z',
        active_le: '2026-11-02T09:00:00Z',
      },
    ],
    relay_counters: [],
  };
  const requete = (lignes: unknown[]) => {
    const constructeur = {
      select: () => constructeur,
      order: () => constructeur,
      then: (suite: (r: unknown) => unknown) =>
        Promise.resolve({ data: lignes, error: null }).then(suite),
    };
    return constructeur;
  };
  const client = {
    from: (table: string) => requete(tables[table] ?? []),
    rpc: (nom: string) => Promise.resolve(rpc(nom)),
  };
  return () => client as unknown as SupabaseClient;
}

describe('la liste des relais, côté Supabase', () => {
  it('rend l’adresse de chaque relais, quand la base la connaît', async () => {
    const admin = creerPortAdministration(
      fausseBase(() => ({ data: [{ relay_id: 'r1', email: 'marie@exemple.test' }], error: null })),
    );
    const relais = await admin.relais();
    expect(relais.find((r) => r.id === 'r1')?.email).toBe('marie@exemple.test');
    // Un relais dont la base n'a pas l'adresse (un compte d'avant) : nulle, jamais une chaîne vide.
    expect(relais.find((r) => r.id === 'r2')?.email).toBeNull();
  });

  it('se lit quand même si la base n’a pas encore la fonction : sans adresses, jamais en erreur', async () => {
    const admin = creerPortAdministration(
      fausseBase(() => ({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.relay_identities' },
      })),
    );
    const relais = await admin.relais();
    expect(relais.map((r) => r.prenom).sort()).toEqual(['Marie', 'Paul']);
    expect(relais.every((r) => r.email === null)).toBe(true);
  });
});

describe('la vue d’ensemble, côté Supabase (ticket n° 76)', () => {
  it('lit les agrégats de la base', async () => {
    const { port } = fausseApi({
      admin_overview: {
        data: { to_review: { count: 2, oldest_received_at: null, over_24h: 0 } },
        error: null,
      },
    });
    expect((await port.vueEnsemble()).aValider.nombre).toBe(2);
  });

  it('demande 14 jours par défaut, et le nombre de jours qu’on lui donne', async () => {
    const { port, appels } = fausseApi({ admin_overview: { data: {}, error: null } });
    await port.vueEnsemble();
    await port.vueEnsemble(30);
    expect(appels.filter((a) => a.nom === 'admin_overview').map((a) => a.arguments)).toEqual([
      { p_days: 14 },
      { p_days: 30 },
    ]);
  });

  it('une base sans la fonction le dit : « supabase db push », pas une erreur muette', async () => {
    const { port } = fausseApi({
      admin_overview: {
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.admin_overview' },
      },
    });
    await expect(port.vueEnsemble()).rejects.toThrow(/supabase db push/);
    await expect(port.vueEnsemble()).rejects.toBeInstanceOf(ErreurDecision);
  });
});
