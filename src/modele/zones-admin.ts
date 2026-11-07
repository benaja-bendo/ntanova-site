/**
 * L'onglet Zones de l'administration : comment on range les zones pour s'y retrouver (audit du 06/11/2026 : 48 lignes, 39
 * sans école, trois sens pour « relevé »). Pur : ni React, ni base.
 *
 * Trois réglages, trois noms, qui ne se mélangent jamais :
 * - « Sur la carte » : ce que les familles lisent (`deploiement` : relevé en cours, déploiement programmé, rien) ;
 * - « Relais » : où NTanova envoie des relais (`ouverte`), qui n'interdit jamais à un relais de relever ailleurs ;
 * - « Origine des fiches » : relevées par un relais, ajoutées par l'administration, importées.
 */
import { libelleDeploiement, type EtatDeploiement } from './etat-zone';
import type { Valeur } from './listes';
import type { DivisionVue, LotVu } from './ports';

export type EtatCarte = EtatDeploiement | null;

/** Les trois états de la carte, dans l'ordre où une zone les traverse. */
export const ETATS_CARTE: readonly EtatCarte[] = [null, 'programme', 'actif'];

export const LIBELLE_PAS_ENCORE = 'Pas encore couverte';

export const libelleEtat = (etat: EtatCarte): string =>
  etat ? libelleDeploiement[etat] : LIBELLE_PAS_ENCORE;

/** Ce que la carte dit de chaque état, en une phrase pour l'administrateur. */
export const explicationEtat: Record<'aucun' | EtatDeploiement, string> = {
  aucun: 'La zone ne se dessine pas sur la carte. Les écoles publiées y restent visibles.',
  programme:
    'La carte trace la zone en tirets avec « Déploiement programmé » : les familles voient que ça arrive.',
  actif:
    'La carte trace la zone en vert avec « Relevé en cours » : les familles voient que des relais y travaillent.',
};

/** Les zones que la carte du site dessine ou pointe : une ville, une commune, un district, un arrondissement. */
const GENRES_SUR_LA_CARTE: readonly Valeur<'geo_kind'>[] = [
  'city',
  'commune',
  'district',
  'arrondissement',
];

export const surLaCarte = (zone: Pick<DivisionVue, 'genre'>): boolean =>
  GENRES_SUR_LA_CARTE.includes(zone.genre);

/** Un geste qui touche au moins ce nombre d'autres zones demande une confirmation. */
export const SEUIL_OUVERTURE_LARGE = 5;

/** Les zones contenues dans une zone, à tous les niveaux (jamais elle-même). */
export function zonesDessous(zone: DivisionVue, toutes: readonly DivisionVue[]): DivisionVue[] {
  const prefixe = `${zone.chemin}.`;
  return toutes.filter((x) => x.chemin.startsWith(prefixe));
}

/**
 * Ce que les familles lisent d'une zone qui n'a pas d'état à elle : celui de ce qu'elle contient, comme la page publique
 * (`etatPublicDe`). Une ville « pas encore couverte » dont un arrondissement est « relevé en cours » le dit donc aussi.
 */
export function etatHerite(
  zone: DivisionVue,
  toutes: readonly DivisionVue[],
): EtatDeploiement | null {
  if (zone.deploiement) return null;
  const dessous = zonesDessous(zone, toutes);
  if (dessous.some((x) => x.deploiement === 'actif')) return 'actif';
  if (dessous.some((x) => x.deploiement === 'programme')) return 'programme';
  return null;
}

/** Une zone qui compte : elle a des écoles, un état sur la carte, des relais, ou quelque chose de tel en dessous. */
function notable(zone: DivisionVue, toutes: readonly DivisionVue[]): boolean {
  if (zone.ecoles > 0 || zone.deploiement !== null || zone.ouverte) return true;
  return zonesDessous(zone, toutes).some(
    (x) => x.deploiement !== null || x.ouverte || x.ecoles > 0,
  );
}

