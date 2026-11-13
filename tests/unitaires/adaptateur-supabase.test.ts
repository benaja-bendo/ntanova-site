import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { creerPortRelais } from '../../src/infra/supabase/relais';
import { ErreurReseau, type PhotoPrete, type ReleveAEnvoyer } from '../../src/modele/ports';

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
  geo_divisions: [
    { id: 'z1', name: 'Tié-Tié', open_for_fieldwork: true },
    { id: 'z2', name: 'Lumumba', open_for_fieldwork: false },
    { id: 'z3', name: 'Ngoyo', open_for_fieldwork: true },
  ],
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
    formationsVues: [],
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

  it('envoie les séries et filières cochées, dans la forme que la base garde (observed_formations)', async () => {
    const ligne = await envoyer({
      ...releve,
      niveaux: ['lycee', 'superieur'],
      formationsVues: [
        {
          cycle: 'lycee',
          titre: 'Série C',
          domaine: null,
          serie: 'c',
          diplome: 'bac',
          rythmes: [],
        },
        {
          cycle: 'superieur',
          titre: 'BTS Gestion',
          domaine: 'gestion',
          serie: null,
          diplome: 'bts',
          rythmes: [],
        },
      ],
    });
    expect(ligne['observed_formations']).toEqual([
      { cycle: 'lycee', titre: 'Série C', serie: 'c', diplome: 'bac', domaine: null },
      { cycle: 'superieur', titre: 'BTS Gestion', serie: null, diplome: 'bts', domaine: 'gestion' },
    ]);
  });

  it('un relevé sans rien de coché part exactement comme avant : la colonne n’est pas envoyée', async () => {
    // Le code peut arriver un instant avant la migration du 09/11/2026 : un relais sans séries ne doit rien y perdre.
    const ligne = await envoyer(releve);
    expect(ligne).not.toHaveProperty('observed_formations');
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
      'division_id',
      'in_open_zone',
    ]) {
      expect(ligne).not.toHaveProperty(interdit);
    }
  });
});

