/**
 * Lot 4 bis du site public : « Les écoles », une page, deux vues (planches de la version 46, feu vert du fondateur le
 * 16/11/2026). Ce module dit l'état de la page (lu et écrit dans l'adresse, pour qu'un lien partagé rouvre ce qu'on voyait),
 * filtre, trie, et compte chaque option des filtres. Pur : ni DOM, ni Astro.
 *
 * Règle des filtres (16/11) :
 * - une option paraît dès qu'une école a la donnée, avec un compteur qui suit les autres choix ;
 * - à 0, elle disparaît ; cochée, elle reste (grisée) pour qu'on puisse toujours revenir en arrière ;
 * - un groupe qui ne trie rien (une seule valeur, rien de coché) est caché : Pays, Type à Pointe-Noire ;
 * - plusieurs choix dans un groupe s'additionnent (« ou ») ; deux groupes se croisent (« et ») ;
 * - les critères de formation (série, diplôme, domaine, rythme) portent sur une même formation, comme `chercher`.
 *
 * Refonte publique, lot 1 (24/11/2026) : la recherche « Quoi ? / Où ? » de l'accueil. `q` reste le quoi (nom, sigle,
 * formation, quartier, repère) ; `ou` est un lieu écrit librement, cherché seulement dans les lieux documentés de l'école :
 * ses divisions (ville, arrondissement, quartier), leurs autres écritures et le quartier dit sur place. Sans accents ni
 * casse ; chaque mot est le début d'un mot du lieu. Un lieu inconnu ne trouve rien : jamais un lieu supposé.
 */
import { lettresDesCycles } from './carte/cycles';
import { distanceMetres, type Point } from './geo';
import { libelleEquipement } from './equipements-ecole';
import { libelleDiplome, libelleRythme, libelleSerie, libelleTypeEcole } from './libelles';
import { listes, type Valeur } from './listes';
import { normaliser, type LigneRecherche } from './recherche';

// L'état de la page -----------------------------------------------------------------------------------------------------

/** Les groupes de filtres à choix multiples, dans l'ordre de la feuille « Filtres ». */
export const GROUPES = [
  'ville',
  'arrondissement',
  'niveau',
  'type',
  'serie',
  'diplome',
  'domaine',
  'rythme',
  'equipement',
  'frais',
] as const;
export type Groupe = (typeof GROUPES)[number];

export const TITRES_DES_GROUPES: Record<Groupe, string> = {
  ville: 'Ville',
  arrondissement: 'Arrondissement',
  niveau: 'Niveau',
  type: 'Type',
  serie: 'Séries du bac',
  diplome: 'Diplôme',
  domaine: 'Domaine',
  rythme: 'Rythme',
  equipement: 'Équipements',
  frais: 'Frais par mois',
};

/** Les rayons d'« Autour de moi » (fondateur, 16/11). */
export const RAYONS_M = [1000, 3000, 10000] as const;

export type Tri = 'recentes' | 'proches' | 'nom';
export type Vue = 'liste' | 'carte';

/** Une zone de la carte : ouest, sud, est, nord (« Chercher dans cette zone »). */
export type Cadre = readonly [number, number, number, number];

export interface EtatListe {
  q: string;
  /** Le lieu écrit dans « Où ? » (lot 1 de la refonte) : du texte, jamais un identifiant de ville. */
  ou: string;
  choix: Record<Groupe, string[]>;
  rayonM: number | null;
  tri: Tri;
  vue: Vue;
  cadre: Cadre | null;
}

export const etatVide = (): EtatListe => ({
  q: '',
  ou: '',
  choix: Object.fromEntries(GROUPES.map((g) => [g, []])) as unknown as Record<Groupe, string[]>,
  rayonM: null,
  tri: 'recentes',
  vue: 'liste',
  cadre: null,
});

/** Les lettres des cycles, dans l'ordre des puces : celle de l'épingle sur la carte. */
export const CYCLES = ['M', 'P', 'C', 'L', 'T', 'S'] as const;
export const LIBELLES_DES_CYCLES: Record<string, string> = {
  M: 'Maternelle',
  P: 'Primaire',
  C: 'Collège',
  L: 'Lycée',
  T: 'Technique et pro',
  S: 'Supérieur',
};

