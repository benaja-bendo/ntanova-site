// Allège un fond de carte PMTiles : retire de chaque tuile les couches que la carte ne dessine pas, puis réécrit l'archive
// (ticket 114, décision D6 du fondateur : « fond sobre, sans bâtiments, même au zoom 15 »).
//
//   node outils/fond-de-carte/alleger.ts <entree.pmtiles> <sortie.pmtiles>
//   node outils/fond-de-carte/alleger.ts --controler <archive.pmtiles>     (relit tout : tuiles lisibles, couches retirées absentes)
//
// Pourquoi dans le fichier et pas dans le style : MapLibre télécharge la tuile ENTIÈRE, que le style dessine toutes ses
// couches ou non. Les bâtiments font 57 à 85 % d'une tuile de centre-ville aux zooms 14 et 15, l'occupation du sol 63 à 82 %
// d'une tuile des zooms 6 à 8 : les retirer du style ne fait rien gagner, les retirer du fichier divise le poids (mesure du
// 03/11/2026, voir `analyse-2026-11-03/`).
//
// Ce que fait l'outil, sans rien décoder des géométries : il lit les couches au niveau du protobuf (une tuile MVT est une
// suite de couches, chacune avec son nom), recopie telles quelles les couches gardées, et réécrit une archive PMTiles v3 :
// tuiles dans l'ordre de leur identifiant, contenus identiques rangés une fois (la mer, ou deux tuiles qui ne différaient que
// par leurs bâtiments), répertoire racine dans les 16 premiers Ko, métadonnées mises à jour (`vector_layers`).
//
// L'archive écrite est relue dans les tests avec le lecteur officiel (`pmtiles`), et se contrôle avec la commande officielle :
// `pmtiles verify sortie.pmtiles`. Données © les contributeurs d'OpenStreetMap, licence ODbL : l'attribution reste dans les
// métadonnées et sous la carte.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import {
  bytesToHeader,
  Compression,
  TileType,
  tileIdToZxy,
  zxyToTileId,
  type Header,
} from 'pmtiles';

// --- Les règles du fond sobre ----------------------------------------------------------------------------------------------------

/** Des couches à retirer, à tous les zooms ou seulement jusqu'à `zoomMax` compris. */
export interface Regle {
  couches: readonly string[];
  zoomMax?: number;
}

/**
 * D6 : ni bâtiments ni commerces (`pois`) à aucun zoom, ni occupation du sol (`landuse`) aux petits zooms (jusqu'au zoom 10 :
 * l'archive du pays). Les routes, l'eau, la terre, les limites, les noms de lieux et la couverture naturelle restent.
 * Changer une règle, c'est changer une décision du fondateur : le dire, et mettre le test à jour.
 */
export const REGLES_SOBRES: readonly Regle[] = [
  { couches: ['buildings', 'pois'] },
  { couches: ['landuse'], zoomMax: 10 },
];

export function couchesARetirer(
  zoom: number,
  regles: readonly Regle[] = REGLES_SOBRES,
): Set<string> {
  const retirees = new Set<string>();
  for (const regle of regles) {
    if (regle.zoomMax === undefined || zoom <= regle.zoomMax)
      regle.couches.forEach((c) => retirees.add(c));
  }
  return retirees;
}

// --- Le protobuf d'une tuile (MVT) -----------------------------------------------------------------------------------------------

/** Un entier protobuf (varint) à partir de `pos` : sa valeur et la position qui suit. */
export function lireVarint(octets: Uint8Array, pos: number): [valeur: number, suite: number] {
  let valeur = 0;
  let decalage = 0;
  for (;;) {
    const octet = octets[pos++];
    if (octet === undefined) throw new Error('Tuile coupée au milieu d’un entier.');
    valeur += (octet & 0x7f) * 2 ** decalage;
    if (octet < 0x80) return [valeur, pos];
    decalage += 7;
    if (decalage > 49) throw new Error('Entier protobuf trop grand.');
  }
}

