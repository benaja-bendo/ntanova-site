import { afterEach, describe, expect, it, vi } from 'vitest';
import { creerCatalogue } from '../../src/infra/supabase/catalogue';

afterEach(() => vi.unstubAllGlobals());

const DIVISIONS = [
  {
    id: 'd-cg',
    parent_id: null,
    level: 0,
    kind: 'country',
    name: 'Congo',
    slug: 'congo',
    ordinal: null,
    aliases: [],
    verified_on: '2026-11-01',
    open_for_fieldwork: false,
  },
  {
    id: 'd-pn-dep',
    parent_id: 'd-cg',
    level: 1,
    kind: 'department',
    name: 'Pointe-Noire',
    slug: 'pointe-noire',
    ordinal: null,
    aliases: [],
    verified_on: null,
    open_for_fieldwork: false,
  },
  {
    id: 'd-pn',
    parent_id: 'd-pn-dep',
    level: 2,
    kind: 'city',
    name: 'Pointe-Noire',
    slug: 'pointe-noire',
    ordinal: null,
    aliases: [],
    verified_on: null,
    open_for_fieldwork: false,
  },
  {
    id: 'd-tt',
    parent_id: 'd-pn',
    level: 3,
    kind: 'arrondissement',
    name: 'Tié-Tié',
    slug: 'tie-tie',
    ordinal: 3,
    aliases: [],
    verified_on: null,
    open_for_fieldwork: true,
  },
];

const CAMPUS = {
  id: 'c1',
  institution_id: 'i1',
  institution_name: '[École exemple]',
  label: null,
  kind: 'privee',
  slug: 'ecole-exemple',
  public_number: 482913,
  division_id: 'd-tt',
  division_path: 'congo.pointe_noire.pointe_noire.tie_tie',
  division_slugs: ['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'],
  division_names: ['Congo', 'Pointe-Noire', 'Pointe-Noire', 'Tié-Tié'],
  neighbourhood: null,
  landmark: null,
  sign_phone: null,
  latitude: -4.79,
  longitude: 11.92,
  verification_state: 'relevee',
  verified_on: null,
  curriculum_note: null,
  surveyed_at: '2026-11-02T08:00:00Z',
  located_at: null,
  origin: 'field',
  updated_at: '2026-11-02T10:00:00Z',
};

/** Une fausse API REST : chaque table ou vue répond ses lignes ; on garde les adresses appelées. */
function fausseBase(reponses: Record<string, unknown[]>) {
  const appels: { url: string; cle: string | null }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    appels.push({ url, cle: new Headers(init.headers).get('apikey') });
    const nom = /\/rest\/v1\/([a-z_]+)/.exec(url)?.[1] ?? '';
    return new Response(JSON.stringify(reponses[nom] ?? []));
  });
  return appels;
}

const catalogue = () => creerCatalogue('https://base.exemple', 'cle-publique');

