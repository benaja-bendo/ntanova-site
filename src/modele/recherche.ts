/**
 * Chercher une école : par son nom, son repère, son cycle, et par ce qu'elle enseigne (série de bac, diplôme,
 * domaine, rythme). Tout est calculé dans le navigateur sur un fichier construit avec le site (`/recherche.json`) :
 * les pages publiques n'appellent jamais la base, et chercher ne coûte ni serveur ni compte.
 *
 * Même règle que la base (`search_campuses`) : les critères de formation (série, diplôme, domaine, rythme) portent
 * sur UNE MÊME formation. « Série C » et « soir » = une formation du soir en série C. « f » et « g » trouvent aussi
 * F1 à F4 et G1 à G3. Pur : ni base, ni DOM.
 */
import { lettresDesCycles } from './carte/cycles';
import { distanceMetres, type Point } from './geo';
import {
  libelleDiplome,
  libelleNiveau,
  libelleRythme,
  libelleSerie,
  typeInformatif,
} from './libelles';
import { listes, type Valeur } from './listes';
import type { DomainePublic, EcolePubliee } from './ports';
import { lienEcole, sansRepetition } from './geo-divisions';

/** Sans accent, en minuscules, les tirets et les apostrophes lus comme des espaces : « Tié-Tié » = « tie tie ». */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Les facettes : ce qui rend une école trouvable par ce qu'elle enseigne -----------------------------------

export type Facette = 'niveau' | 'serie' | 'diplome' | 'domaine' | 'rythme';

export const NOM_FACETTE: Readonly<Record<Facette, string>> = {
  niveau: 'Niveau',
  serie: 'Série du bac',
  diplome: 'Diplôme',
  domaine: 'Domaine',
  rythme: 'Rythme',
};

/** Une valeur de facette qui a au moins une école publiée, avec sa page. */
export interface ValeurFacette {
  facette: Facette;
  valeur: string;
  libelle: string;
  ecoles: EcolePubliee[];
}

/** Une formation, une série, un diplôme… : la page « Écoles » filtrée (ticket 146 ; les pages `/formations/` y renvoient). */
export const lienFacette = (f: { facette: Facette; valeur: string }): string =>
  `/ecoles/?${f.facette}=${encodeURIComponent(f.valeur)}`;

/**
 * Les valeurs de chaque facette qui ont au moins une école publiée (pas de page vide). « Série F » rassemble F, F1 à F4 ;
 * « Série G », G et G1 à G3.
 */
export function facettesPubliques(
  ecoles: readonly EcolePubliee[],
  domaines: readonly DomainePublic[],
): ValeurFacette[] {
  const resultat: ValeurFacette[] = [];
  const ajouter = (facette: Facette, valeur: string, libelle: string, retenues: EcolePubliee[]) => {
    if (retenues.length > 0) resultat.push({ facette, valeur, libelle, ecoles: retenues });
  };

  for (const n of listes.niveau) {
    ajouter(
      'niveau',
      n,
      libelleNiveau[n],
      ecoles.filter((e) => e.niveaux.includes(n)),
    );
  }
  for (const s of listes.bac_track) {
    const famille = s === 'f' || s === 'g';
    ajouter(
      'serie',
      s,
      famille ? `${libelleSerie[s]} (toutes les variantes)` : libelleSerie[s],
      ecoles.filter((e) =>
        e.formations.some(
          (f) => f.serie !== null && (f.serie === s || (famille && f.serie.startsWith(s))),
        ),
      ),
    );
  }
  for (const d of listes.diploma_kind) {
    ajouter(
      'diplome',
      d,
      libelleDiplome[d],
      ecoles.filter((e) => e.formations.some((f) => f.diplome === d)),
    );
  }
  for (const d of domaines) {
    ajouter(
      'domaine',
      d.slug,
      d.nom,
      ecoles.filter((e) => e.formations.some((f) => f.domaine?.slug === d.slug)),
    );
  }
  for (const r of listes.study_rhythm) {
    ajouter(
      'rythme',
      r,
      libelleRythme[r],
      ecoles.filter((e) => e.formations.some((f) => f.rythmes.includes(r))),
    );
  }
  return resultat;
}