const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/**
 * Lit l'adresse. Les anciennes formes restent comprises : `?zone=congo/pointe-noire/ngoyo` (pages de lieu, carte v1),
 * `?niveau=primaire` (pages de formation du 08/11), `?autour=3` (Autour de moi) et `?cycle=P`.
 */
export function lireEtat(params: URLSearchParams): EtatListe {
  const etat = etatVide();
  etat.q = (params.get('q') ?? '').trim();
  etat.ou = (params.get('ou') ?? '').trim();
  const tous = (cle: string) =>
    params
      .getAll(cle)
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean);
  for (const g of GROUPES) etat.choix[g] = unique(tous(g));
  // Les niveaux : la lettre du cycle, ou le nom d'un niveau (`primaire`), ou `cycle=P`.
  etat.choix.niveau = unique(
    [...etat.choix.niveau, ...tous('cycle')].flatMap((v) => {
      const lettre = v.toUpperCase();
      if ((CYCLES as readonly string[]).includes(lettre)) return [lettre];
      if ((listes.niveau as readonly string[]).includes(v))
        return [...lettresDesCycles([v as Valeur<'niveau'>])];
      return [];
    }),
  );
  const zone = params.get('zone');
  if (zone) {
    const [, ville, arrondissement] = zone.split('/');
    if (ville && !etat.choix.ville.includes(ville)) etat.choix.ville.push(ville);
    if (arrondissement && !etat.choix.arrondissement.includes(arrondissement))
      etat.choix.arrondissement.push(arrondissement);
  }
  const autour = params.get('autour');
  const rayon =
    params.get('rayon') !== null
      ? Number(params.get('rayon'))
      : autour !== null
        ? Number(autour) * 1000
        : NaN;
  etat.rayonM = (RAYONS_M as readonly number[]).includes(rayon) ? rayon : null;
  const tri = params.get('tri');
  etat.tri = tri === 'proches' || tri === 'nom' ? tri : 'recentes';
  etat.vue = params.get('vue') === 'carte' ? 'carte' : 'liste';
  const cadre = (params.get('cadre') ?? '').split(',').map(Number);
  etat.cadre =
    cadre.length === 4 && cadre.every(Number.isFinite)
      ? (cadre as unknown as readonly [number, number, number, number])
      : null;
  return etat;
}

/** L'adresse de l'état : seulement ce qui n'est pas la valeur par défaut, dans un ordre stable. */
export function ecrireEtat(etat: EtatListe): string {
  const p = new URLSearchParams();
  if (etat.q) p.set('q', etat.q);
  if (etat.ou) p.set('ou', etat.ou);
  for (const g of GROUPES) if (etat.choix[g].length > 0) p.set(g, etat.choix[g].join(','));
  if (etat.rayonM !== null) p.set('rayon', String(etat.rayonM));
  if (etat.tri !== 'recentes') p.set('tri', etat.tri);
  if (etat.cadre) p.set('cadre', etat.cadre.map((x) => x.toFixed(4)).join(','));
  if (etat.vue === 'carte') p.set('vue', 'carte');
  const texte = p.toString();
  return texte ? `?${texte}` : '';
}

/** Combien de filtres sont choisis (le nombre du bouton « Filtres »), recherche et tri exclus. */
export const nombreDeFiltres = (etat: EtatListe): number =>
  GROUPES.reduce((n, g) => n + etat.choix[g].length, 0) +
  (etat.rayonM !== null ? 1 : 0) +
  (etat.cadre ? 1 : 0);

// Ce qu'une école offre à chaque groupe ---------------------------------------------------------------------------------

/** Les tranches de frais (FCFA par mois), sur les frais qui ont le OUI daté de l'école seulement. */
export const TRANCHES_DE_FRAIS = [
  { valeur: '0-15000', libelle: 'Moins de 15 000 FCFA', min: 0, max: 15000 },
  { valeur: '15000-30000', libelle: '15 000 à 30 000 FCFA', min: 15000, max: 30000 },
  { valeur: '30000-60000', libelle: '30 000 à 60 000 FCFA', min: 30000, max: 60000 },
  { valeur: '60000-', libelle: '60 000 FCFA et plus', min: 60000, max: Infinity },
] as const;

