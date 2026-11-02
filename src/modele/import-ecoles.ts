/**
 * Lire une liste d'écoles à importer (CSV ou JSON) avant de l'envoyer à la base : chaque ligne est
 * contrôlée, une ligne en erreur est écartée avec son numéro, les autres partent en simulation.
 * La base refait les mêmes contrôles : celui-ci évite l'aller-retour et dit où est la faute.
 * Pur : ni base ni écran.
 *
 * Le JSON suit les ports (clés en français) :
 *
 *     [{ "reference": "ETB-012", "nom": "Complexe scolaire X", "genre": "privee",
 *        "campus": [{ "etiquette": "Campus de Loandjili", "division": "congo.pointe_noire.pointe_noire.loandjili",
 *                     "quartier": "…", "repere": "…", "numeroEnseigne": "242…",
 *                     "position": { "latitude": -4.79, "longitude": 11.9 },
 *                     "cycles": ["maternelle", { "cycle": "lycee", "formations": [
 *                        { "titre": "Série C", "domaine": "sciences-technologies", "serie": "c", "diplome": "bac", "rythmes": ["jour"] } ] }] }] }]
 *
 * Le CSV a une ligne par campus ; des lignes de même `reference` sont les campus d'une même institution :
 *
 *     reference;nom;genre;etiquette;division;quartier;repere;numero;latitude;longitude;programme;cycles;formations
 *     ETB-012;Complexe scolaire X;privee;;congo.pointe_noire.pointe_noire.tie_tie;…;…;242…;-4.79;11.9;;maternelle|primaire;lycee:Série C:sciences-technologies:c:bac:jour+soir
 */
import { z } from 'zod';
import { listes, type Valeur } from './listes';
import type { EntreeCampus, EntreeCatalogue } from './ports';
import { normaliserTelephone } from './telephone';

export interface ErreurImport {
  /** Le numéro de la ligne (CSV) ou de l'école (JSON), à partir de 1. */
  ligne: number;
  nom: string | null;
  message: string;
}

export interface LectureImport {
  entrees: EntreeCatalogue[];
  /** Le numéro de ligne de chaque école de `entrees` : la base rapporte ses erreurs par rang dans la liste envoyée. */
  lignes: number[];
  erreurs: ErreurImport[];
}

export interface OptionsImport {
  /** Les adresses des domaines connus : un domaine inconnu est une erreur plutôt qu'une formation sans domaine. */
  domaines?: readonly string[];
}

const vide = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/** Sans accent, en minuscules, une seule espace : pour reconnaître « Privée », « privé », « PRIVEE ». */
const norme = (texte: string): string =>
  texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parmi<L extends keyof typeof listes>(
  liste: L,
  texte: string,
  synonymes: Record<string, Valeur<L>> = {},
): Valeur<L> | null {
  const t = norme(texte);
  const valeurs = listes[liste] as readonly string[];
  const direct = valeurs.find((v) => norme(v) === t);
  if (direct) return direct as Valeur<L>;
  return synonymes[t] ?? null;
}

const GENRES: Record<string, Valeur<'type_ecole'>> = {
  prive: 'privee',
  privee: 'privee',
  public: 'publique',
  publique: 'publique',
  confessionnel: 'confessionnelle',
  confessionnelle: 'confessionnelle',
  communautaire: 'communautaire',
  'pas indique': 'non_indique',
  inconnu: 'non_indique',
};

const CYCLES: Record<string, Valeur<'niveau'>> = {
  creche: 'creche',
  garderie: 'creche',
  maternelle: 'maternelle',
  primaire: 'primaire',
  college: 'college',
  lycee: 'lycee',
  technique: 'technique',
  professionnel: 'technique',
  'technique ou professionnel': 'technique',
  superieur: 'superieur',
  universite: 'superieur',
  'autre formation': 'autre_formation',
  formation: 'autre_formation',
};

const SERIES: Record<string, Valeur<'bac_track'>> = Object.fromEntries(
  listes.bac_track.map((s) => [s, s]),
);

const RYTHMES: Record<string, Valeur<'study_rhythm'>> = {
  jour: 'jour',
  soir: 'soir',
  weekend: 'weekend',
  'week end': 'weekend',
  'fin de semaine': 'weekend',
};

// Le CSV ------------------------------------------------------------------------------

