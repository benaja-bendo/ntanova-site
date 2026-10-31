import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortRelais } from '../../src/infra/supabase/relais';

/**
 * Une fausse API Supabase, qui répond comme la base pour un compte à la fois
 * administrateur et relais : les règles d'accès lui laissent tout lire. Elle
 * applique les filtres `eq`, et `single`/`maybeSingle` échouent comme PostgREST
 * (PGRST116) si plus d'une ligne revient.
 */
function fausseBase(tables: Record<string, Record<string, unknown>[]>, moi: string) {
  const requete = (lignes: Record<string, unknown>[]) => {
    let resultat = lignes;
    const reponse = (unique: 'single' | 'maybeSingle' | null) => {
      if (unique === null) return { data: resultat, error: null };
      if (resultat.length > 1 || (unique === 'single' && resultat.length === 0)) {
        return {
          data: null,
          error: { code: 'PGRST116', message: 'multiple (or no) rows returned' },
        };
      }
      return { data: resultat[0] ?? null, error: null };
    };
    const constructeur = {
      select: () => constructeur,
      eq: (colonne: string, valeur: unknown) => {
        resultat = resultat.filter((l) => l[colonne] === valeur);
        return constructeur;
      },
      not: () => constructeur,
      order: () => constructeur,
      limit: () => constructeur,
      single: () => Promise.resolve(reponse('single')),
      maybeSingle: () => Promise.resolve(reponse('maybeSingle')),
      then: (suite: (r: unknown) => unknown) => Promise.resolve(reponse(null)).then(suite),
    };
    return constructeur;
  };
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: moi } } } }) },
    from: (table: string) => requete(tables[table] ?? []),
  };
  return () => client as unknown as SupabaseClient;
}

const MOI = 'relais-admin';
const tables = {
  relais: [
    { id: MOI, prenom: '[A]', statut: 'actif', lot_id: 'lot-essai' },
    { id: 'autre', prenom: '[B]', statut: 'actif', lot_id: 'lot-tie-tie' },
  ],
  lots: [
    {
      id: 'lot-tie-tie',
      nom: 'Tié-Tié',
      essai: false,
      a_rendre_le: null,
      contour: null,
      arrondissements: null,
    },
    {
      id: 'lot-ngoyo',
      nom: 'Ngoyo',
      essai: false,
      a_rendre_le: null,
      contour: null,
      arrondissements: null,
    },
    {
      id: 'lot-essai',
      nom: 'Essai',
      essai: true,
      a_rendre_le: null,
      contour: null,
      arrondissements: null,
    },
  ],
  releves: [
    {
      id: 'r1',
      relais_id: MOI,
      nom_enseigne: '[École A]',
      pris_le: '2026-11-02',
      statut: 'a_valider',
    },
    {
      id: 'r2',
      relais_id: 'autre',
      nom_enseigne: '[École B]',
      pris_le: '2026-11-02',
      statut: 'a_valider',
    },
  ],
};

describe('l’adaptateur Supabase, pour un administrateur qui est aussi relais', () => {
  const port = creerPortRelais(fausseBase(tables, MOI));

  it('lit son lot, pas tous ceux que la base lui laisse voir', async () => {
    await expect(port.monLot()).resolves.toMatchObject({ nom: 'Essai', essai: true });
  });

  it('lit ses relevés, pas ceux des autres relais', async () => {
    const releves = await port.mesReleves();
    expect(releves.map((r) => r.id)).toEqual(['r1']);
  });

  it('lit son profil', async () => {
    await expect(port.monProfil()).resolves.toMatchObject({ prenom: '[A]', lotId: 'lot-essai' });
  });
});