const segments = (l: LigneRecherche) => l.z.split('/');
const nomsDe = (l: LigneRecherche) => l.d.split(' › ');

/** Les valeurs qu'une école donne à un groupe (hors formation : les critères de formation se lisent par formation). */
function valeursDe(l: LigneRecherche, g: Groupe): string[] {
  switch (g) {
    case 'ville':
      return segments(l)[1] ? [segments(l)[1]!] : [];
    case 'arrondissement':
      return segments(l)[2] ? [segments(l)[2]!] : [];
    case 'niveau':
      return [...lettresDesCycles(l.c)];
    case 'type':
      return l.k ? [l.k] : [];
    case 'serie':
      return unique(l.f.flatMap((f) => (f.s ? [f.s] : [])));
    case 'diplome':
      return unique(l.f.flatMap((f) => (f.d ? [f.d] : [])));
    case 'domaine':
      return unique(l.f.flatMap((f) => (f.m ? [f.m] : [])));
    case 'rythme':
      return unique(l.f.flatMap((f) => f.y ?? []));
    case 'equipement':
      return l.eq ?? [];
    case 'frais':
      return l.fm === undefined
        ? []
        : TRANCHES_DE_FRAIS.filter((t) => l.fm! >= t.min && l.fm! < t.max).map((t) => t.valeur);
  }
}

const GROUPES_DE_FORMATION: readonly Groupe[] = ['serie', 'diplome', 'domaine', 'rythme'];

/** Une formation répond-elle aux choix de formation (chaque groupe choisi : l'une de ses valeurs) ? */
function formationCorrespond(
  f: LigneRecherche['f'][number],
  choix: Record<Groupe, string[]>,
): boolean {
  const ok = (g: Groupe, valeurs: string[]) =>
    choix[g].length === 0 || choix[g].some((v) => valeurs.includes(v));
  return (
    ok('serie', f.s ? [f.s] : []) &&
    ok('diplome', f.d ? [f.d] : []) &&
    ok('domaine', f.m ? [f.m] : []) &&
    ok('rythme', f.y ?? [])
  );
}

/** L'école répond-elle à tous les choix, sauf ceux du groupe `sauf` (pour compter ses options) ? */
function repond(l: LigneRecherche, choix: Record<Groupe, string[]>, sauf?: Groupe): boolean {
  for (const g of GROUPES) {
    if (g === sauf || choix[g].length === 0 || GROUPES_DE_FORMATION.includes(g)) continue;
    const siennes = valeursDe(l, g);
    if (!choix[g].some((v) => siennes.includes(v))) return false;
  }
  const formation = GROUPES_DE_FORMATION.some((g) => g !== sauf && choix[g].length > 0);
  if (formation) {
    const sansLeGroupe = sauf ? { ...choix, [sauf]: [] } : choix;
    if (!l.f.some((f) => formationCorrespond(f, sansLeGroupe))) return false;
  }
  return true;
}

function correspondTexte(l: LigneRecherche, mots: string[]): boolean {
  if (mots.length === 0) return true;
  const motsDeLEcole = normaliser(
    [l.n, l.e, l.si, l.d, l.a, l.q, l.r, ...l.f.map((f) => f.t)].filter(Boolean).join(' '),
  ).split(' ');
  return mots.every((m) => motsDeLEcole.some((mot) => mot.startsWith(m)));
}

/**
 * « Où ? » : chaque mot du lieu écrit est le début d'un mot d'un lieu documenté de l'école (ses divisions, leurs autres
 * écritures, le quartier dit sur place). Le repère et le nom n'y entrent pas : « Marché » n'est pas un lieu.
 */
export function correspondLieu(l: LigneRecherche, mots: readonly string[]): boolean {
  if (mots.length === 0) return true;
  const motsDuLieu = normaliser([l.d, l.a, l.q].filter(Boolean).join(' ')).split(' ');
  return mots.every((m) => motsDuLieu.some((mot) => mot.startsWith(m)));
}

