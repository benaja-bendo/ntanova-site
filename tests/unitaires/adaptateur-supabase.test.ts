import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortRelais } from '../../src/infra/supabase/relais';
import type { PhotoAEnvoyer, ReleveAEnvoyer } from '../../src/modele/ports';

/**
 * Une fausse API Supabase, qui répond comme la base pour un compte à la fois administrateur et relais : les
 * règles d'accès lui laissent tout lire. Elle applique les filtres `eq`, et `single`/`maybeSingle` échouent comme
 * PostgREST (PGRST116) si plus d'une ligne revient. Les fonctions (`rpc`) répondent ce que le test a prévu.
 */
function fausseBase(
  tables: Record<string, Record<string, unknown>[]>,
  moi: string,
  rpc: Record<string, unknown> = {},
) {
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
    rpc: (nom: string) => Promise.resolve({ data: rpc[nom] ?? [], error: null }),
  };
  return () => client as unknown as SupabaseClient;
}

const MOI = 'relais-admin';
const tables = {
  relais: [
    { id: MOI, prenom: '[A]', statut: 'actif', lot_id: 'lot-essai' },
    { id: 'autre', prenom: '[B]', statut: 'actif', lot_id: 'lot-tie-tie' },
  ],
  field_submissions: [
    {
      id: 'r1',
      relay_id: MOI,
      sign_name: '[École A]',
      taken_at: '2026-11-02',
      status: 'a_valider',
      liaison_sheet_given: false,
      campus_id: null,
    },
    {
      id: 'r2',
      relay_id: 'autre',
      sign_name: '[École B]',
      taken_at: '2026-11-02',
      status: 'a_valider',
      liaison_sheet_given: false,
      campus_id: null,
    },
  ],
};

describe('l’envoi d’un relevé par l’adaptateur Supabase', () => {
  const releve: ReleveAEnvoyer = {
    id: 'r1',
    lotId: null,
    type: 'releve',
    corrigeReleveId: null,
    position: null,
    precisionM: null,
    prisLe: '2026-11-02T08:00:00.000Z',
    reponseDoublon: null,
    doublonDe: null,
    nomEnseigne: '[École]',
    niveaux: ['creche', 'autre_formation'],
    typeEcole: 'communautaire',
    programme: null,
    programmesVus: null,
    programmesEnPhoto: false,
    repere: null,
    numeroEnseigne: null,
    direction: null,
    repasser: null,
  };
  const envoyer = async (r: ReleveAEnvoyer) => {
    const insertions: Record<string, unknown>[] = [];
    const client = {
      from: (table: string) => ({
        insert: (ligne: Record<string, unknown>) => {
          insertions.push({ table, ...ligne });
          return Promise.resolve({ error: null });
        },
      }),
    };
    const port = creerPortRelais(() => client as unknown as SupabaseClient);
    await port.envoyerReleve(r);
    return insertions[0] ?? {};
  };

  it('écrit dans la seule table des relevés du terrain, avec les noms de la base', async () => {
    const ligne = await envoyer({ ...releve, programme: 'Programme français-congolais' });
    expect(ligne).toMatchObject({
      table: 'field_submissions',
      id: 'r1',
      kind: 'releve',
      sign_name: '[École]',
      school_kind: 'communautaire',
      levels: ['creche', 'autre_formation'],
      curriculum_note: 'Programme français-congolais',
    });
  });

  it('envoie les séries ou filières vues, et si elles sont en photo', async () => {
    const ligne = await envoyer({
      ...releve,
      niveaux: ['lycee'],
      programmesVus: 'Séries A, C et D',
      programmesEnPhoto: true,
    });
    expect(ligne).toMatchObject({
      observed_programs: 'Séries A, C et D',
      programs_photographed: true,
    });
  });

  it('n’envoie jamais ce que la base calcule : l’auteur, le statut, la paie', async () => {
    const ligne = await envoyer(releve);
    for (const interdit of [
      'relay_id',
      'status',
      'payable',
      'received_at',
      'campus_id',
      'outside_batch',
    ]) {
      expect(ligne).not.toHaveProperty(interdit);
    }
  });
});