/** Un CSV simple (guillemets, séparateur `;` ou `,` reconnu sur la première ligne, retours à la ligne dans les champs). */
export function lireCsv(texte: string): Record<string, string>[] {
  const sansBom = texte.replace(/^\uFEFF/, '');
  const premiere = sansBom.split(/\r?\n/, 1)[0] ?? '';
  const separateur =
    (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ';' : ',';
  const lignes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let entreGuillemets = false;
  for (let i = 0; i < sansBom.length; i++) {
    const c = sansBom[i];
    if (entreGuillemets) {
      if (c === '"' && sansBom[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === separateur) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && sansBom[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  const [entetes = [], ...donnees] = lignes;
  return donnees
    .filter((l) => l.some((v) => v.trim() !== ''))
    .map((l) =>
      Object.fromEntries(entetes.map((e, i) => [norme(e).replace(/ /g, '_'), (l[i] ?? '').trim()])),
    );
}

const ALIAS: Record<string, string> = {
  ref: 'reference',
  id: 'reference',
  name: 'nom',
  type: 'genre',
  campus: 'etiquette',
  implantation: 'etiquette',
  telephone: 'numero',
  tel: 'numero',
  numero_enseigne: 'numero',
  lat: 'latitude',
  lng: 'longitude',
  lon: 'longitude',
  niveaux: 'cycles',
};

function champ(ligne: Record<string, string>, nom: string): string | null {
  if (ligne[nom] !== undefined) return vide(ligne[nom]);
  const cle = Object.keys(ligne).find((k) => ALIAS[k] === nom);
  return cle ? vide(ligne[cle]) : null;
}

function decimal(texte: string | null, nom: string): number | null | string {
  if (texte === null) return null;
  const n = Number(texte.replace(',', '.'));
  return Number.isFinite(n) ? n : `${nom} illisible (« ${texte} »)`;
}

/** `cycle:titre[:domaine[:serie[:diplome[:rythmes]]]]`, plusieurs séparées par `|` ; rythmes séparés par `+`. */
function formationsCsv(texte: string | null): {
  parCycle: Map<Valeur<'niveau'>, NonNullable<EntreeCampus['cycles'][number]['formations']>>;
  erreur: string | null;
} {
  const parCycle = new Map<Valeur<'niveau'>, EntreeCampus['cycles'][number]['formations']>();
  if (texte === null) return { parCycle, erreur: null };
  for (const brut of texte.split('|')) {
    const morceaux = brut.split(':').map((m) => m.trim());
    const [
      cycleBrut = '',
      titre = '',
      domaine = '',
      serieBrute = '',
      diplomeBrut = '',
      rythmesBruts = '',
    ] = morceaux;
    if (cycleBrut === '' && titre === '') continue;
    const cycle = parmi('niveau', cycleBrut, CYCLES);
    if (!cycle) return { parCycle, erreur: `cycle inconnu dans les formations : « ${cycleBrut} »` };
    if (titre === '')
      return { parCycle, erreur: `formation sans titre dans le cycle « ${cycleBrut} »` };
    const serie = serieBrute === '' ? null : parmi('bac_track', serieBrute, SERIES);
    if (serieBrute !== '' && !serie)
      return { parCycle, erreur: `série inconnue : « ${serieBrute} »` };
    const diplome = diplomeBrut === '' ? null : parmi('diploma_kind', diplomeBrut);
    if (diplomeBrut !== '' && !diplome)
      return { parCycle, erreur: `diplôme inconnu : « ${diplomeBrut} »` };
    const rythmes: Valeur<'study_rhythm'>[] = [];
    for (const r of rythmesBruts.split('+').filter((x) => x.trim() !== '')) {
      const rythme = parmi('study_rhythm', r, RYTHMES);
      if (!rythme) return { parCycle, erreur: `rythme inconnu : « ${r} » (jour, soir, week-end)` };
      rythmes.push(rythme);
    }
    parCycle.set(cycle, [
      ...(parCycle.get(cycle) ?? []),
      { titre, domaine: vide(domaine), serie, diplome, rythmes },
    ]);
  }
  return { parCycle, erreur: null };
}

function campusDeLigne(ligne: Record<string, string>): EntreeCampus | string {
  const latitude = decimal(champ(ligne, 'latitude'), 'latitude');
  const longitude = decimal(champ(ligne, 'longitude'), 'longitude');
  if (typeof latitude === 'string') return latitude;
  if (typeof longitude === 'string') return longitude;
  if ((latitude === null) !== (longitude === null))
    return 'la latitude et la longitude vont ensemble';
  const numeroBrut = champ(ligne, 'numero');
  const numero = numeroBrut === null ? null : normaliserTelephone(numeroBrut);
  if (numeroBrut !== null && numero === null) return `numéro incomplet (« ${numeroBrut} »)`;

  const cyclesBruts = (champ(ligne, 'cycles') ?? '')
    .split(/[|;]/)
    .map((c) => c.trim())
    .filter(Boolean);
  const cycles = new Map<Valeur<'niveau'>, EntreeCampus['cycles'][number]['formations']>();
  for (const brut of cyclesBruts) {
    const cycle = parmi('niveau', brut, CYCLES);
    if (!cycle) return `cycle inconnu : « ${brut} »`;
    cycles.set(cycle, []);
  }
  const { parCycle, erreur } = formationsCsv(champ(ligne, 'formations'));
  if (erreur) return erreur;
  for (const [cycle, formations] of parCycle)
    cycles.set(cycle, [...(cycles.get(cycle) ?? []), ...formations]);

  return {
    etiquette: champ(ligne, 'etiquette'),
    division: champ(ligne, 'division'),
    quartier: champ(ligne, 'quartier'),
    repere: champ(ligne, 'repere'),
    numeroEnseigne: numero,
    position: latitude === null || longitude === null ? null : { latitude, longitude },
    programme: champ(ligne, 'programme'),
    cycles: [...cycles].map(([cycle, formations]) => ({ cycle, formations })),
  };
}

function depuisCsv(texte: string): LectureImport {
  const lignes = lireCsv(texte);
  const erreurs: ErreurImport[] = [];
  const parReference = new Map<string, EntreeCatalogue>();
  const entrees: EntreeCatalogue[] = [];
  const numeros: number[] = [];
  lignes.forEach((l, i) => {
    const numero = i + 2; // la ligne 1 est l'en-tête
    const nom = champ(l, 'nom');
    if (nom === null) {
      erreurs.push({ ligne: numero, nom: null, message: 'le nom est obligatoire' });
      return;
    }
    const genreBrut = champ(l, 'genre');
    const genre = genreBrut === null ? 'non_indique' : parmi('type_ecole', genreBrut, GENRES);
    if (!genre) {
      erreurs.push({
        ligne: numero,
        nom,
        message: `genre inconnu : « ${genreBrut} » (publique, privée, confessionnelle…)`,
      });
      return;
    }
    const campus = campusDeLigne(l);
    if (typeof campus === 'string') {
      erreurs.push({ ligne: numero, nom, message: campus });
      return;
    }
    const reference = champ(l, 'reference');
    const existante = reference ? parReference.get(reference) : undefined;
    if (existante) {
      existante.campus.push(campus);
      return;
    }
    const entree: EntreeCatalogue = { reference, nom, genre, campus: [campus] };
    if (reference) parReference.set(reference, entree);
    entrees.push(entree);
    numeros.push(numero);
  });
  return { entrees, lignes: numeros, erreurs };
}

// Le JSON -------------------------------------------------------------------------------

const texteLibre = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => vide(v));

const formationJson = z.object({
  titre: z.string().trim().min(1, 'une formation sans titre').max(160),
  domaine: texteLibre(80),
  serie: z
    .enum(listes.bac_track)
    .nullish()
    .transform((v) => v ?? null),
  diplome: z
    .enum(listes.diploma_kind)
    .nullish()
    .transform((v) => v ?? null),
  rythmes: z
    .array(z.enum(listes.study_rhythm))
    .nullish()
    .transform((v) => v ?? []),
});

const cycleJson = z.union([
  z
    .enum(listes.niveau)
    .transform((cycle) => ({ cycle, formations: [] as z.infer<typeof formationJson>[] })),
  z.object({
    cycle: z.enum(listes.niveau),
    formations: z
      .array(formationJson)
      .nullish()
      .transform((v) => v ?? []),
  }),
]);

const campusJson = z.object({
  etiquette: texteLibre(120),
  division: texteLibre(200),
  quartier: texteLibre(100),
  repere: texteLibre(300),
  numeroEnseigne: texteLibre(30),
  position: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullish()
    .transform((v) => v ?? null),
  programme: texteLibre(200),
  cycles: z
    .array(cycleJson)
    .nullish()
    .transform((v) => v ?? []),
});

const entreeJson = z.object({
  reference: texteLibre(40),
  nom: z.string().trim().min(1, 'le nom est obligatoire').max(200),
  genre: z
    .enum(listes.type_ecole)
    .nullish()
    .transform((v) => v ?? 'non_indique'),
  campus: z.array(campusJson).min(1, 'il faut au moins un campus'),
});

function messageZod(erreur: z.ZodError): string {
  const premiere = erreur.issues[0];
  if (!premiere) return 'ligne illisible';
  const ou = premiere.path.length > 0 ? `${premiere.path.join(' › ')} : ` : '';
  return `${ou}${premiere.message}`;
}

function depuisJson(texte: string): LectureImport {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return {
      entrees: [],
      lignes: [],
      erreurs: [
        {
          ligne: 1,
          nom: null,
          message: 'le JSON est illisible (une virgule ou un guillemet manque ?)',
        },
      ],
    };
  }
  const liste = Array.isArray(brut) ? brut : (brut as { ecoles?: unknown } | null)?.ecoles;
  if (!Array.isArray(liste)) {
    return {
      entrees: [],
      lignes: [],
      erreurs: [
        { ligne: 1, nom: null, message: 'une liste d’écoles est attendue : [ { "nom": … }, … ]' },
      ],
    };
  }
  const entrees: EntreeCatalogue[] = [];
  const numeros: number[] = [];
  const erreurs: ErreurImport[] = [];
  liste.forEach((element, i) => {
    const lu = entreeJson.safeParse(element);
    const nom =
      typeof (element as { nom?: unknown } | null)?.nom === 'string'
        ? (element as { nom: string }).nom
        : null;
    if (!lu.success) {
      erreurs.push({ ligne: i + 1, nom, message: messageZod(lu.error) });
      return;
    }
    const campus: EntreeCampus[] = [];
    for (const c of lu.data.campus) {
      const numero = c.numeroEnseigne === null ? null : normaliserTelephone(c.numeroEnseigne);
      if (c.numeroEnseigne !== null && numero === null) {
        erreurs.push({
          ligne: i + 1,
          nom: lu.data.nom,
          message: `numéro incomplet (« ${c.numeroEnseigne} »)`,
        });
        return;
      }
      campus.push({ ...c, numeroEnseigne: numero });
    }
    entrees.push({ reference: lu.data.reference, nom: lu.data.nom, genre: lu.data.genre, campus });
    numeros.push(i + 1);
  });
  return { entrees, lignes: numeros, erreurs };
}

/** Un domaine de formation inconnu est écarté avec un message, plutôt que d'entrer sans domaine. */
function controlerDomaines(lecture: LectureImport, domaines: readonly string[]): LectureImport {
  const erreurs = [...lecture.erreurs];
  const entrees: EntreeCatalogue[] = [];
  const lignes: number[] = [];
  lecture.entrees.forEach((e, i) => {
    const inconnu = e.campus
      .flatMap((c) => c.cycles.flatMap((cy) => cy.formations.map((f) => f.domaine)))
      .find((d) => d !== null && !domaines.includes(d));
    const ligne = lecture.lignes[i] ?? i + 1;
    if (inconnu) {
      erreurs.push({ ligne, nom: e.nom, message: `domaine inconnu : « ${inconnu} »` });
    } else {
      entrees.push(e);
      lignes.push(ligne);
    }
  });
  return { entrees, lignes, erreurs };
}

/** Lit un CSV ou un JSON (reconnu à son premier caractère). Une ligne en erreur est écartée avec sa raison. */
export function lireImportation(texte: string, options: OptionsImport = {}): LectureImport {
  const nettoye = texte.replace(/^\uFEFF/, '').trim();
  if (nettoye === '') {
    return {
      entrees: [],
      lignes: [],
      erreurs: [{ ligne: 1, nom: null, message: 'le fichier est vide' }],
    };
  }
  const lecture =
    nettoye.startsWith('[') || nettoye.startsWith('{') ? depuisJson(nettoye) : depuisCsv(nettoye);
  return options.domaines ? controlerDomaines(lecture, options.domaines) : lecture;
}