const dansLeCadre = (l: LigneRecherche, c: Cadre) =>
  l.la !== undefined &&
  l.lo !== undefined &&
  l.lo >= c[0] &&
  l.la >= c[1] &&
  l.lo <= c[2] &&
  l.la <= c[3];

export interface Trouvee {
  ligne: LigneRecherche;
  /** En mètres, quand la position est donnée et l'école située. */
  distance: number | null;
}

/**
 * Les écoles qui répondent à tout : la recherche (chaque mot est le début d'un mot de l'école), les filtres, le rayon
 * autour de la position, la zone de la carte. Hors du groupe `sauf`, pour compter.
 */
function retenir(
  lignes: readonly LigneRecherche[],
  etat: EtatListe,
  pres: Point | null,
  sauf?: Groupe | 'rayon',
): Trouvee[] {
  const mots = normaliser(etat.q).split(' ').filter(Boolean);
  const motsDuLieu = normaliser(etat.ou).split(' ').filter(Boolean);
  const choix = etat.choix;
  const out: Trouvee[] = [];
  for (const l of lignes) {
    if (!correspondTexte(l, mots)) continue;
    if (!correspondLieu(l, motsDuLieu)) continue;
    if (!repond(l, choix, sauf === 'rayon' ? undefined : sauf)) continue;
    if (etat.cadre && !dansLeCadre(l, etat.cadre)) continue;
    let distance: number | null = null;
    if (pres && l.la !== undefined && l.lo !== undefined)
      distance = distanceMetres(pres, { latitude: l.la, longitude: l.lo });
    if (sauf !== 'rayon' && etat.rayonM !== null && pres) {
      if (distance === null || distance > etat.rayonM) continue;
    }
    out.push({ ligne: l, distance });
  }
  return out;
}

const collateur = new Intl.Collator('fr', { sensitivity: 'base' });

/**
 * Le tri. « Récemment vues » (par défaut) : les écoles vues sur place avant celles ajoutées par NTanova, puis la preuve la
 * plus récente d'abord. « Près de moi » : la plus proche d'abord, quand la position est donnée. « Par nom ».
 */
export function trier(trouvees: Trouvee[], tri: Tri): Trouvee[] {
  const vue = (t: Trouvee) => (t.ligne.v || t.ligne.o || t.ligne.g ? 0 : 1);
  const parNom = (a: Trouvee, b: Trouvee) =>
    collateur.compare(a.ligne.n, b.ligne.n) || collateur.compare(a.ligne.e ?? '', b.ligne.e ?? '');
  return [...trouvees].sort((a, b) => {
    if (tri === 'nom') return parNom(a, b);
    if (tri === 'proches' && (a.distance !== null || b.distance !== null)) {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      if (a.distance !== b.distance) return a.distance - b.distance;
    }
    return vue(a) - vue(b) || (b.ligne.t ?? '').localeCompare(a.ligne.t ?? '') || parNom(a, b);
  });
}

/** La liste : filtrée, triée. Sans position, « Près de moi » retombe sur « Récemment vues ». */
export function filtrer(
  lignes: readonly LigneRecherche[],
  etat: EtatListe,
  pres: Point | null = null,
): Trouvee[] {
  return trier(
    retenir(lignes, etat, pres),
    etat.tri === 'proches' && !pres ? 'recentes' : etat.tri,
  );
}

// Les options et leurs compteurs ------------------------------------------------------------------------------------

export interface Option {
  valeur: string;
  libelle: string;
  /** Combien d'écoles on verrait en ajoutant ce choix aux autres groupes. */
  nombre: number;
  choisie: boolean;
}

export interface GroupeAffiche {
  groupe: Groupe;
  titre: string;
  options: Option[];
}