/** Les filtres de formation de « Rechercher » : ce qui sert à croiser plusieurs critères, replié sous « Plus de filtres ». */
export interface FiltreAvance {
  facette: Exclude<Facette, 'niveau'>;
  titre: string;
  /** Le mot de l'option qui ne filtre rien. */
  tous: string;
}

const FILTRES_DE_FORMATION: readonly FiltreAvance[] = [
  { facette: 'serie', titre: NOM_FACETTE.serie, tous: 'Toutes' },
  { facette: 'diplome', titre: NOM_FACETTE.diplome, tous: 'Tous' },
  { facette: 'domaine', titre: NOM_FACETTE.domaine, tous: 'Tous' },
  { facette: 'rythme', titre: NOM_FACETTE.rythme, tous: 'Tous' },
];

/** Seulement les filtres qui ont au moins une valeur dans les données construites : un menu vide ne mène nulle part. */
export function filtresAvances(
  facettes: readonly Pick<ValeurFacette, 'facette'>[],
): FiltreAvance[] {
  return FILTRES_DE_FORMATION.filter((f) => facettes.some((v) => v.facette === f.facette));
}

/** Ce que la page « par formation » dit de son contenu, sans rien promettre d'absent : « niveau, série du bac et diplôme ». */
export function enumererLesFacettes(facettes: readonly Facette[]): string {
  const noms = facettes.map((f) => NOM_FACETTE[f].toLowerCase());
  return noms.length > 1
    ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
    : (noms[0] ?? '');
}

// Le fichier de recherche ------------------------------------------------------------------------------

/** Une formation, en abrégé, dans le fichier de recherche. */
export interface FormationRecherche {
  /** Le cycle. */
  c: Valeur<'niveau'>;
  /** Le titre tel qu'il est écrit. */
  t: string;
  s?: Valeur<'bac_track'>;
  d?: Valeur<'diploma_kind'>;
  /** L'adresse du domaine. */
  m?: string;
  y?: Valeur<'study_rhythm'>[];
}

/** Une école, en abrégé : ce que la recherche et « autour de moi » ont besoin de lire, rien de plus. */
export interface LigneRecherche {
  /** L'identifiant du campus. */
  i: string;
  /** Le nom de l'institution. */
  n: string;
  /** L'implantation. */
  e?: string;
  /** L'adresse de la fiche. */
  u: string;
  /** Où : « Congo › Pointe-Noire › Tié-Tié ». */
  d: string;
  /**
   * Les autres écritures des zones où se trouve l'école (« Mvoumvou » pour « Mvou-Mvou »), pour chercher seulement : elles
   * ne s'affichent jamais. Absent quand aucune zone n'en a.
   */
  a?: string;
  /** L'adresse de la zone (`congo/pointe-noire/tie-tie`), pour chercher dans une zone et tout ce qu'elle contient. */
  z: string;
  /** Le quartier dit sur place. */
  q?: string;
  /** Le repère. */
  r?: string;
  /** Les cycles. */
  c: Valeur<'niveau'>[];
  f: FormationRecherche[];
  /** La position, quand elle est connue. */
  la?: number;
  lo?: number;
  /** « Fiche vérifiée par la direction ». */
  v?: 1;
  /** Vue sur place par un relais (la fiche porte alors une date de passage). */
  o?: 1;
  /** Déclarée par l'école elle-même. */
  g?: 1;
  /** Le jour de la preuve la plus forte (l'accord, le passage ou la déclaration), quand il est connu : la ligne le dit. */
  t?: string;
  /** Le type de l'école, quand il est connu (la ligne d'une école l'écrit). */
  k?: Valeur<'type_ecole'>;
}

/** Les autres écritures des zones, par adresse de zone (`congo/pointe-noire/tie-tie`, sans répétition). */
type EcrituresDesZones = ReadonlyMap<string, readonly string[]>;

/** Ce que les zones disent d'elles-mêmes en dehors de leur nom : le département et la ville de même nom se partagent une adresse. */
function ecrituresDesZones(
  divisions: readonly { adresse: readonly string[]; alias: readonly string[] }[],
): EcrituresDesZones {
  const parAdresse = new Map<string, string[]>();
  for (const d of divisions) {
    if (d.alias.length === 0) continue;
    const cle = sansRepetition(d.adresse).join('/');
    parAdresse.set(cle, [...(parAdresse.get(cle) ?? []), ...d.alias]);
  }
  return parAdresse;
}