/** Les champs de premier niveau d'un message : numéro, type de fil, début et fin (octets de l'entête du champ compris). */
export function* champs(
  octets: Uint8Array,
): Generator<{ champ: number; type: number; debut: number; contenu: number; fin: number }> {
  let pos = 0;
  while (pos < octets.length) {
    const debut = pos;
    const [cle, apresCle] = lireVarint(octets, pos);
    const champ = Math.floor(cle / 8);
    const type = cle % 8;
    let contenu = apresCle;
    let fin: number;
    if (type === 0) fin = lireVarint(octets, apresCle)[1];
    else if (type === 1) fin = apresCle + 8;
    else if (type === 5) fin = apresCle + 4;
    else if (type === 2) {
      const [longueur, apresLongueur] = lireVarint(octets, apresCle);
      contenu = apresLongueur;
      fin = apresLongueur + longueur;
    } else throw new Error(`Type de champ protobuf inconnu : ${type}.`);
    if (fin > octets.length) throw new Error('Tuile coupée : un champ dépasse la fin.');
    yield { champ, type, debut, contenu, fin };
    pos = fin;
  }
}

/** Le nom d'une couche : son champ 1 (le texte). */
function nomDeLaCouche(couche: Uint8Array): string {
  for (const c of champs(couche)) {
    if (c.champ === 1 && c.type === 2)
      return new TextDecoder().decode(couche.subarray(c.contenu, c.fin));
  }
  throw new Error('Une couche de la tuile n’a pas de nom.');
}

/** Les noms des couches d'une tuile (MVT non compressé), dans l'ordre. */
export function nomsDesCouches(mvt: Uint8Array): string[] {
  const noms: string[] = [];
  for (const c of champs(mvt)) {
    if (c.champ === 3 && c.type === 2) noms.push(nomDeLaCouche(mvt.subarray(c.contenu, c.fin)));
  }
  return noms;
}

/**
 * La tuile sans les couches nommées. Les autres champs sont recopiés tels quels, octet pour octet (une version, un ajout
 * futur de la spécification) : l'outil n'invente rien. Une tuile sans plus aucune couche est une tuile vide, valide.
 */
export function retirerCouches(mvt: Uint8Array, aRetirer: ReadonlySet<string>): Uint8Array {
  const gardes: Uint8Array[] = [];
  let retire = false;
  for (const c of champs(mvt)) {
    if (
      c.champ === 3 &&
      c.type === 2 &&
      aRetirer.has(nomDeLaCouche(mvt.subarray(c.contenu, c.fin)))
    ) {
      retire = true;
      continue;
    }
    gardes.push(mvt.subarray(c.debut, c.fin));
  }
  if (!retire) return mvt;
  return concatener(gardes);
}

function concatener(morceaux: readonly Uint8Array[]): Uint8Array {
  const sortie = new Uint8Array(morceaux.reduce((s, m) => s + m.length, 0));
  let pos = 0;
  for (const m of morceaux) {
    sortie.set(m, pos);
    pos += m.length;
  }
  return sortie;
}

// --- Les répertoires d'une archive PMTiles v3 --------------------------------------------------------------------------------------

interface Entree {
  tileId: number;
  /** Depuis le début des données de tuiles. */
  offset: number;
  length: number;
  /** 0 : l'entrée pointe vers un répertoire de feuilles ; sinon, le nombre de tuiles consécutives qui ont ce contenu. */
  runLength: number;
}

const TAILLE_ENTETE = 127;
/** La racine doit tenir, avec l'en-tête, dans la première requête de 16 Ko d'un lecteur. */
const TAILLE_RACINE_MAX = 16_384 - TAILLE_ENTETE;