/** Les mots d'une valeur : le nom de la ville ou de l'arrondissement vient des noms de la fiche. */
function libelleDe(
  g: Groupe,
  v: string,
  lignes: readonly LigneRecherche[],
  domaines: ReadonlyMap<string, string>,
): string {
  switch (g) {
    case 'ville':
    case 'arrondissement': {
      const rang = g === 'ville' ? 1 : 2;
      const l = lignes.find((x) => segments(x)[rang] === v);
      return (l && nomsDe(l)[rang]) ?? v;
    }
    case 'niveau':
      return LIBELLES_DES_CYCLES[v] ?? v;
    case 'type':
      return libelleTypeEcole[v as Valeur<'type_ecole'>] ?? v;
    case 'serie':
      return libelleSerie[v as Valeur<'bac_track'>] ?? v;
    case 'diplome':
      return libelleDiplome[v as Valeur<'diploma_kind'>] ?? v;
    case 'domaine':
      return domaines.get(v) ?? v;
    case 'rythme':
      return libelleRythme[v as Valeur<'study_rhythm'>] ?? v;
    case 'equipement':
      return LIBELLES_EQUIPEMENTS[v] ?? v;
    case 'frais':
      return TRANCHES_DE_FRAIS.find((t) => t.valeur === v)?.libelle ?? v;
  }
}

/** Les équipements filtrables : tous ceux de la liste fermée, sauf « autre » (sa précision est libre), dans son ordre. */
export const LIBELLES_EQUIPEMENTS: Record<string, string> = Object.fromEntries(
  listes.equipment_key.filter((k) => k !== 'autre').map((k) => [k, libelleEquipement[k]]),
);

/** L'ordre des valeurs : celui des listes fermées, sinon les plus nombreuses d'abord, puis l'alphabet. */
function ordreDe(g: Groupe): readonly string[] | null {
  switch (g) {
    case 'niveau':
      return CYCLES;
    case 'type':
      return listes.type_ecole;
    case 'serie':
      return listes.bac_track;
    case 'diplome':
      return listes.diploma_kind;
    case 'rythme':
      return listes.study_rhythm;
    case 'equipement':
      return Object.keys(LIBELLES_EQUIPEMENTS);
    case 'frais':
      return TRANCHES_DE_FRAIS.map((t) => t.valeur);
    default:
      return null;
  }
}

/**
 * Les groupes à montrer, chacun avec ses options comptées. Un groupe disparaît quand il ne trie rien : moins de deux
 * options à plus de 0 et aucune cochée. L'arrondissement n'a de sens qu'une ville choisie.
 */
export function groupesAffiches(
  lignes: readonly LigneRecherche[],
  etat: EtatListe,
  pres: Point | null = null,
  domaines: ReadonlyMap<string, string> = new Map(),
): GroupeAffiche[] {
  const out: GroupeAffiche[] = [];
  for (const g of GROUPES) {
    if (g === 'arrondissement' && etat.choix.ville.length !== 1) continue;
    const base = retenir(lignes, etat, pres, g);
    const comptes = new Map<string, number>();
    for (const { ligne } of base) {
      const vals = GROUPES_DE_FORMATION.includes(g)
        ? unique(
            ligne.f
              .filter((f) => formationCorrespond(f, { ...etat.choix, [g]: [] }))
              .flatMap((f) =>
                g === 'serie'
                  ? f.s
                    ? [f.s]
                    : []
                  : g === 'diplome'
                    ? f.d
                      ? [f.d]
                      : []
                    : g === 'domaine'
                      ? f.m
                        ? [f.m]
                        : []
                      : (f.y ?? []),
              ),
          )
        : valeursDe(ligne, g);
      for (const v of vals) comptes.set(v, (comptes.get(v) ?? 0) + 1);
    }
    // L'arrondissement suit la ville choisie.
    if (g === 'arrondissement') {
      const ville = etat.choix.ville[0];
      for (const v of [...comptes.keys()])
        if (!lignes.some((l) => segments(l)[1] === ville && segments(l)[2] === v))
          comptes.delete(v);
    }
    const valeurs = unique([...comptes.keys(), ...etat.choix[g]]);
    const ordre = ordreDe(g);
    valeurs.sort((a, b) =>
      ordre
        ? ordre.indexOf(a) - ordre.indexOf(b)
        : (comptes.get(b) ?? 0) - (comptes.get(a) ?? 0) ||
          collateur.compare(libelleDe(g, a, lignes, domaines), libelleDe(g, b, lignes, domaines)),
    );
    const options = valeurs
      .map((v) => ({
        valeur: v,
        libelle: libelleDe(g, v, lignes, domaines),
        nombre: comptes.get(v) ?? 0,
        choisie: etat.choix[g].includes(v),
      }))
      .filter((o) => o.nombre > 0 || o.choisie);
    const utiles = options.filter((o) => o.nombre > 0).length;
    if (options.some((o) => o.choisie) || utiles >= 2)
      out.push({ groupe: g, titre: TITRES_DES_GROUPES[g], options });
  }
  return out;
}