describe('le catalogue du site public', () => {
  it('lit les campus publiés avec la clé publique, dans les termes du modèle', async () => {
    const appels = fausseBase({
      public_campuses: [CAMPUS],
      public_campus_cycles: [{ campus_id: 'c1', cycle: 'primaire' }],
      public_campus_programs: [],
    });
    const [e] = await catalogue().ecoles();
    expect(e).toMatchObject({
      id: 'c1',
      institutionId: 'i1',
      divisionId: 'd-tt',
      slug: 'ecole-exemple',
      numero: '482913',
      nom: '[École exemple]',
      etiquette: null,
      typeEcole: 'privee',
      niveaux: ['primaire'],
      misAJourLe: '2026-11-02T10:00:00Z',
      releveeLe: '2026-11-02T08:00:00Z',
    });
    expect(appels.every((a) => a.cle === 'cle-publique')).toBe(true);
    expect(
      appels.map((a) => a.url.replace('https://base.exemple/rest/v1/', '').split('?')[0]),
    ).toEqual([
      'public_campuses',
      'public_campus_cycles',
      'public_campus_programs',
      'campus_fees',
      'campus_facts',
      'public_campus_photos',
      'public_campus_accreditations',
      'public_campus_statements',
      'campus_enrollment_deadlines',
    ]);
  });

  it('l’adresse publique saute la répétition ville / département, et garde le pays', async () => {
    fausseBase({ public_campuses: [CAMPUS] });
    const [e] = await catalogue().ecoles();
    expect(e?.adresse).toEqual(['congo', 'pointe-noire', 'tie-tie']);
    expect(e?.divisionNoms).toEqual(['Congo', 'Pointe-Noire', 'Tié-Tié']);
    expect(e?.arrondissement).toBe('tie-tie');
  });

  it('range les formations de chaque campus : série, diplôme, domaine, rythmes', async () => {
    fausseBase({
      public_campuses: [CAMPUS],
      public_campus_cycles: [
        { campus_id: 'c1', cycle: 'lycee' },
        { campus_id: 'c1', cycle: 'maternelle' },
      ],
      public_campus_programs: [
        {
          campus_id: 'c1',
          cycle: 'lycee',
          title: 'Série C',
          domain_slug: 'sciences-technologies',
          domain_name: 'Sciences et technologies',
          bac_track: 'c',
          diploma: 'bac',
          rhythms: ['jour'],
        },
        {
          campus_id: 'c1',
          cycle: 'lycee',
          title: 'Couture',
          domain_slug: null,
          domain_name: null,
          bac_track: null,
          diploma: null,
          rhythms: [],
        },
      ],
    });
    const [e] = await catalogue().ecoles();
    // Les cycles suivent l'ordre de la liste fermée, pas celui de la réponse.
    expect(e?.niveaux).toEqual(['maternelle', 'lycee']);
    expect(e?.formations).toEqual([
      {
        cycle: 'lycee',
        titre: 'Série C',
        domaine: { slug: 'sciences-technologies', nom: 'Sciences et technologies' },
        serie: 'c',
        diplome: 'bac',
        rythmes: ['jour'],
        agrement: null,
      },
      {
        cycle: 'lycee',
        titre: 'Couture',
        domaine: null,
        serie: null,
        diplome: null,
        rythmes: [],
        agrement: null,
      },
    ]);
  });

  it('lit les divisions avec leur adresse du pays à la zone, et si le relevé y a commencé', async () => {
    fausseBase({ geo_divisions: DIVISIONS });
    const divisions = await catalogue().divisions();
    const tieTie = divisions.find((d) => d.id === 'd-tt');
    expect(tieTie).toMatchObject({
      nom: 'Tié-Tié',
      niveau: 3,
      ordinal: 3,
      ouverte: true,
      adresse: ['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'],
    });
    // Du pays à la zone : le pays d'abord.
    expect(divisions.map((d) => d.niveau)).toEqual([0, 1, 2, 3]);
  });

  it('lit l’état public d’une zone et le point d’une ville, distincts de l’ouverture aux relais (ticket 102)', async () => {
    fausseBase({
      geo_divisions: DIVISIONS.map((d) =>
        d.id === 'd-tt'
          ? { ...d, public_status: 'actif' }
          : d.id === 'd-pn'
            ? { ...d, position: { type: 'Point', coordinates: [11.8503, -4.7975] } }
            : d,
      ),
    });
    const divisions = await catalogue().divisions();
    expect(divisions.find((d) => d.id === 'd-tt')).toMatchObject({
      ouverte: true,
      deploiement: 'actif',
      position: null,
    });
    expect(divisions.find((d) => d.id === 'd-pn')).toMatchObject({
      ouverte: false,
      deploiement: null,
      position: { longitude: 11.8503, latitude: -4.7975 },
    });
    // Une zone sans état ni point se lit « rien », jamais « indéfini » : elle est non couverte.
    expect(divisions.find((d) => d.id === 'd-cg')).toMatchObject({
      deploiement: null,
      position: null,
    });
  });

  it('traduit les anciennes adresses des fiches fusionnées en adresses publiques', async () => {
    fausseBase({
      geo_divisions: DIVISIONS,
      public_campus_redirects: [
        {
          from_division_path: 'congo.pointe_noire.pointe_noire.tie_tie',
          from_slug: 'ancienne-fiche',
          from_number: 362850,
          to_number: 482913,
        },
      ],
    });
    await expect(catalogue().redirections()).resolves.toEqual([
      {
        de: {
          chemin: ['congo', 'pointe-noire', 'tie-tie'],
          slug: 'ancienne-fiche',
          numero: '362850',
        },
        versNumero: '482913',
      },
    ]);
  });

  it('lit les anciennes adresses des fiches publiées, avec leur identifiant (ticket 147)', async () => {
    fausseBase({
      geo_divisions: DIVISIONS,
      public_campus_former_addresses: [
        {
          former_slug: 'ancien-nom',
          former_division_path: 'congo.pointe_noire.pointe_noire.tie_tie',
          public_number: 482913,
        },
      ],
    });
    await expect(catalogue().anciennesAdresses()).resolves.toEqual([
      { chemin: ['congo', 'pointe-noire', 'tie-tie'], slug: 'ancien-nom', numero: '482913' },
    ]);
  });

  it('lit les domaines de formation dans l’ordre voulu', async () => {
    fausseBase({
      education_domains: [
        { slug: 'informatique', name: 'Informatique', sort_order: 10 },
        { slug: 'gestion', name: 'Gestion', sort_order: 20 },
      ],
    });
    await expect(catalogue().domaines()).resolves.toEqual([
      { slug: 'informatique', nom: 'Informatique', ordre: 10 },
      { slug: 'gestion', nom: 'Gestion', ordre: 20 },
    ]);
  });

  it('une valeur que ce code ne connaît pas encore ne casse ni la construction ni la page', async () => {
    fausseBase({
      public_campuses: [{ ...CAMPUS, kind: 'type_de_demain' }],
      public_campus_cycles: [
        { campus_id: 'c1', cycle: 'primaire' },
        { campus_id: 'c1', cycle: 'niveau_de_demain' },
      ],
    });
    const [e] = await catalogue().ecoles();
    expect(e?.typeEcole).toBe('non_indique');
    expect(e?.niveaux).toEqual(['primaire']);
  });

  it('lit toute la liste page après page, sans jamais en perdre', async () => {
    const lignes = Array.from({ length: 1500 }, (_, i) => ({
      ...CAMPUS,
      id: `c${String(i).padStart(4, '0')}`,
      slug: `ecole-${i}`,
    }));
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      const decalage = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0);
      const nom = /\/rest\/v1\/([a-z_]+)/.exec(url)?.[1] ?? '';
      return new Response(
        JSON.stringify(nom === 'public_campuses' ? lignes.slice(decalage, decalage + 1000) : []),
      );
    });
    const ecoles = await catalogue().ecoles();
    expect(ecoles).toHaveLength(1500);
    expect(new Set(ecoles.map((e) => e.id)).size).toBe(1500);
    expect(urls.filter((u) => u.includes('public_campuses'))).toHaveLength(2);
  });

  it('arrête la construction si la base ne répond pas : jamais un annuaire vide par erreur', async () => {
    vi.stubGlobal('fetch', async () => new Response('indisponible', { status: 503 }));
    await expect(creerCatalogue('https://base.exemple', 'cle').ecoles()).rejects.toThrow(
      'Catalogue illisible (503)',
    );
  });
});