export type LigneArbre =
  | {
      type: 'zone';
      zone: DivisionVue;
      indent: number;
      dansGroupe: boolean;
      /** Combien de zones elle contient, à tous les niveaux (0 : rien à déplier, ou zone d'un groupe ou d'une recherche). */
      dessous: number;
      /** Ses zones sont-elles montrées ? Sans objet quand `dessous` vaut 0. */
      deplie: boolean;
    }
  | { type: 'groupe'; id: string; indent: number; nombre: number; ouvert: boolean };

const normaliser = (texte: string): string =>
  texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Les lignes de l'arbre. Les zones qui comptent (écoles, état, relais) restent visibles ; les autres se replient sous leur
 * parent en une seule ligne « N autres zones ». Une zone `repliee` cache tout ce qu'elle contient. Une recherche remet à
 * plat les zones dont le nom, ou une autre écriture du nom, correspond. La zone choisie n'est jamais cachée dans un groupe
 * fermé.
 */
export function lignesDeLArbre(
  divisions: readonly DivisionVue[],
  options: {
    groupesOuverts?: ReadonlySet<string>;
    /** Les zones dont l'administration a replié le contenu. */
    repliees?: ReadonlySet<string>;
    choisie?: string | null;
    requete?: string;
  } = {},
): LigneArbre[] {
  const requete = normaliser(options.requete ?? '');
  if (requete !== '') {
    return divisions
      .filter(
        (d) =>
          normaliser(d.nom).includes(requete) ||
          d.aliases.some((alias) => normaliser(alias).includes(requete)),
      )
      .map((zone) => ({
        type: 'zone',
        zone,
        indent: 0,
        dansGroupe: true,
        dessous: 0,
        deplie: true,
      }));
  }

  const ids = new Set(divisions.map((d) => d.id));
  const enfants = new Map<string | null, DivisionVue[]>();
  for (const d of divisions) {
    const cle = d.parentId !== null && ids.has(d.parentId) ? d.parentId : null;
    enfants.set(cle, [...(enfants.get(cle) ?? []), d]);
  }

  const lignes: LigneArbre[] = [];
  const visiter = (zone: DivisionVue, indent: number): void => {
    const fils = enfants.get(zone.id) ?? [];
    const deplie = !(options.repliees?.has(zone.id) ?? false);
    lignes.push({
      type: 'zone',
      zone,
      indent,
      dansGroupe: false,
      dessous: fils.length === 0 ? 0 : zonesDessous(zone, divisions).length,
      deplie,
    });
    if (!deplie) return;
    const utiles = fils.filter((f) => notable(f, divisions));
    const autres = fils.filter((f) => !notable(f, divisions));
    for (const f of utiles) visiter(f, indent + 1);
    if (autres.length === 0) return;
    const membres = autres.flatMap((f) => [f, ...zonesDessous(f, divisions)]);
    const id = `groupe:${zone.id}`;
    const ouvert =
      (options.groupesOuverts?.has(id) ?? false) || membres.some((m) => m.id === options.choisie);
    lignes.push({ type: 'groupe', id, indent: indent + 1, nombre: membres.length, ouvert });
    if (ouvert) {
      for (const m of membres) {
        lignes.push({
          type: 'zone',
          zone: m,
          indent: indent + 1 + Math.max(1, m.niveau - zone.niveau),
          dansGroupe: true,
          dessous: 0,
          deplie: true,
        });
      }
    }
  };
  for (const racine of enfants.get(null) ?? []) visiter(racine, 0);
  return lignes;
}

/** Les groupes « N autres zones » que l'arbre montre quand rien n'est replié : de quoi « tout déplier ». */
export function groupesDeLArbre(divisions: readonly DivisionVue[]): string[] {
  return lignesDeLArbre(divisions).flatMap((l) => (l.type === 'groupe' ? [l.id] : []));
}

/**
 * « Tout replier » : le pays et ses départements, rien en dessous. Le pays reste ouvert, sinon il ne resterait qu'une
 * ligne.
 */
export function zonesAReplierPourTout(divisions: readonly DivisionVue[]): Set<string> {
  return new Set(
    divisions
      .filter((d) => d.niveau >= 1 && divisions.some((f) => f.parentId === d.id))
      .map((d) => d.id),
  );
}

