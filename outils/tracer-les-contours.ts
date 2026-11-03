// Tire d'OpenStreetMap les contours de divisions (des relations de limites administratives) et écrit la migration de
// données qui les met dans `geo_divisions.boundary` (ticket 113, décision D3 du fondateur, 03/11/2026) : la base est
// l'unique source des contours que lit la carte.
//
//   node outils/tracer-les-contours.ts <ensemble> <migration.sql> [--reponse=<fichier.json>]
//
// <ensemble> : `brazzaville` (la commune et ses neuf arrondissements). <migration.sql> : le fichier à écrire, dans
// `supabase/migrations/`. Avec `--reponse=<fichier.json>`, l'outil relit la réponse d'Overpass déjà téléchargée si le
// fichier existe (il travaille alors sans réseau, et refait la même migration), sinon il la télécharge et l'y garde.
//
// Les règles :
// - chaque relation est vérifiée avant d'être crue : limite administrative, bon niveau, nom et numéro d'ordre attendus
//   (une relation dont le nom ne colle pas fait échouer l'outil, jamais un contour attribué au hasard) ;
// - les voies des relations sont rejointes en anneaux fermés (extérieur dans le sens direct, trous dans l'autre, norme
//   GeoJSON), puis simplifiées à 10 m près et arrondies au mètre : un contour simplifié sert à situer une école dans son
//   arrondissement, pas à mesurer ;
// - la migration dit pour chaque division la relation et la date de la base d'OpenStreetMap, ajoute à `source` (rien
//   n'est réécrit), et échoue bruyamment si une division manque.
//
// Données © les contributeurs d'OpenStreetMap, licence ODbL. Un User-Agent générique pour Overpass, jamais une adresse
// e-mail ni une autre donnée personnelle.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { METRES_PAR_DEGRE } from '../src/modele/carte/geometrie.ts';
import { simplifierContour } from '../src/modele/carte/simplification.ts';
import { dansContour, type MultiPolygone } from '../src/modele/geo.ts';
import { AGENT_HTTP } from './tracer-les-rues.ts';

/**
 * Le serveur principal d'Overpass. Celui d'OpenStreetMap France, que `tracer-les-rues.ts` interroge, répond depuis le
 * 03/11/2026 « This service is only available to white-listed usages » à tout appel de ce dépôt.
 */
export const SERVEUR_OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Un détail de moins de 10 m disparaît : c'est moins d'un pixel au plus grand zoom stocké. */
export const TOLERANCE_M = 10;

type Coin = [longitude: number, latitude: number];

/** Ce que l'outil attend d'une relation : sa division dans la base, son nom et, pour un arrondissement, son numéro. */
export interface ContourAttendu {
  relation: number;
  /** Le chemin `ltree` de la division dans `geo_divisions`. */
  chemin: string;
  nom: string;
  /** Le numéro d'ordre d'un arrondissement ; rien pour la commune. */
  ordre?: number;
}

/** Les ensembles que l'outil sait tirer. */
export const ENSEMBLES: Record<string, readonly ContourAttendu[]> = {
  brazzaville: [
    { relation: 16370691, chemin: 'congo.brazzaville.brazzaville', nom: 'Brazzaville' },
    {
      relation: 16356192,
      chemin: 'congo.brazzaville.brazzaville.makelekele',
      nom: 'Makélékélé',
      ordre: 1,
    },
    {
      relation: 16357002,
      chemin: 'congo.brazzaville.brazzaville.bacongo',
      nom: 'Bacongo',
      ordre: 2,
    },
    {
      relation: 16357198,
      chemin: 'congo.brazzaville.brazzaville.poto_poto',
      nom: 'Poto-Poto',
      ordre: 3,
    },
    {
      relation: 16359029,
      chemin: 'congo.brazzaville.brazzaville.moungali',
      nom: 'Moungali',
      ordre: 4,
    },
    { relation: 16362075, chemin: 'congo.brazzaville.brazzaville.ouenze', nom: 'Ouenzé', ordre: 5 },
    {
      relation: 16363022,
      chemin: 'congo.brazzaville.brazzaville.talangai',
      nom: 'Talangaï',
      ordre: 6,
    },
    { relation: 16365154, chemin: 'congo.brazzaville.brazzaville.mfilou', nom: 'Mfilou', ordre: 7 },
    {
      relation: 16370379,
      chemin: 'congo.brazzaville.brazzaville.madibou',
      nom: 'Madibou',
      ordre: 8,
    },
    { relation: 16370647, chemin: 'congo.brazzaville.brazzaville.djiri', nom: 'Djiri', ordre: 9 },
  ],
};