describe('contact public autorisé', () => {
  it('ne transmet un numéro communiqué que si sa date d’accord accompagne le catalogue', async () => {
    fausseBase({
      public_campuses: [
        { ...CAMPUS, public_phone: '242060000009', public_phone_agreed_on: '2026-11-03' },
      ],
    });
    expect(
      (await creerCatalogue('https://exemple.test', 'cle-fictive').ecoles())[0]?.contactPublic,
    ).toEqual({ numero: '242060000009', accordLe: '2026-11-03' });
  });
  it('ne reprend jamais le numéro d’enseigne pour remplir un contact public retiré', async () => {
    fausseBase({
      public_campuses: [
        { ...CAMPUS, sign_phone: '242060000009', public_phone: null, public_phone_agreed_on: null },
      ],
    });
    const e = (await creerCatalogue('https://exemple.test', 'cle-fictive').ecoles())[0];
    expect(e?.contactPublic).toBeNull();
    expect(e?.numeroEnseigne).toBe('242060000009');
  });
});

describe('frais déclarés dans le catalogue', () => {
  it('lit les montants tels que déclarés sans calcul de total ni mélange avec le badge', async () => {
    fausseBase({
      public_campuses: [CAMPUS],
      campus_fees: [
        {
          id: 'f1',
          campus_id: 'c1',
          cycle: 'primaire',
          minimum: 25000,
          maximum: 30000,
          period: 'mois',
          period_detail: null,
          registration: null,
          school_year: null,
          declared_on: '2026-11-03',
          note: null,
        },
      ],
    });
    const [e] = await catalogue().ecoles();
    expect(e?.frais).toEqual([
      {
        id: 'f1',
        cycle: 'primaire',
        minimum: 25000,
        maximum: 30000,
        periode: 'mois',
        precisionPeriode: null,
        inscription: null,
        anneeScolaire: null,
        declaresLe: '2026-11-03',
        note: null,
      },
    ]);
  });
});