function ecrireVarint(sortie: number[], n: number): void {
  while (n >= 128) {
    sortie.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  sortie.push(n);
}

/** Un répertoire, avant compression : le nombre d'entrées, puis, colonne par colonne, les identifiants (en écarts), les longueurs de série, les longueurs, les décalages. */
function serialiserRepertoire(entrees: readonly Entree[]): Uint8Array {
  const sortie: number[] = [];
  ecrireVarint(sortie, entrees.length);
  let dernier = 0;
  for (const e of entrees) {
    ecrireVarint(sortie, e.tileId - dernier);
    dernier = e.tileId;
  }
  for (const e of entrees) ecrireVarint(sortie, e.runLength);
  for (const e of entrees) ecrireVarint(sortie, e.length);
  entrees.forEach((e, i) => {
    const avant = entrees[i - 1];
    // Un contenu qui suit immédiatement le précédent s'écrit 0 ; sinon, son décalage plus un.
    ecrireVarint(
      sortie,
      i > 0 && avant && e.offset === avant.offset + avant.length ? 0 : e.offset + 1,
    );
  });
  return Uint8Array.from(sortie);
}

function lireRepertoire(compresse: Uint8Array, compression: Compression): Entree[] {
  const brut = compression === Compression.Gzip ? new Uint8Array(gunzipSync(compresse)) : compresse;
  const [n, debut] = lireVarint(brut, 0);
  let pos = debut;
  const entrees: Entree[] = Array.from({ length: n }, () => ({
    tileId: 0,
    offset: 0,
    length: 0,
    runLength: 0,
  }));
  let dernier = 0;
  for (const e of entrees) {
    let ecart: number;
    [ecart, pos] = lireVarint(brut, pos);
    dernier += ecart;
    e.tileId = dernier;
  }
  for (const e of entrees) [e.runLength, pos] = lireVarint(brut, pos);
  for (const e of entrees) [e.length, pos] = lireVarint(brut, pos);
  entrees.forEach((e, i) => {
    let v: number;
    [v, pos] = lireVarint(brut, pos);
    const avant = entrees[i - 1];
    e.offset = v === 0 && i > 0 && avant ? avant.offset + avant.length : v - 1;
  });
  return entrees;
}

/** La racine, et les feuilles si la racine ne tient pas dans 16 Ko (comme la commande officielle : des feuilles de 4 096 entrées au moins). */
function construireRepertoires(entrees: readonly Entree[]): {
  racine: Uint8Array;
  feuilles: Uint8Array;
} {
  const racineSeule = new Uint8Array(gzipSync(serialiserRepertoire(entrees), { level: 9 }));
  if (racineSeule.length <= TAILLE_RACINE_MAX)
    return { racine: racineSeule, feuilles: new Uint8Array() };
  for (let taille = Math.max(4096, Math.ceil(entrees.length / 3500)); ; taille *= 2) {
    const feuilles: Uint8Array[] = [];
    const pointeurs: Entree[] = [];
    let decalage = 0;
    for (let debut = 0; debut < entrees.length; debut += taille) {
      const morceau = entrees.slice(debut, debut + taille);
      const compresse = new Uint8Array(gzipSync(serialiserRepertoire(morceau), { level: 9 }));
      pointeurs.push({
        tileId: morceau[0]!.tileId,
        offset: decalage,
        length: compresse.length,
        runLength: 0,
      });
      feuilles.push(compresse);
      decalage += compresse.length;
    }
    const racine = new Uint8Array(gzipSync(serialiserRepertoire(pointeurs), { level: 9 }));
    if (racine.length <= TAILLE_RACINE_MAX || taille > entrees.length) {
      return { racine, feuilles: concatener(feuilles) };
    }
  }
}

// --- Écrire une archive ------------------------------------------------------------------------------------------------------------

/** Une tuile telle qu'elle est stockée : ses octets sont déjà compressés comme le dit `compressionTuiles`. */
export interface TuileStockee {
  z: number;
  x: number;
  y: number;
  octets: Uint8Array;
}

export interface OptionsArchive {
  metadonnees: Record<string, unknown>;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centreZoom: number;
  centreLon: number;
  centreLat: number;
  /** 1 : tuiles non compressées ; 2 : gzip. */
  compressionTuiles: 1 | 2;
}

export function ecrireArchive(
  tuiles: readonly TuileStockee[],
  options: OptionsArchive,
): Uint8Array {
  const triees = tuiles
    .map((t) => ({ ...t, id: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.id - b.id);
  const entrees: Entree[] = [];
  const morceaux: Uint8Array[] = [];
  const vus = new Map<string, { offset: number; length: number }>();
  let decalage = 0;
  for (const [i, t] of triees.entries()) {
    if (i > 0 && triees[i - 1]!.id === t.id)
      throw new Error(`La tuile ${t.z}/${t.x}/${t.y} est donnée deux fois.`);
    const empreinte = createHash('sha1').update(t.octets).digest('hex');
    let contenu = vus.get(empreinte);
    if (!contenu) {
      contenu = { offset: decalage, length: t.octets.length };
      vus.set(empreinte, contenu);
      morceaux.push(t.octets);
      decalage += t.octets.length;
    }
    const derniere = entrees.at(-1);
    if (
      derniere &&
      derniere.offset === contenu.offset &&
      derniere.length === contenu.length &&
      derniere.tileId + derniere.runLength === t.id
    ) {
      derniere.runLength++;
    } else {
      entrees.push({ tileId: t.id, offset: contenu.offset, length: contenu.length, runLength: 1 });
    }
  }
  const donnees = concatener(morceaux);
  const { racine, feuilles } = construireRepertoires(entrees);
  const metadonnees = new Uint8Array(gzipSync(JSON.stringify(options.metadonnees), { level: 9 }));
  const zooms = triees.map((t) => t.z);

  const entete = new DataView(new ArrayBuffer(TAILLE_ENTETE));
  [...'PMTiles'].forEach((c, i) => entete.setUint8(i, c.charCodeAt(0)));
  entete.setUint8(7, 3);
  const u64 = (pos: number, valeur: number) => entete.setBigUint64(pos, BigInt(valeur), true);
  const racineDebut = TAILLE_ENTETE;
  const metaDebut = racineDebut + racine.length;
  const feuillesDebut = metaDebut + metadonnees.length;
  const donneesDebut = feuillesDebut + feuilles.length;
  u64(8, racineDebut);
  u64(16, racine.length);
  u64(24, metaDebut);
  u64(32, metadonnees.length);
  u64(40, feuillesDebut);
  u64(48, feuilles.length);
  u64(56, donneesDebut);
  u64(64, donnees.length);
  u64(72, triees.length);
  u64(80, entrees.length);
  u64(88, vus.size);
  entete.setUint8(96, 1); // clustered
  entete.setUint8(97, Compression.Gzip); // répertoires et métadonnées
  entete.setUint8(98, options.compressionTuiles);
  entete.setUint8(99, TileType.Mvt);
  entete.setUint8(100, zooms.length ? Math.min(...zooms) : 0);
  entete.setUint8(101, zooms.length ? Math.max(...zooms) : 0);
  const e7 = (pos: number, degres: number) => entete.setInt32(pos, Math.round(degres * 1e7), true);
  e7(102, options.minLon);
  e7(106, options.minLat);
  e7(110, options.maxLon);
  e7(114, options.maxLat);
  entete.setUint8(118, options.centreZoom);
  e7(119, options.centreLon);
  e7(123, options.centreLat);

  return concatener([new Uint8Array(entete.buffer), racine, metadonnees, feuilles, donnees]);
}

// --- Lire une archive ---------------------------------------------------------------------------------------------------------------

export interface TuileLue {
  z: number;
  x: number;
  y: number;
  /** Les octets stockés (compressés comme le dit l'en-tête). */
  octets: Uint8Array;
  /** Où ils sont dans les données de tuiles : deux tuiles au même décalage ont le même contenu. */
  decalage: number;
}

export interface ArchiveLue {
  entete: Header;
  metadonnees: Record<string, unknown>;
  tuiles: () => Generator<TuileLue>;
}

export function lireArchive(octets: Uint8Array): ArchiveLue {
  const entete = bytesToHeader(
    octets.buffer.slice(octets.byteOffset, octets.byteOffset + TAILLE_ENTETE) as ArrayBuffer,
  );
  const sousTableau = (debut: number, longueur: number) => octets.subarray(debut, debut + longueur);
  const interne = entete.internalCompression;
  const metaBrute = sousTableau(entete.jsonMetadataOffset, entete.jsonMetadataLength);
  const metadonnees = JSON.parse(
    new TextDecoder().decode(interne === Compression.Gzip ? gunzipSync(metaBrute) : metaBrute),
  ) as Record<string, unknown>;

  function* entrees(debut: number, longueur: number, profondeur = 0): Generator<Entree> {
    if (profondeur > 3) throw new Error('Répertoires de feuilles trop profonds.');
    for (const e of lireRepertoire(sousTableau(debut, longueur), interne)) {
      if (e.runLength === 0)
        yield* entrees(entete.leafDirectoryOffset + e.offset, e.length, profondeur + 1);
      else yield e;
    }
  }

  function* tuiles(): Generator<TuileLue> {
    for (const e of entrees(entete.rootDirectoryOffset, entete.rootDirectoryLength)) {
      const contenu = sousTableau(entete.tileDataOffset + e.offset, e.length);
      for (let i = 0; i < e.runLength; i++) {
        const [z, x, y] = tileIdToZxy(e.tileId + i);
        yield { z, x, y, octets: contenu, decalage: e.offset };
      }
    }
  }
  return { entete, metadonnees, tuiles };
}

// --- Alléger ------------------------------------------------------------------------------------------------------------------------

interface LigneZoom {
  zoom: number;
  /** Les tuiles adressées à ce zoom. */
  tuiles: number;
  /** Les octets des contenus DISTINCTS à ce zoom (une tuile partagée n'est comptée qu'une fois). */
  octetsAvant: number;
  octetsApres: number;
}

export interface Bilan {
  tuilesAvant: number;
  tuilesApres: number;
  contenusAvant: number;
  contenusApres: number;
  /** La longueur des données de tuiles, sans les répertoires. */
  octetsAvant: number;
  octetsApres: number;
  fichierAvant: number;
  fichierApres: number;
  parZoom: LigneZoom[];
}

/** Les métadonnées de l'archive allégée : les couches retirées ne sont plus déclarées ; celles retirées aux petits zooms commencent plus haut. */
export function metadonneesAllegees(
  meta: Record<string, unknown>,
  regles: readonly Regle[] = REGLES_SOBRES,
): Record<string, unknown> {
  type Couche = { id: string; minzoom?: number; maxzoom?: number };
  const couches = Array.isArray(meta.vector_layers) ? (meta.vector_layers as Couche[]) : [];
  const partout = new Set(regles.filter((r) => r.zoomMax === undefined).flatMap((r) => r.couches));
  const jusqua = new Map<string, number>();
  for (const r of regles) {
    if (r.zoomMax === undefined) continue;
    for (const c of r.couches) jusqua.set(c, Math.max(jusqua.get(c) ?? -1, r.zoomMax));
  }
  const restantes = couches
    .filter((c) => !partout.has(c.id))
    .map((c) => {
      const plafond = jusqua.get(c.id);
      return plafond === undefined ? c : { ...c, minzoom: Math.max(c.minzoom ?? 0, plafond + 1) };
    });
  const dit = regles
    .map(
      (r) =>
        `${r.couches.join(', ')}${r.zoomMax === undefined ? '' : ` jusqu'au zoom ${r.zoomMax}`}`,
    )
    .join(' ; ');
  return {
    ...meta,
    ...(couches.length ? { vector_layers: restantes } : {}),
    'ntanova:allege': `sans ${dit} (outils/fond-de-carte/alleger.ts)`,
  };
}

function parZoom(archive: ArchiveLue): Map<number, { tuiles: number; octets: number }> {
  const sortie = new Map<number, { tuiles: number; octets: number }>();
  const contenus = new Set<string>();
  for (const t of archive.tuiles()) {
    const ligne = sortie.get(t.z) ?? { tuiles: 0, octets: 0 };
    ligne.tuiles++;
    const cle = `${t.z}:${t.decalage}`;
    if (!contenus.has(cle)) {
      contenus.add(cle);
      ligne.octets += t.octets.length;
    }
    sortie.set(t.z, ligne);
  }
  return sortie;
}

/** L'archive allégée, et ce que l'allègement a changé. */
export function alleger(
  octets: Uint8Array,
  regles: readonly Regle[] = REGLES_SOBRES,
): { archive: Uint8Array; bilan: Bilan } {
  const entree = lireArchive(octets);
  const e = entree.entete;
  if (e.tileType !== TileType.Mvt)
    throw new Error('Seules les tuiles vectorielles (MVT) sont gérées.');
  if (e.tileCompression !== Compression.Gzip && e.tileCompression !== Compression.None) {
    throw new Error('Les tuiles doivent être en gzip ou non compressées.');
  }
  const gzip = e.tileCompression === Compression.Gzip;
  const memo = new Map<string, Uint8Array>();
  const tuiles: TuileStockee[] = [];
  for (const t of entree.tuiles()) {
    const retirer = couchesARetirer(t.z, regles);
    const cle = `${t.decalage}:${[...retirer].sort().join(',')}`;
    let sortie = memo.get(cle);
    if (!sortie) {
      const mvt = gzip ? new Uint8Array(gunzipSync(t.octets)) : t.octets;
      const allege = retirerCouches(mvt, retirer);
      sortie = gzip ? new Uint8Array(gzipSync(allege, { level: 9 })) : allege;
      memo.set(cle, sortie);
    }
    tuiles.push({ z: t.z, x: t.x, y: t.y, octets: sortie });
  }
  const archive = ecrireArchive(tuiles, {
    metadonnees: metadonneesAllegees(entree.metadonnees, regles),
    minLon: e.minLon,
    minLat: e.minLat,
    maxLon: e.maxLon,
    maxLat: e.maxLat,
    centreZoom: e.centerZoom,
    centreLon: e.centerLon,
    centreLat: e.centerLat,
    compressionTuiles: gzip ? 2 : 1,
  });
  const apres = lireArchive(archive);
  const avantParZoom = parZoom(entree);
  const apresParZoom = parZoom(apres);
  const zooms = [...new Set([...avantParZoom.keys(), ...apresParZoom.keys()])].sort(
    (a, b) => a - b,
  );
  return {
    archive,
    bilan: {
      tuilesAvant: e.numAddressedTiles,
      tuilesApres: apres.entete.numAddressedTiles,
      contenusAvant: e.numTileContents,
      contenusApres: apres.entete.numTileContents,
      octetsAvant: e.tileDataLength ?? 0,
      octetsApres: apres.entete.tileDataLength ?? 0,
      fichierAvant: octets.length,
      fichierApres: archive.length,
      parZoom: zooms.map((zoom) => ({
        zoom,
        tuiles: apresParZoom.get(zoom)?.tuiles ?? 0,
        octetsAvant: avantParZoom.get(zoom)?.octets ?? 0,
        octetsApres: apresParZoom.get(zoom)?.octets ?? 0,
      })),
    },
  };
}

/**
 * Contrôle une archive déjà allégée : chaque tuile se lit, et aucune couche que les règles retirent n'y est encore. Rend la
 * liste des problèmes (vide : tout va bien). C'est ce que lance `fabriquer.sh` sur le fichier final, avant qu'on l'héberge.
 */
export function controler(octets: Uint8Array, regles: readonly Regle[] = REGLES_SOBRES): string[] {
  const problemes: string[] = [];
  const archive = lireArchive(octets);
  const gzip = archive.entete.tileCompression === Compression.Gzip;
  const dejaVu = new Set<string>();
  for (const t of archive.tuiles()) {
    const interdites = couchesARetirer(t.z, regles);
    const cle = `${t.decalage}:${[...interdites].sort().join(',')}`;
    if (dejaVu.has(cle)) continue;
    dejaVu.add(cle);
    try {
      const noms = nomsDesCouches(gzip ? new Uint8Array(gunzipSync(t.octets)) : t.octets);
      const encore = noms.filter((n) => interdites.has(n));
      if (encore.length > 0)
        problemes.push(`tuile ${t.z}/${t.x}/${t.y} : ${encore.join(', ')} encore là`);
    } catch (erreur) {
      problemes.push(`tuile ${t.z}/${t.x}/${t.y} illisible : ${(erreur as Error).message}`);
    }
  }
  const declarees = Array.isArray(archive.metadonnees.vector_layers)
    ? (archive.metadonnees.vector_layers as { id: string }[]).map((c) => c.id)
    : [];
  for (const regle of regles) {
    if (regle.zoomMax !== undefined) continue;
    for (const c of regle.couches) {
      if (declarees.includes(c)) problemes.push(`les métadonnées déclarent encore la couche ${c}`);
    }
  }
  return problemes;
}

const mo = (octets: number) => `${(octets / 1e6).toFixed(2)} Mo`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [premier, deuxieme] = process.argv.slice(2);
  if (premier === '--controler' && deuxieme) {
    const problemes = controler(new Uint8Array(readFileSync(deuxieme)));
    if (problemes.length > 0) {
      console.error(`${problemes.length} problème(s) dans ${deuxieme} :`);
      problemes.slice(0, 20).forEach((p) => console.error(`  - ${p}`));
      process.exit(1);
    }
    const lue = lireArchive(new Uint8Array(readFileSync(deuxieme)));
    console.log(
      `✓ ${deuxieme} : ${lue.entete.numAddressedTiles} tuiles lues, aucune couche retirée n'y est encore.`,
    );
    process.exit(0);
  }
  const [entree, sortie] = [premier, deuxieme];
  if (!entree || !sortie) {
    console.error(
      'Usage : node outils/fond-de-carte/alleger.ts <entree.pmtiles> <sortie.pmtiles>\n        node outils/fond-de-carte/alleger.ts --controler <archive.pmtiles>',
    );
    process.exit(2);
  }
  const { archive, bilan } = alleger(new Uint8Array(readFileSync(entree)));
  writeFileSync(sortie, archive);
  console.log(
    `Règles : ${REGLES_SOBRES.map((r) => `sans ${r.couches.join(', ')}${r.zoomMax === undefined ? '' : ` jusqu'au zoom ${r.zoomMax}`}`).join(' ; ')}`,
  );
  console.log(
    `${'zoom'.padStart(4)} ${'tuiles'.padStart(7)} ${'avant'.padStart(11)} ${'après'.padStart(11)} ${'gain'.padStart(5)}`,
  );
  for (const l of bilan.parZoom) {
    const gain = l.octetsAvant
      ? `${Math.round((100 * (l.octetsAvant - l.octetsApres)) / l.octetsAvant)} %`
      : '';
    console.log(
      `${String(l.zoom).padStart(4)} ${String(l.tuiles).padStart(7)} ${mo(l.octetsAvant).padStart(11)} ${mo(l.octetsApres).padStart(11)} ${gain.padStart(5)}`,
    );
  }
  console.log(
    `Tuiles : ${bilan.tuilesAvant} → ${bilan.tuilesApres} adressées ; contenus distincts ${bilan.contenusAvant} → ${bilan.contenusApres}`,
  );
  console.log(`Fichier : ${mo(bilan.fichierAvant)} → ${mo(bilan.fichierApres)} (${sortie})`);
}