/** Un membre d'une relation tel qu'Overpass le donne avec `out geom`. */
export interface Membre {
  type: string;
  ref: number;
  role: string;
  /** Les points d'une voie (`null` quand un point manque). */
  geometry?: ({ lat: number; lon: number } | null)[];
}

export interface Relation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: Membre[];
}

export interface ReponseOverpass {
  elements: Relation[];
  osm3s?: { timestamp_osm_base?: string };
  remark?: string;
}

/** La requête Overpass : les relations par leur numéro, avec la géométrie de leurs voies. */
export function requeteOverpass(relations: readonly number[]): string {
  return `[out:json][timeout:180];rel(id:${relations.join(',')});out geom;`;
}

/**
 * Une réponse d'Overpass qu'on peut croire. Le serveur répond 200 même quand il a coupé la requête (`remark`), et une
 * réponse sans toutes les relations ne doit jamais écrire une migration à moitié.
 */
export function verifierReponse(lue: unknown, attendues: readonly number[]): ReponseOverpass {
  const reponse = lue as Partial<ReponseOverpass> | null;
  if (!reponse || !Array.isArray(reponse.elements)) {
    throw new Error('Overpass n’a pas rendu de liste d’éléments.');
  }
  if (reponse.remark) throw new Error(`Overpass a coupé la requête : ${reponse.remark}`);
  const presentes = new Set(reponse.elements.map((e) => e.id));
  const manquantes = attendues.filter((id) => !presentes.has(id));
  if (manquantes.length > 0) {
    throw new Error(`Overpass ne rend pas la relation ${manquantes.join(', ')}.`);
  }
  return reponse as ReponseOverpass;
}

/** Un serveur « à pleine capacité » (429, 502, 503, 504) demande qu'on réessaie plus tard, en doublant l'attente. */
const A_REESSAYER = [429, 502, 503, 504];

export async function telecharger(
  relations: readonly number[],
  attenteS = 10,
  essais = 5,
): Promise<ReponseOverpass> {
  for (let essai = 1; ; essai++) {
    const reponse = await fetch(SERVEUR_OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': AGENT_HTTP },
      body: new URLSearchParams({ data: requeteOverpass(relations) }),
      signal: AbortSignal.timeout(180_000),
    });
    if (A_REESSAYER.includes(reponse.status) && essai < essais) {
      const attente = attenteS * 2 ** (essai - 1);
      console.log(
        `Overpass répond ${reponse.status} (serveur occupé) : nouvel essai dans ${attente} s.`,
      );
      await new Promise((fini) => setTimeout(fini, attente * 1000));
      continue;
    }
    const texte = await reponse.text();
    if (!reponse.ok)
      throw new Error(`Overpass a répondu ${reponse.status} : ${texte.slice(0, 200)}`);
    let lue: unknown;
    try {
      lue = JSON.parse(texte);
    } catch {
      throw new Error(`Overpass n’a pas rendu du JSON : ${texte.slice(0, 200)}`);
    }
    return verifierReponse(lue, relations);
  }
}

const sansAccent = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** La relation est-elle bien celle qu'on attend ? Limite administrative, nom (accents ignorés), numéro d'ordre. */
export function verifierNom(relation: Relation, attendu: ContourAttendu): void {
  const tags = relation.tags ?? {};
  if (tags.boundary !== 'administrative') {
    throw new Error(
      `La relation ${attendu.relation} n’est pas une limite administrative (boundary=${tags.boundary ?? 'absent'}).`,
    );
  }
  const niveau = attendu.ordre === undefined ? '5' : '6';
  if (tags.admin_level !== niveau) {
    throw new Error(
      `La relation ${attendu.relation} est au niveau ${tags.admin_level ?? 'absent'}, ${niveau} attendu.`,
    );
  }
  const nomAttendu =
    attendu.ordre === undefined
      ? `${attendu.nom} (commune)`
      : `${attendu.nom} (arrondissement ${attendu.ordre})`;
  if (sansAccent(tags.name ?? '') !== sansAccent(nomAttendu)) {
    throw new Error(
      `La relation ${attendu.relation} s’appelle « ${tags.name ?? ''} » ; « ${nomAttendu} » était attendu.`,
    );
  }
}

const memes = (a: Coin, b: Coin) => a[0] === b[0] && a[1] === b[1];