describe('l’envoi d’une photo par l’adaptateur Supabase', () => {
  const photo: PhotoAEnvoyer = {
    id: 'p1',
    role: 'programs_board',
    blob: new Blob(['x'], { type: 'image/webp' }),
    mime: 'image/webp',
    octets: 1,
    largeur: 1280,
    hauteur: 960,
    prisLe: '2026-11-02T08:00:00.000Z',
  };

  it('dépose le fichier à un chemin relatif, puis enregistre la photo sans jamais écrire d’adresse de serveur', async () => {
    const appels: { nom: string; arguments: unknown }[] = [];
    const client = {
      storage: {
        from: (seau: string) => ({
          upload: (chemin: string) => {
            appels.push({ nom: `dépôt ${seau}`, arguments: chemin });
            return Promise.resolve({ data: { path: chemin }, error: null });
          },
        }),
      },
      rpc: (nom: string, args: unknown) => {
        appels.push({ nom, arguments: args });
        return Promise.resolve({ data: 'recu', error: null });
      },
    };
    const port = creerPortRelais(() => client as unknown as SupabaseClient);
    await expect(port.envoyerPhoto('r1', photo)).resolves.toBe('recu');
    expect(appels[0]).toEqual({ nom: 'dépôt releves', arguments: 'r1/p1.webp' });
    expect(appels[1]).toEqual({
      nom: 'register_photo',
      arguments: {
        p_photo: 'p1',
        p_submission: 'r1',
        p_role: 'programs_board',
        p_mime: 'image/webp',
        p_bytes: 1,
        p_width: 1280,
        p_height: 960,
        p_taken_at: '2026-11-02T08:00:00.000Z',
      },
    });
    expect(JSON.stringify(appels)).not.toMatch(/supabase|https?:/i);
  });

  it('dit « déjà reçu » quand la base connaissait déjà la photo (un envoi rejoué)', async () => {
    const client = {
      storage: {
        from: () => ({
          upload: () =>
            Promise.resolve({
              data: null,
              error: { message: 'The resource already exists', statusCode: '409' },
            }),
        }),
      },
      rpc: () => Promise.resolve({ data: 'deja_recu', error: null }),
    };
    const port = creerPortRelais(() => client as unknown as SupabaseClient);
    await expect(port.envoyerPhoto('r1', photo)).resolves.toBe('deja_recu');
  });
});

describe('l’adaptateur Supabase, pour un administrateur qui est aussi relais', () => {
  const port = creerPortRelais(
    fausseBase(tables, MOI, {
      my_batch: [
        { id: 'lot-essai', nom: 'Essai', essai: true, a_rendre_le: null, contour_geojson: null },
      ],
      known_places_in_my_batch: [
        { kind: 'campus', id: 'c1', name: '[École connue]', latitude: -4.79, longitude: 11.92 },
        {
          kind: 'submission',
          id: 'r9',
          name: '[Relevé d’un autre]',
          latitude: -4.8,
          longitude: 11.93,
        },
      ],
      my_missions: [
        {
          campus_id: 'c2',
          name: '[École à vérifier]',
          label: 'Campus de Loandjili',
          neighbourhood: null,
          school_kind: 'privee',
          cycles: ['primaire'],
          curriculum_note: null,
          landmark: null,
          sign_phone: null,
          note: 'Le nom sur l’enseigne.',
        },
      ],
    }),
  );

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

  it('lit les écoles connues autour de son lot, pour l’alerte doublon sans réseau', async () => {
    const lieux = await port.lieuxConnus();
    expect(lieux).toEqual([
      { id: 'c1', nom: '[École connue]', latitude: -4.79, longitude: 11.92, genre: 'campus' },
      { id: 'r9', nom: '[Relevé d’un autre]', latitude: -4.8, longitude: 11.93, genre: 'releve' },
    ]);
  });

  it('lit ses missions : une école connue à vérifier sur place', async () => {
    await expect(port.mesMissions()).resolves.toEqual([
      expect.objectContaining({
        id: 'c2',
        nom: '[École à vérifier]',
        etiquette: 'Campus de Loandjili',
        niveaux: ['primaire'],
        note: 'Le nom sur l’enseigne.',
      }),
    ]);
  });
});
