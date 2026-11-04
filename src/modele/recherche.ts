/**
 * Chercher une école : par son nom, son repère, son cycle, et par ce qu'elle enseigne (série de bac, diplôme,
 * domaine, rythme). Tout est calculé dans le navigateur sur un fichier construit avec le site (`/recherche.json`) :
 * les pages publiques n'appellent jamais la base, et chercher ne coûte ni serveur ni compte.
 *
 * Même règle que la base (`search_campuses`) : les critères de formation (série, diplôme, domaine, rythme) portent
 * sur UNE MÊME formation. « Série C » et « soir » = une formation du soir en série C. « f » et « g » trouvent aussi
 * F1 à F4 et G1 à G3. Pur : ni base, ni DOM.
 */
import { distanceMetres, type Point } from './geo';
import { libelleDiplome, libelleNiveau, libelleRythme, libelleSerie } from './libelles';
import { listes, type Valeur } from './listes';
import type { DomainePublic, EcolePubliee } from './ports';
import { lienEcole } from './geo-divisions';

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

export const lienFacette = (f: { facette: Facette; valeur: string }): string =>
  `/formations/${f.facette}/${f.valeur}/`;

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
  };
}

export interface Criteres {
  texte?: string;
  /** Une zone (`congo/pointe-noire`) : ses écoles et celles de tout ce qu'elle contient. */
  zone?: string | undefined;
  niveau?: Valeur<'niveau'> | undefined;
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
    if (criteres.niveau && !ligne.c.includes(criteres.niveau)) continue;
    if (criteres.zone && ligne.z !== criteres.zone && !ligne.z.startsWith(`${criteres.zone}/`))
      continue;
    if (avecFormation) {
      const bonne = ligne.f.some(
        (f) =>
          (criteres.niveau === undefined || f.c === criteres.niveau) &&
          (criteres.serie === undefined || serieCorrespond(criteres.serie, f)) &&
          (criteres.diplome === undefined || f.d === criteres.diplome) &&
          (criteres.domaine === undefined || f.m === criteres.domaine) &&
          (criteres.rythme === undefined || f.y?.includes(criteres.rythme) === true),
      );
      if (!bonne) continue;
    }
    if (mots.length > 0) {
      const motsDeLEcole = normaliser(
        [ligne.n, ligne.e, ligne.d, ligne.q, ligne.r, ...ligne.f.map((f) => f.t)]
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