/** Rejoint des voies, bout à bout (dans n'importe quel ordre et sens), en anneaux fermés. */
export function assemblerAnneaux(chemins: readonly (readonly Coin[])[]): Coin[][] {
  const restants = chemins.filter((c) => c.length >= 2).map((c) => [...c]);
  const anneaux: Coin[][] = [];
  while (restants.length > 0) {
    let courant = restants.pop()!;
    while (!memes(courant[0]!, courant.at(-1)!)) {
      const fin = courant.at(-1)!;
      const i = restants.findIndex((c) => memes(c[0]!, fin) || memes(c.at(-1)!, fin));
      if (i < 0) {
        throw new Error(`Contour ouvert : aucune voie ne continue au point ${fin.join(', ')}.`);
      }
      const suite = restants.splice(i, 1)[0]!;
      courant = [...courant, ...(memes(suite[0]!, fin) ? suite : [...suite].reverse()).slice(1)];
    }
    anneaux.push(courant);
  }
  return anneaux;
}

/** Deux fois l'aire signée d'un anneau, en degrés² : positive quand il tourne dans le sens direct. */
function aireSignee(anneau: readonly (readonly number[])[]): number {
  let somme = 0;
  for (let i = 0; i + 1 < anneau.length; i++) {
    const [x1 = 0, y1 = 0] = anneau[i]!;
    const [x2 = 0, y2 = 0] = anneau[i + 1]!;
    somme += x1 * y2 - x2 * y1;
  }
  return somme;
}

const dansLeSens = (anneau: Coin[], direct: boolean): Coin[] =>
  aireSignee(anneau) > 0 === direct ? anneau : [...anneau].reverse();

function versChemin(voie: Membre, relation: number): Coin[] {
  if (!voie.geometry || voie.geometry.some((p) => p === null)) {
    throw new Error(`La voie ${voie.ref} de la relation ${relation} a des points manquants.`);
  }
  return voie.geometry.map((p) => [p!.lon, p!.lat]);
}

/** Le contour d'une relation de limite : un polygone par extérieur, ses trous rangés dedans. */
export function contourDeRelation(relation: Relation): MultiPolygone {
  const voies = (relation.members ?? []).filter((m) => m.type === 'way');
  const chemins = (roles: readonly string[]) =>
    voies.filter((v) => roles.includes(v.role)).map((v) => versChemin(v, relation.id));
  const exterieurs = assemblerAnneaux(chemins(['outer', ''])).map((a) => dansLeSens(a, true));
  const trous = assemblerAnneaux(chemins(['inner'])).map((a) => dansLeSens(a, false));
  const polygones = exterieurs.map((exterieur) => [exterieur]);
  for (const trou of trous) {
    const [longitude = 0, latitude = 0] = trou[0] ?? [];
    const hote = exterieurs
      .filter((e) => dansContour({ latitude, longitude }, [[e]]))
      .sort((a, b) => Math.abs(aireSignee(a)) - Math.abs(aireSignee(b)))[0];
    if (!hote) {
      throw new Error(`Un trou de la relation ${relation.id} n’est dans aucun extérieur.`);
    }
    polygones[exterieurs.indexOf(hote)]!.push(trou);
  }
  return polygones.sort((a, b) => Math.abs(aireSignee(b[0]!)) - Math.abs(aireSignee(a[0]!)));
}

/** La surface d'un contour, en km² (plan local : assez pour contrôler un ordre de grandeur). */
export function aireKm2(contour: MultiPolygone): number {
  let total = 0;
  for (const [exterieur, ...trous] of contour) {
    if (!exterieur) continue;
    const milieu = exterieur.reduce((s, p) => s + (p[1] ?? 0), 0) / exterieur.length;
    const k = Math.cos((milieu * Math.PI) / 180) * (METRES_PAR_DEGRE / 1000) ** 2;
    total +=
      ((Math.abs(aireSignee(exterieur)) - trous.reduce((s, t) => s + Math.abs(aireSignee(t)), 0)) /
        2) *
      k;
  }
  return total;
}

const guillemet = (texte: string) => `'${texte.replaceAll("'", "''")}'`;