/** Les zones au-dessus d'une zone, de la plus proche à la racine : celles à rouvrir pour la montrer. */
export function ancetresDe(zoneId: string, divisions: readonly DivisionVue[]): string[] {
  const parId = new Map(divisions.map((d) => [d.id, d]));
  const ids: string[] = [];
  for (
    let courante = parId.get(zoneId)?.parentId ?? null;
    courante !== null && !ids.includes(courante);
    courante = parId.get(courante)?.parentId ?? null
  ) {
    ids.push(courante);
  }
  return ids;
}

export interface EtapeDeLaCarte {
  etat: EtatCarte;
  /** Les zones à montrer d'emblée : leur nom, leurs écoles, leurs gestes. */
  zones: DivisionVue[];
  /** Les zones « pas encore couvertes » sans école et sans relais, repliées derrière « Voir les autres ». */
  autres: DivisionVue[];
}

/** Les zones de la carte rangées par étape : pas encore couverte, déploiement programmé, relevé en cours. */
export function etapesDeLaCarte(divisions: readonly DivisionVue[]): EtapeDeLaCarte[] {
  const sur = divisions.filter(surLaCarte);
  const tri = (a: DivisionVue, b: DivisionVue) =>
    b.ecoles - a.ecoles || a.nom.localeCompare(b.nom, 'fr');
  return ETATS_CARTE.map((etat) => {
    const zones = sur.filter((z) => z.deploiement === etat).sort(tri);
    if (etat !== null) return { etat, zones, autres: [] };
    const compte = (z: DivisionVue) => z.ecoles > 0 || z.ouverte;
    return { etat, zones: zones.filter(compte), autres: zones.filter((z) => !compte(z)) };
  });
}

/** Le nombre de zones, celles qui ont des écoles (les plus basses de la hiérarchie), celles que la carte suit. */
export function resumeDesZones(divisions: readonly DivisionVue[]): {
  total: number;
  avecEcoles: number;
  suivies: number;
} {
  const avecEcoles = divisions.filter(
    (d) => d.ecoles > 0 && !divisions.some((x) => x.parentId === d.id && x.ecoles > 0),
  ).length;
  const suivies = divisions.filter((d) => surLaCarte(d) && d.deploiement !== null).length;
  return { total: divisions.length, avecEcoles, suivies };
}

export function phraseDuResume(r: ReturnType<typeof resumeDesZones>): string {
  const zones = `${r.total} ${r.total > 1 ? 'zones' : 'zone'}`;
  const ecoles = `${r.avecEcoles} avec des écoles`;
  const suivies = `${r.suivies} ${r.suivies > 1 ? 'suivies' : 'suivie'} sur la carte`;
  return `${zones} · ${ecoles} · ${suivies}`;
}

/** D'où viennent les fiches d'une zone, en parts entières qui font toujours 100 (ou 0 quand il n'y en a pas). */
export function origineDesFiches(zone: Pick<DivisionVue, 'relevees' | 'ajoutees' | 'importees'>): {
  relevees: number;
  ajoutees: number;
  importees: number;
} {
  const nombres = [zone.relevees, zone.ajoutees, zone.importees];
  const total = nombres.reduce((a, b) => a + b, 0);
  if (total === 0) return { relevees: 0, ajoutees: 0, importees: 0 };
  const brut = nombres.map((n) => (100 * n) / total);
  const parts = brut.map(Math.floor);
  const reste = 100 - parts.reduce((a, b) => a + b, 0);
  const ordre = [0, 1, 2].sort(
    (a, b) => (brut[b] ?? 0) - (parts[b] ?? 0) - ((brut[a] ?? 0) - (parts[a] ?? 0)) || a - b,
  );
  for (let k = 0; k < reste; k++) parts[ordre[k] ?? 0] = (parts[ordre[k] ?? 0] ?? 0) + 1;
  return { relevees: parts[0] ?? 0, ajoutees: parts[1] ?? 0, importees: parts[2] ?? 0 };
}