describe('équipements avec provenance', () => {
  it('conserve absence déclarée et état non précisé sans inventer de preuve terrain', async () => {
    fausseBase({
      public_campuses: [CAMPUS],
      campus_facts: [
        {
          id: 'f1',
          campus_id: 'c1',
          key: 'cantine',
          custom_label: null,
          value: 'absent',
          source: 'ecole',
          observed_on: '2026-11-03',
          note: null,
        },
      ],
    });
    expect((await catalogue().ecoles())[0]?.equipements).toEqual([
      {
        id: 'f1',
        cle: 'cantine',
        precision: null,
        etat: 'absent',
        source: 'ecole',
        constateLe: '2026-11-03',
        note: null,
      },
    ]);
  });
});

it('garde l’origine école et sa date sans inventer un passage terrain', async () => {
  fausseBase({
    public_campuses: [
      { ...CAMPUS, origin: 'school', school_declared_on: '2026-11-01', surveyed_at: null },
    ],
  });
  const [e] = await catalogue().ecoles();
  expect(e).toMatchObject({ origine: 'school', declareeLe: '2026-11-01', releveeLe: null });
});

it('rattache chaque référence officielle à son école ou à sa filière, et traduit le mot et les dates', async () => {
  const reference = (program_id: string | null, reference: string) => ({
    campus_id: 'c1',
    program_id,
    kind: 'agrement',
    custom_kind: null,
    reference,
    issued_on: '2024-03-12',
    source_label: '[Journal officiel]',
    source_url: null,
  });
  fausseBase({
    public_campuses: [CAMPUS],
    public_campus_programs: [
      {
        campus_id: 'c1',
        cycle: 'superieur',
        title: 'BTS',
        domain_slug: null,
        domain_name: null,
        bac_track: null,
        diploma: null,
        rhythms: [],
        program_id: 'f1',
      },
      {
        campus_id: 'c1',
        cycle: 'superieur',
        title: 'Licence',
        domain_slug: null,
        domain_name: null,
        bac_track: null,
        diploma: null,
        rhythms: [],
        program_id: 'f2',
      },
    ],
    public_campus_accreditations: [reference(null, 'ecole'), reference('f1', 'filiere')],
    public_campus_statements: [{ campus_id: 'c1', body: 'Un mot.', stated_on: '2026-11-05' }],
    campus_enrollment_deadlines: [
      {
        id: 'd1',
        campus_id: 'c1',
        school_year: '2026-2027',
        deadline: '2026-12-15',
        declared_on: '2026-11-05',
      },
    ],
  });
  const [e] = await catalogue().ecoles();
  expect(e?.agrement).toMatchObject({ reference: 'ecole', sourceTexte: '[Journal officiel]' });
  expect(e?.formations[0]?.agrement).toMatchObject({
    reference: 'filiere',
    delivreLe: '2024-03-12',
  });
  expect(e?.formations[1]?.agrement).toBeNull();
  expect(e?.motDirection).toEqual({ texte: 'Un mot.', ditLe: '2026-11-05' });
  expect(e?.inscriptions).toEqual([
    { id: 'd1', anneeScolaire: '2026-2027', limite: '2026-12-15', declareeLe: '2026-11-05' },
  ]);
});

it('n’invente rien quand la base n’a ni référence, ni mot, ni date', async () => {
  fausseBase({ public_campuses: [CAMPUS] });
  const [e] = await catalogue().ecoles();
  expect(e).toMatchObject({ agrement: null, motDirection: null, inscriptions: [] });
});

it('ne charge que la photo sélectionnée via le catalogue public', async () => {
  fausseBase({
    public_campuses: [CAMPUS],
    public_campus_photos: [
      { campus_id: 'c1', id: '93000000-0000-4000-8000-000000000001', taken_at: '2026-11-03' },
    ],
  });
  const [e] = await catalogue().ecoles();
  expect(e?.photo).toEqual({ id: '93000000-0000-4000-8000-000000000001', prisLe: '2026-11-03' });
  await expect(catalogue().lirePhotoPublique!('../prive')).rejects.toThrow('inconnue');
});

it('refuse un fichier absent de la vue publique et ne télécharge jamais un chemin arbitraire', async () => {
  fausseBase({ public_campus_photos: [] });
  await expect(
    catalogue().lirePhotoPublique!('93000000-0000-4000-8000-000000000001'),
  ).rejects.toThrow('non publiée');
});