/** La migration de données : un `update` par division, puis un contrôle qui échoue si une division manque. */
export function migrationSql(
  entrees: readonly { attendu: ContourAttendu; contour: MultiPolygone }[],
  infos: { date: string; horodatage?: string | undefined },
): string {
  const lignes = [
    `-- Les contours de ${entrees.length} divisions, tirés d'OpenStreetMap (ticket 113, décision D3 du fondateur, 03/11/2026) :`,
    `-- © les contributeurs d'OpenStreetMap, licence ODbL. Chaque relation est dite dans \`osm_relation\` et dans \`source\`, avec la`,
    `-- date de la base (${infos.horodatage ?? infos.date}). Simplifiés à ${TOLERANCE_M} m près et arrondis au mètre : un contour simplifié`,
    `-- sert à situer une école dans son arrondissement, pas à mesurer. Rien n'est ouvert aux relais ni mis sur la carte.`,
    `--`,
    `-- Généré par outils/tracer-les-contours.ts : ne pas le modifier à la main.`,
    ``,
  ];
  for (const { attendu, contour } of entrees) {
    const geojson = JSON.stringify({ type: 'MultiPolygon', coordinates: contour });
    const source = ` ; contour OpenStreetMap, relation ${attendu.relation}, base du ${infos.date}, simplifié à ${TOLERANCE_M} m (© les contributeurs d'OpenStreetMap, licence ODbL)`;
    lignes.push(
      `update public.geo_divisions set`,
      `  boundary = extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(${guillemet(geojson)}), 4326)), 3)),`,
      `  osm_relation = ${attendu.relation},`,
      `  source = source || ${guillemet(source)}`,
      `where path::text = ${guillemet(attendu.chemin)};`,
      ``,
    );
  }
  const chemins = entrees.map((e) => guillemet(e.attendu.chemin)).join(', ');
  lignes.push(
    `-- Une division qui manque (l'amorçage a changé) ne doit pas passer sans bruit.`,
    `do $$`,
    `begin`,
    `  if (select count(*) from public.geo_divisions`,
    `      where path::text in (${chemins}) and boundary is not null and osm_relation is not null) <> ${entrees.length} then`,
    `    raise exception 'Les ${entrees.length} contours ne sont pas tous en place : une division manque ou n''a pas pris son contour.';`,
    `  end if;`,
    `end`,
    `$$;`,
    ``,
  );
  return lignes.join('\n');
}

/** « 2026-11-03T22:35:46Z » → « 03/11/2026 » (le jour UTC de la base d'OpenStreetMap). */
export function jourDeLaBase(horodatage: string): string {
  const [annee, mois, jour] = horodatage.slice(0, 10).split('-');
  return `${jour}/${mois}/${annee}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const [nomEnsemble, sortie] = args.filter((a) => !a.startsWith('--'));
  const fichierReponse = args.find((a) => a.startsWith('--reponse='))?.slice('--reponse='.length);
  const ensemble = nomEnsemble ? ENSEMBLES[nomEnsemble] : undefined;
  if (!ensemble || !sortie) {
    console.error(
      `Usage : node outils/tracer-les-contours.ts <${Object.keys(ENSEMBLES).join('|')}> <migration.sql> [--reponse=<fichier.json>]`,
    );
    process.exit(2);
  }
  const ids = ensemble.map((c) => c.relation);
  let reponse: ReponseOverpass;
  if (fichierReponse && existsSync(fichierReponse)) {
    reponse = verifierReponse(JSON.parse(readFileSync(fichierReponse, 'utf8')), ids);
    console.log(`Réponse d’Overpass relue : ${fichierReponse}`);
  } else {
    reponse = await telecharger(ids);
    if (fichierReponse) {
      writeFileSync(fichierReponse, JSON.stringify(reponse));
      console.log(`Réponse d’Overpass gardée : ${fichierReponse}`);
    }
  }
  const horodatage = reponse.osm3s?.timestamp_osm_base;
  if (!horodatage) throw new Error('Overpass ne donne pas la date de sa base.');
  const date = jourDeLaBase(horodatage);
  console.log(`Base d’OpenStreetMap du ${horodatage}`);

  const entrees = ensemble.map((attendu) => {
    const relation = reponse.elements.find((e) => e.id === attendu.relation)!;
    verifierNom(relation, attendu);
    const brut = contourDeRelation(relation);
    const contour = simplifierContour(brut, TOLERANCE_M);
    const points = (c: MultiPolygone) =>
      c.reduce((s, p) => s + p.reduce((t, a) => t + a.length, 0), 0);
    console.log(
      `${attendu.chemin.padEnd(46)} relation ${attendu.relation}  ${String(points(brut)).padStart(6)} → ${String(points(contour)).padStart(4)} points  ${aireKm2(contour).toFixed(1).padStart(6)} km²`,
    );
    return { attendu, contour };
  });
  writeFileSync(sortie, migrationSql(entrees, { date, horodatage }));
  console.log(`Migration écrite : ${sortie}`);
}