/** Les autres écritures de toutes les zones où se trouve l'école : sa ville, son arrondissement, le pays. */
function ecrituresDeLEcole(adresse: readonly string[], ecritures: EcrituresDesZones): string[] {
  const chaine = sansRepetition(adresse);
  const trouvees: string[] = [];
  for (let n = 1; n <= chaine.length; n++) {
    trouvees.push(...(ecritures.get(chaine.slice(0, n).join('/')) ?? []));
  }
  return trouvees;
}

/**
 * Le fichier de recherche : une ligne par école, avec les autres écritures des zones où elle se trouve (« Tietie » trouve
 * Tié-Tié). Une zone qui n'en a pas n'ajoute rien à la ligne.
 */
export function lignesDeRecherche(
  ecoles: readonly EcolePubliee[],
  divisions: readonly { adresse: readonly string[]; alias: readonly string[] }[],
): LigneRecherche[] {
  const ecritures = ecrituresDesZones(divisions);
  return ecoles.map((e) => {
    const autres = ecrituresDeLEcole(e.adresse, ecritures);
    const ligne = ligneDe(e);
    return autres.length > 0 ? { ...ligne, a: autres.join(' ') } : ligne;
  });
}

export function ligneDe(e: EcolePubliee): LigneRecherche {
  return {
    i: e.id,
    n: e.nom,
    ...(e.etiquette ? { e: e.etiquette } : {}),
    u: lienEcole(e),
    d: e.divisionNoms.join(' › '),
    z: e.adresse.join('/'),
    ...(e.quartier ? { q: e.quartier } : {}),
    ...(e.repere ? { r: e.repere } : {}),
    c: e.niveaux,
    f: e.formations.map((f) => ({
      c: f.cycle,
      t: f.titre,
      ...(f.serie ? { s: f.serie } : {}),
      ...(f.diplome ? { d: f.diplome } : {}),
      ...(f.domaine ? { m: f.domaine.slug } : {}),
      ...(f.rythmes.length > 0 ? { y: f.rythmes } : {}),
    })),
    ...(e.latitude !== null && e.longitude !== null ? { la: e.latitude, lo: e.longitude } : {}),
    ...(e.etat === 'verifiee' ? { v: 1 as const } : {}),
    ...(e.releveeLe !== null ? { o: 1 as const } : {}),
    ...(e.origine === 'school' ? { g: 1 as const } : {}),
    ...(typeInformatif(e.typeEcole) ? { k: e.typeEcole } : {}),
    ...(dateDeLaPreuveForte(e) ? { t: dateDeLaPreuveForte(e) as string } : {}),
  };
}

/** Le jour de la preuve la plus forte, dans l'ordre de `provenanceDe` : l'accord, le passage, puis la déclaration. */
function dateDeLaPreuveForte(e: EcolePubliee): string | null {
  if (e.etat === 'verifiee') return e.verifieeLe;
  if (e.releveeLe !== null) return e.releveeLe;
  return e.origine === 'school' ? (e.declareeLe ?? null) : null;
}

export interface Criteres {
  texte?: string;
  /** Une zone (`congo/pointe-noire`) : ses écoles et celles de tout ce qu'elle contient. */
  zone?: string | undefined;
  /** Le type d'école (publique, privée…) : seulement les écoles dont le type est connu et le même. */
  type?: Valeur<'type_ecole'> | undefined;
  niveau?: Valeur<'niveau'> | undefined;
  /** La lettre d'un cycle (M, P, C, L, T, S : celle de l'épingle et des puces) : toutes les écoles qui l'enseignent. */
  cycle?: string | undefined;
  serie?: Valeur<'bac_track'> | undefined;
  diplome?: Valeur<'diploma_kind'> | undefined;
  domaine?: string | undefined;
  rythme?: Valeur<'study_rhythm'> | undefined;
  /** Autour de : classe par distance et, avec `rayonM`, écarte les écoles plus loin. */
  pres?: Point | undefined;
  rayonM?: number | undefined;
}