/** Les rayons d'« Autour de moi » comptés, quand la position est donnée. */
export function rayonsComptes(
  lignes: readonly LigneRecherche[],
  etat: EtatListe,
  pres: Point,
): { rayonM: number; nombre: number; choisi: boolean }[] {
  const base = retenir(lignes, etat, pres, 'rayon');
  return RAYONS_M.map((r) => ({
    rayonM: r,
    nombre: base.filter((t) => t.distance !== null && t.distance <= r).length,
    choisi: etat.rayonM === r,
  }));
}

// Les mots de la page ---------------------------------------------------------------------------------------------------

const PLURIELS: Record<string, string> = {
  M: 'Maternelles',
  P: 'Écoles primaires',
  C: 'Collèges',
  L: 'Lycées',
  T: 'Écoles techniques et professionnelles',
  S: 'Établissements du supérieur',
};

/** Le titre dit ce qu'on a cherché : « Écoles primaires à Pointe-Noire », « Lycées et supérieur à Loandjili ». */
export function titreDeLaListe(etat: EtatListe, lignes: readonly LigneRecherche[]): string {
  const n = etat.choix.niveau;
  let quoi = 'Les écoles';
  if (n.length === 1) quoi = PLURIELS[n[0]!] ?? quoi;
  else if (n.length === 2 && n.includes('L') && n.includes('S')) quoi = 'Lycées et supérieur';
  const lieu =
    etat.choix.arrondissement.length === 1
      ? libelleDe('arrondissement', etat.choix.arrondissement[0]!, lignes, new Map())
      : etat.choix.ville.length === 1
        ? libelleDe('ville', etat.choix.ville[0]!, lignes, new Map())
        : null;
  return lieu ? `${quoi} à ${lieu}` : quoi === 'Les écoles' ? quoi : quoi;
}

/** « 22 écoles », « 1 école », « Aucune école ». */
export const compterLesEcoles = (n: number): string =>
  n === 0 ? 'Aucune école' : n === 1 ? '1 école' : `${n.toLocaleString('fr-FR')} écoles`;

/**
 * Les sorties d'un résultat vide : retirer un choix, chacune avec ce qu'elle débloque, la plus utile d'abord (planche
 * « 0 résultat »). Le texte cherché compte comme un choix.
 */
export function sortiesDuVide(
  lignes: readonly LigneRecherche[],
  etat: EtatListe,
  pres: Point | null,
  domaines: ReadonlyMap<string, string> = new Map(),
): { libelle: string; etat: EtatListe; nombre: number }[] {
  const sorties: { libelle: string; etat: EtatListe; nombre: number }[] = [];
  const essayer = (libelle: string, suivant: EtatListe) => {
    const nombre = filtrer(lignes, suivant, pres).length;
    if (nombre > 0) sorties.push({ libelle, etat: suivant, nombre });
  };
  if (etat.q) essayer(`Retirer « ${etat.q} »`, { ...etat, q: '' });
  if (etat.ou) essayer(`Retirer le lieu « ${etat.ou} »`, { ...etat, ou: '' });
  for (const g of GROUPES)
    for (const v of etat.choix[g])
      essayer(`Retirer ${libelleDe(g, v, lignes, domaines)}`, {
        ...etat,
        choix: { ...etat.choix, [g]: etat.choix[g].filter((x) => x !== v) },
      });
  if (etat.rayonM !== null) essayer('Retirer le rayon', { ...etat, rayonM: null });
  if (etat.cadre) essayer('Retirer la zone de la carte', { ...etat, cadre: null });
  return sorties.sort((a, b) => b.nombre - a.nombre).slice(0, 3);
}