/** « 10 écoles · 10 publiées », « 1 école · 0 publiée », « Aucune école ». */
export function phraseDesEcoles(zone: Pick<DivisionVue, 'ecoles' | 'publiees'>): string {
  if (zone.ecoles === 0) return 'Aucune école';
  const ecoles = `${zone.ecoles} ${zone.ecoles > 1 ? 'écoles' : 'école'}`;
  const publiees = `${zone.publiees} ${zone.publiees > 1 ? 'publiées' : 'publiée'}`;
  return `${ecoles} · ${publiees}`;
}

/** Les mêmes limites que `rename_division` dans la base : la base a le dernier mot. */
export const MAX_AUTRES_ECRITURES = 20;
export const LONGUEUR_MAX_ECRITURE = 80;
export const LONGUEUR_MAX_NOM = 120;

/**
 * Les autres écritures d'une zone (« Mvoumvou » pour « Mvou-Mvou ») saisies une par ligne : sans blanc autour, sans ligne
 * vide, sans doublon (les accents et les majuscules ne comptent pas) et sans le nom lui-même, dans l'ordre où elles sont
 * écrites. Comme `rename_division` le fait dans la base.
 */
export function nettoyerAutresEcritures(nom: string, saisie: string): string[] {
  const vues = new Set([normaliser(nom)]);
  const propres: string[] = [];
  for (const brute of saisie.split(/\r?\n/)) {
    const ecriture = brute.trim();
    const cle = normaliser(ecriture);
    if (ecriture === '' || vues.has(cle)) continue;
    vues.add(cle);
    propres.push(ecriture);
  }
  return propres;
}

/** Ce qui empêche, ou non, d'enregistrer ce nom et ces écritures ; rien quand tout va bien. */
export function problemeDeNom(nom: string, ecritures: readonly string[]): string | null {
  const propre = nom.trim();
  if (propre === '') return 'Le nom ne peut pas rester vide.';
  if (propre.length > LONGUEUR_MAX_NOM)
    return `Le nom fait ${LONGUEUR_MAX_NOM} caractères au plus.`;
  if (ecritures.length > MAX_AUTRES_ECRITURES) {
    return `${MAX_AUTRES_ECRITURES} autres écritures au plus.`;
  }
  if (ecritures.some((e) => e.length > LONGUEUR_MAX_ECRITURE)) {
    return `Une autre écriture fait ${LONGUEUR_MAX_ECRITURE} caractères au plus.`;
  }
  return null;
}

/** Une autre zone du même parent porte-t-elle déjà ce nom ? (accents et majuscules ne comptent pas) */
export function nomDejaPris(
  zone: Pick<DivisionVue, 'id' | 'parentId'>,
  nom: string,
  divisions: readonly DivisionVue[],
): DivisionVue | null {
  const cle = normaliser(nom);
  return (
    divisions.find(
      (d) => d.id !== zone.id && d.parentId === zone.parentId && normaliser(d.nom) === cle,
    ) ?? null
  );
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * Pourquoi une zone ne se supprime pas, d'après ce que l'écran sait : des phrases courtes, vides quand rien ne s'y oppose.
 * La base refuse aussi ce que l'écran ne voit pas (une école à la corbeille, un relevé de relais, un contour).
 */
export function raisonsDeNePasSupprimer(
  zone: DivisionVue,
  divisions: readonly DivisionVue[],
  lots: readonly LotVu[],
): string[] {
  if (zone.niveau === 0) return ['un pays ne se supprime pas'];
  const raisons: string[] = [];
  const sousZones = zonesDessous(zone, divisions).length;
  if (sousZones > 0) raisons.push(`elle contient ${pluriel(sousZones, 'zone', 'zones')}`);
  if (zone.ecoles > 0) raisons.push(`elle compte ${pluriel(zone.ecoles, 'école', 'écoles')}`);
  const sesLots = lots.filter((l) => l.divisionId === zone.id).length;
  if (sesLots > 0) raisons.push(`elle a ${pluriel(sesLots, 'lot', 'lots')}`);
  if (zone.deploiement !== null) {
    raisons.push('elle est sur la carte du site (retire-la d’abord : « Aucun »)');
  }
  if (zone.ouverte) raisons.push('elle est ouverte aux relais (ferme-la d’abord)');
  return raisons;
}