export interface Resultat {
  ligne: LigneRecherche;
  /** En mètres, quand la recherche est « autour de moi » et que l'école est située. */
  distance: number | null;
}

const serieCorrespond = (voulue: string, f: FormationRecherche): boolean =>
  f.s !== undefined &&
  (f.s === voulue || ((voulue === 'f' || voulue === 'g') && f.s.startsWith(voulue)));

/** Les écoles qui répondent aux critères (tous à la fois), classées par distance ou par nom. */
export function chercher(lignes: readonly LigneRecherche[], criteres: Criteres): Resultat[] {
  const mots = normaliser(criteres.texte ?? '')
    .split(' ')
    .filter(Boolean);
  const avecFormation =
    criteres.serie !== undefined ||
    criteres.diplome !== undefined ||
    criteres.domaine !== undefined ||
    criteres.rythme !== undefined;

  const retenues: Resultat[] = [];
  for (const ligne of lignes) {
    if (criteres.type && ligne.k !== criteres.type) continue;
    if (criteres.niveau && !ligne.c.includes(criteres.niveau)) continue;
    if (criteres.cycle && !lettresDesCycles(ligne.c).includes(criteres.cycle)) continue;
    if (criteres.zone && ligne.z !== criteres.zone && !ligne.z.startsWith(`${criteres.zone}/`))
      continue;
    if (avecFormation) {
      const bonne = ligne.f.some(
        (f) =>
          (criteres.niveau === undefined || f.c === criteres.niveau) &&
          (criteres.cycle === undefined || lettresDesCycles([f.c]) === criteres.cycle) &&
          (criteres.serie === undefined || serieCorrespond(criteres.serie, f)) &&
          (criteres.diplome === undefined || f.d === criteres.diplome) &&
          (criteres.domaine === undefined || f.m === criteres.domaine) &&
          (criteres.rythme === undefined || f.y?.includes(criteres.rythme) === true),
      );
      if (!bonne) continue;
    }
    if (mots.length > 0) {
      const motsDeLEcole = normaliser(
        [ligne.n, ligne.e, ligne.d, ligne.a, ligne.q, ligne.r, ...ligne.f.map((f) => f.t)]
          .filter(Boolean)
          .join(' '),
      ).split(' ');
      // Chaque mot cherché doit être le début d'un mot de l'école : « tie » trouve « Tié-Tié », pas « quartier ».
      if (!mots.every((m) => motsDeLEcole.some((mot) => mot.startsWith(m)))) continue;
    }
    let distance: number | null = null;
    if (criteres.pres) {
      if (ligne.la !== undefined && ligne.lo !== undefined) {
        distance = distanceMetres(criteres.pres, { latitude: ligne.la, longitude: ligne.lo });
        if (criteres.rayonM !== undefined && distance > criteres.rayonM) continue;
      } else if (criteres.rayonM !== undefined) {
        continue; // sans position, on ne peut pas dire qu'elle est près
      }
    }
    retenues.push({ ligne, distance });
  }

  const collateur = new Intl.Collator('fr', { sensitivity: 'base' });
  return retenues.sort((a, b) =>
    a.distance !== null && b.distance !== null && a.distance !== b.distance
      ? a.distance - b.distance
      : a.distance !== null && b.distance === null
        ? -1
        : a.distance === null && b.distance !== null
          ? 1
          : collateur.compare(a.ligne.n, b.ligne.n) ||
            collateur.compare(a.ligne.e ?? '', b.ligne.e ?? ''),
  );
}

/** « 350 m », « 1,2 km », « 3 km » */
export function ecrireDistance(metres: number): string {
  if (metres < 950) return `${Math.max(10, Math.round(metres / 10) * 10)}\u00a0m`;
  // Arrondi au dixième de kilomètre sans passer par toFixed (0,95 s'y écrit 0,9 : 950 m ne doit pas se lire « 0,9 km »).
  const km = Math.round(metres / 100) / 10;
  return `${Number.isInteger(km) ? km : km.toFixed(1).replace('.', ',')}\u00a0km`;
}