describe('l’envoi d’une photo par l’adaptateur Supabase', () => {
  const photo: PhotoPrete = {
    id: 'p1',
    role: 'programs_board',
    blob: new Blob(['x'], { type: 'image/webp' }),
    mime: 'image/webp',
    octets: 1,
    largeur: 1280,
    hauteur: 960,
    prisLe: '2026-11-02T08:00:00.000Z',
    contenu: new Uint8Array([120]).buffer,
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

  // Ticket #74 : un fichier relu dans la base du téléphone (Blob d'IndexedDB) et envoyé en multipart échoue sur iPhone
  // (« Load failed », sans une requête). La photo part de la mémoire : les octets déjà lus, en corps brut.
  it('envoie les octets lus en mémoire, avec le type du fichier, jamais le fichier de la base du téléphone', async () => {
    const depots: { chemin: string; corps: unknown; options: unknown }[] = [];
    const rpcs: { nom: string; args: Record<string, unknown> }[] = [];
    const client = {
      storage: {
        from: () => ({
          upload: (chemin: string, corps: unknown, options: unknown) => {
            depots.push({ chemin, corps, options });
            return Promise.resolve({ data: { path: chemin }, error: null });
          },
        }),
      },
      rpc: (nom: string, args: Record<string, unknown>) => {
        rpcs.push({ nom, args });
        return Promise.resolve({ data: 'recu', error: null });
      },
    };
    const port = creerPortRelais(() => client as unknown as SupabaseClient);
    const octets = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    await port.envoyerPhoto('r1', { ...photo, octets: 5, contenu: octets });
    expect(depots).toHaveLength(1);
    expect(depots[0]!.corps).toBe(octets);
    expect(depots[0]!.corps).not.toBeInstanceOf(Blob);
    expect(depots[0]!.options).toMatchObject({ contentType: 'image/webp', upsert: false });
    // La taille enregistrée est celle des octets réellement envoyés.
    expect(rpcs[0]!.args['p_bytes']).toBe(5);
  });

  it('une erreur du navigateur à l’envoi reste une erreur de connexion', async () => {
    const client = {
      storage: {
        from: () => ({
          upload: () => Promise.resolve({ data: null, error: { message: 'Load failed' } }),
        }),
      },
      rpc: () => Promise.resolve({ data: 'recu', error: null }),
    };
    const port = creerPortRelais(() => client as unknown as SupabaseClient);
    await expect(port.envoyerPhoto('r1', photo)).rejects.toBeInstanceOf(ErreurReseau);
  });

  it('un envoi qui ne finit jamais est abandonné au bout d’une minute : une erreur de connexion, jamais un envoi suspendu', async () => {
    vi.useFakeTimers();
    try {
      const client = {
        storage: { from: () => ({ upload: () => new Promise(() => {}) }) },
        rpc: () => Promise.resolve({ data: 'recu', error: null }),
      };
      const port = creerPortRelais(() => client as unknown as SupabaseClient);
      const resultat = port.envoyerPhoto('r1', photo);
      const attendu = expect(resultat).rejects.toThrow(/délai dépassé/);
      await vi.advanceTimersByTimeAsync(61_000);
      await attendu;
      await expect(resultat).rejects.toBeInstanceOf(ErreurReseau);
    } finally {
      vi.useRealTimers();
    }
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

/** Une ligne de `my_submissions` : la fiche d'un relais, avec tout ce qu'elle contient. */
const ligneDeMesReleves = {
  id: 'r1',
  kind: 'releve',
  status: 'a_valider',
  reason: null,
  message_to_relay: null,
  taken_at: '2026-11-02',
  campus_id: null,
  sign_name: '[École A]',
  levels: [],
  school_kind: 'privee',
  curriculum_note: null,
  observed_programs: null,
  programs_photographed: false,
  landmark: null,
  sign_phone: null,
  latitude: null,
  longitude: null,
  accuracy_m: null,
  direction_seen: null,
  liaison_sheet_given: false,
  come_back_note: null,
  contact_confirmed_at: null,
  contact_role: null,
  has_contact: false,
  photo_roles: [],
};

describe('l’adaptateur Supabase, pour un administrateur qui est aussi relais', () => {
  const port = creerPortRelais(
    fausseBase(tables, MOI, {
      my_batch: [
        { id: 'lot-essai', nom: 'Essai', essai: true, a_rendre_le: null, contour_geojson: null },
      ],
      known_places_for_me: [
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
          kind: 'verify',
          latitude: -4.79,
          longitude: 11.92,
          verification_state: 'relevee',
          photo_roles: ['signboard'],
          contact_confirmed: true,
        },
      ],
      // Ce que `my_submissions` rend : les fiches du compte connecté, déjà filtrées par la base.
      my_submissions: [
        {
          id: 'r1',
          kind: 'correction',
          status: 'a_corriger',
          reason: 'hors_lot',
          message_to_relay: 'Placez-vous devant l’entrée.',
          taken_at: '2026-11-02',
          campus_id: null,
          sign_name: '[École A]',
          levels: ['primaire', 'college'],
          school_kind: 'privee',
          curriculum_note: 'Bilingue',
          observed_programs: null,
          programs_photographed: false,
          landmark: 'Face au marché',
          sign_phone: '242061234501',
          latitude: -4.8,
          longitude: 11.9,
          accuracy_m: 12,
          direction_seen: 'absente',
          liaison_sheet_given: false,
          come_back_note: 'Lundi matin',
          contact_confirmed_at: null,
          contact_role: null,
          has_contact: false,
          photo_roles: ['signboard', 'programs_board'],
        },
      ],
    }),
  );

  it('lit son lot, pas tous ceux que la base lui laisse voir', async () => {
    await expect(port.monLot()).resolves.toMatchObject({ nom: 'Essai', essai: true });
  });

  it('lit ses relevés par my_submissions, qui filtre sur le compte connecté, et jamais la table (un administrateur y voit tout)', async () => {
    const lues: string[] = [];
    const base = fausseBase(tables, MOI, { my_submissions: [{ ...ligneDeMesReleves }] })();
    const client = {
      ...base,
      from: (table: string) => {
        lues.push(table);
        return (base as unknown as { from: (t: string) => unknown }).from(table);
      },
    };
    const lecteur = creerPortRelais(() => client as unknown as SupabaseClient);
    const releves = await lecteur.mesReleves();
    expect(releves.map((r) => r.id)).toEqual(['r1']);
    expect(lues).not.toContain('field_submissions');
  });

  it('rend, avec chaque relevé, tout ce qu’il contient et ce que NTanova en a reçu', async () => {
    const [releve] = await port.mesReleves();
    expect(releve).toMatchObject({
      type: 'correction',
      statut: 'a_corriger',
      motif: 'hors_lot',
      messageAuRelais: 'Placez-vous devant l’entrée.',
      niveaux: ['primaire', 'college'],
      typeEcole: 'privee',
      repere: 'Face au marché',
      numeroEnseigne: '242061234501',
      position: { latitude: -4.8, longitude: 11.9 },
      precisionM: 12,
      repasser: 'Lundi matin',
      photos: ['signboard', 'programs_board'],
      aContact: false,
    });
  });

  it('rend les formations cochées d’un relevé, et une liste vide pour un relevé d’avant (ou une base sans la colonne)', async () => {
    const [sans] = await port.mesReleves();
    expect(sans?.formationsVues).toEqual([]);
    const avec = {
      ...ligneDeMesReleves,
      levels: ['lycee'],
      observed_formations: [
        { cycle: 'lycee', titre: 'Série C', serie: 'c', diplome: 'bac', domaine: null },
        // Un niveau décoché depuis, une ligne illisible, une valeur inconnue : rien ne plante.
        {
          cycle: 'superieur',
          titre: 'BTS Gestion',
          serie: null,
          diplome: 'bts',
          domaine: 'gestion',
        },
        'illisible',
        {
          cycle: 'lycee',
          titre: 'Série X',
          serie: 'x9',
          diplome: 'diplome-futur',
          domaine: 'robotique',
        },
      ],
    };
    const lecteur = creerPortRelais(
      fausseBase(tables, MOI, { my_submissions: [avec] }) as unknown as () => SupabaseClient,
    );
    const [releve] = await lecteur.mesReleves();
    expect(releve?.formationsVues?.map((f) => f.titre)).toEqual(['Série C', 'Série X']);
    expect(releve?.formationsVues?.[1]).toMatchObject({
      serie: null,
      diplome: null,
      domaine: null,
    });
  });

  it('lit son profil', async () => {
    await expect(port.monProfil()).resolves.toMatchObject({ prenom: '[A]', lotId: 'lot-essai' });
  });

  it('lit les écoles connues des zones ouvertes et de son secteur, pour l’alerte doublon sans réseau', async () => {
    const lieux = await port.lieuxConnus();
    expect(lieux).toMatchObject([
      { id: 'c1', nom: '[École connue]', latitude: -4.79, longitude: 11.92, genre: 'campus' },
      { id: 'r9', nom: '[Relevé d’un autre]', latitude: -4.8, longitude: 11.93, genre: 'releve' },
    ]);
  });

  it('lit les zones ouvertes aux relais, par ordre alphabétique, pour dire où relever quand on n’a pas de secteur', async () => {
    await expect(port.zonesOuvertes()).resolves.toEqual(['Ngoyo', 'Tié-Tié']);
  });

  it('lit ses missions : une école connue à vérifier sur place', async () => {
    await expect(port.mesMissions()).resolves.toEqual([
      expect.objectContaining({
        id: 'c2',
        nom: '[École à vérifier]',
        etiquette: 'Campus de Loandjili',
        niveaux: ['primaire'],
        note: 'Le nom sur l’enseigne.',
        // Ce que NTanova sait déjà de l'école : le relais ne le redonne pas.
        position: { latitude: -4.79, longitude: 11.92 },
        etatVerification: 'relevee',
        photos: ['signboard'],
        contactConfirme: true,
      }),
    ]);
  });
});
