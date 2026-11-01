// Tire d'OpenStreetMap les rues et les avenues d'un arrondissement pour la carte détourée : elles
// vont dans src/modele/carte/pointe-noire.json, d'où le site les dessine à la construction.
//
//   node outils/tracer-les-rues.ts <arrondissement> [reponse-overpass.json] [--remplacer]
//
// <arrondissement> est son slug (ngoyo, loandjili…). Sans fichier, l'outil interroge Overpass, le
// serveur d'OpenStreetMap France, sur la boîte de l'arrondissement ; avec un fichier (la réponse
// d'une requête déjà faite), il travaille sans réseau. Il ne refait pas les rues d'un
// arrondissement qui les a déjà, sauf avec --remplacer.
//
// Les règles sont celles de Tié-Tié (ticket 15), pour que tous les arrondissements se lisent pareil :
// - les avenues (traits larges, jaunes) : trunk, primary, secondary, tertiary, toutes gardées ;
// - les rues (traits fins) : residential, unclassified, living_street, celles d'au moins 640 m ;
// - le reste (service, track, chemins…) n'est pas dessiné ;
// - chaque voie est coupée au contour, avec un point de plus de chaque côté (le dessin la découpe
//   ensuite), simplifiée à 20 m près, et arrondie au mètre (cinq décimales).
//
// Données © les contributeurs d'OpenStreetMap, licence ODbL : la mention reste sous chaque carte.
// Un User-Agent générique pour Overpass, jamais une adresse e-mail ni une autre donnée personnelle.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { boiteDeContours, METRES_PAR_DEGRE, type Boite } from '../src/modele/carte/geometrie.ts';
import type { Rues } from '../src/modele/carte/plan.ts';
import { dansContour, type MultiPolygone } from '../src/modele/geo.ts';

/** Les grands axes : toutes les voies de ces classes sont gardées. */
export const AVENUES = ['trunk', 'primary', 'secondary', 'tertiary'] as const;
/** Les rues ordinaires : seules les longues sont gardées. */
export const RUES = ['residential', 'unclassified', 'living_street'] as const;

/** Un détail de moins de 20 m disparaît : c'est moins d'un pixel sur un téléphone. */
export const TOLERANCE_M = 20;
/** En dessous, une rue est un cul-de-sac de quartier : la carte ne les dessine pas. */
export const LONGUEUR_MINIMALE_M = 640;
/** Environ 200 m de plus autour de la boîte, pour que les rues du bord arrivent jusqu'au bord. */
const MARGE_DEGRES = 0.002;

export const SERVEUR_OVERPASS = 'https://overpass.openstreetmap.fr/api/interpreter';
export const AGENT_HTTP = 'ntanova-carte/1.0';

/** Une voie telle qu'Overpass la donne avec `out tags geom`. */
export interface Voie {
  tags?: { highway?: string };
  /** Un point manque quand la boîte de la requête coupe la voie. */
  geometry?: ({ lat: number; lon: number } | null)[];
}

export interface ReponseOverpass {
  elements: Voie[];
  osm3s?: { timestamp_osm_base?: string };
  remark?: string;
}

/** Le fichier des tracés (src/modele/carte/pointe-noire.json), tel que l'outil le lit et l'écrit. */
export interface DonneesCarte {
  arrondissements: { slug: string; nom: string; contour: MultiPolygone }[];
  rues: Record<string, Rues>;
}

/** La requête Overpass : les voies des classes dessinées dans la boîte, un peu agrandie. */
export function requeteOverpass(boite: Boite): string {
  const classes = [...AVENUES, ...RUES].join('|');
  const [sud, ouest, nord, est] = [
    boite.sud - MARGE_DEGRES,
    boite.ouest - MARGE_DEGRES,
    boite.nord + MARGE_DEGRES,
    boite.est + MARGE_DEGRES,
  ].map((v) => Number(v.toFixed(4)));
  return `[out:json][timeout:120];way["highway"~"^(${classes})$"](${sud},${ouest},${nord},${est});out tags geom;`;
}

/**
 * Une réponse d'Overpass qu'on peut croire. Le serveur répond 200 même quand il a coupé la
 * requête (`remark`), et une réponse vide ne doit pas effacer des rues.
 */
export function verifierReponse(lue: unknown): ReponseOverpass {
  const reponse = lue as Partial<ReponseOverpass> | null;
  if (reponse?.remark) {
    throw new Error(
      `Overpass signale un problème, la réponse peut être incomplète : ${reponse.remark}`,
    );
  }
  if (!Array.isArray(reponse?.elements) || reponse.elements.length === 0) {
    throw new Error('Overpass n’a donné aucune voie.');
  }
  return reponse as ReponseOverpass;
}

export async function telecharger(
  boite: Boite,
  appeler: typeof fetch = fetch,
): Promise<ReponseOverpass> {
  const reponse = await appeler(SERVEUR_OVERPASS, {
    method: 'POST',
    headers: {
      'User-Agent': AGENT_HTTP,
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data: requeteOverpass(boite) }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!reponse.ok) throw new Error(`Overpass a répondu ${reponse.status}.`);
  return verifierReponse(await reponse.json());
}

type Coin = [longitude: number, latitude: number];

/** Les indices des points à garder (Douglas-Peucker), les bouts toujours. Les points sont en mètres. */
function indicesGardes(points: readonly Coin[], tolerance: number): number[] {
  const garde = points.map(() => false);
  garde[0] = true;
  garde[points.length - 1] = true;
  const pile: [number, number][] = [[0, points.length - 1]];
  for (let tranche = pile.pop(); tranche; tranche = pile.pop()) {
    const [a, b] = tranche;
    const [x1, y1] = points[a]!;
    const [x2, y2] = points[b]!;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const n = Math.hypot(dx, dy);
    let loin = -1;
    let ecart = 0;
    for (let i = a + 1; i < b; i++) {
      const [x0, y0] = points[i]!;
      const d =
        n < 1e-6
          ? Math.hypot(x0 - x1, y0 - y1)
          : Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / n;
      if (d > ecart) {
        loin = i;
        ecart = d;
      }
    }
    if (loin >= 0 && ecart > tolerance) {
      garde[loin] = true;
      pile.push([a, loin], [loin, b]);
    }
  }
  return garde.flatMap((g, i) => (g ? [i] : []));
}

const cinqDecimales = (v: number) => Number(v.toFixed(5));
const classeEn = (liste: readonly string[], classe: string | undefined) =>
  classe !== undefined && liste.includes(classe);

/** Les rues et les avenues de l'arrondissement, tirées des voies d'OpenStreetMap. */
export function versRues(voies: readonly Voie[], contour: MultiPolygone): Rues {
  const boite = boiteDeContours([contour]);
  const milieu = (boite.sud + boite.nord) / 2;
  const kx = Math.cos((milieu * Math.PI) / 180);
  const enMetres = ([longitude, latitude]: Coin): Coin => [
    (longitude - boite.ouest) * kx * METRES_PAR_DEGRE,
    (latitude - milieu) * METRES_PAR_DEGRE,
  ];
  const rues: number[][][] = [];
  const avenues: number[][][] = [];

  for (const voie of voies) {
    const classe = voie.tags?.highway;
    const estAvenue = classeEn(AVENUES, classe);
    if (!estAvenue && !classeEn(RUES, classe)) continue;
    const points = (voie.geometry ?? []).flatMap((p): Coin[] => (p ? [[p.lon, p.lat]] : []));
    if (points.length < 2) continue;
    const dedans = points.map(([longitude, latitude]) =>
      dansContour({ latitude, longitude }, contour),
    );

    // Chaque suite de points dans le contour fait une ligne, prolongée d'un point de chaque côté.
    for (let debut = 0; debut < points.length;) {
      if (!dedans[debut]) {
        debut++;
        continue;
      }
      let fin = debut;
      while (fin + 1 < points.length && dedans[fin + 1]) fin++;
      const morceau = points.slice(Math.max(0, debut - 1), Math.min(points.length, fin + 2));
      debut = fin + 1;
      if (morceau.length < 2) continue;

      const metres = morceau.map(enMetres);
      const gardes = indicesGardes(metres, TOLERANCE_M);
      let longueur = 0;
      for (let i = 1; i < gardes.length; i++) {
        const [x1, y1] = metres[gardes[i - 1]!]!;
        const [x2, y2] = metres[gardes[i]!]!;
        longueur += Math.hypot(x2 - x1, y2 - y1);
      }
      const ligne = gardes.map((i) => morceau[i]!.map(cinqDecimales));
      if (estAvenue) avenues.push(ligne);
      else if (longueur >= LONGUEUR_MINIMALE_M) rues.push(ligne);
    }
  }
  return { rues, avenues };
}

/**
 * Le fichier des tracés avec les rues de l'arrondissement en plus. Les autres arrondissements
 * restent tels quels ; refaire des rues déjà dessinées demande de le dire (`remplacer`).
 */
export function avecLesRues<T extends DonneesCarte>(
  donnees: T,
  slug: string,
  rues: Rues,
  remplacer = false,
): T {
  if (Object.hasOwn(donnees.rues, slug) && !remplacer) {
    throw new Error(
      `Les rues de « ${slug} » sont déjà dessinées : ajouter --remplacer pour les refaire.`,
    );
  }
  return { ...donnees, rues: { ...donnees.rues, [slug]: rues } };
}

/** Le fichier tient sur une ligne, sans retour final : on le réécrit tel qu'il a été lu. */
export const serialiser = (donnees: unknown) => JSON.stringify(donnees);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const remplacer = args.includes('--remplacer');
  const [slug, reponseDejaLue] = args.filter((a) => !a.startsWith('--'));
  if (!slug) {
    console.error(
      'Usage : node outils/tracer-les-rues.ts <arrondissement> [reponse-overpass.json] [--remplacer]',
    );
    process.exit(1);
  }
  try {
    const chemin = new URL('../src/modele/carte/pointe-noire.json', import.meta.url);
    const avant = readFileSync(chemin, 'utf8');
    const donnees = JSON.parse(avant) as DonneesCarte;
    const arrondissement = donnees.arrondissements.find((a) => a.slug === slug);
    if (!arrondissement) {
      const connus = donnees.arrondissements.map((a) => a.slug).join(', ');
      throw new Error(`Arrondissement inconnu : « ${slug} ». Les arrondissements : ${connus}.`);
    }
    const reponse = reponseDejaLue
      ? verifierReponse(JSON.parse(readFileSync(reponseDejaLue, 'utf8')))
      : await telecharger(boiteDeContours([arrondissement.contour]));
    const rues = versRues(reponse.elements, arrondissement.contour);
    const apres = serialiser(avecLesRues(donnees, slug, rues, remplacer));
    writeFileSync(chemin, apres);

    const points = [...rues.rues, ...rues.avenues].flat().length;
    console.error(
      `${arrondissement.nom} : ${rues.rues.length} rues, ${rues.avenues.length} avenues, ${points} points.`,
    );
    console.error(
      `OpenStreetMap du ${reponse.osm3s?.timestamp_osm_base?.slice(0, 10) ?? 'jour inconnu'}. ` +
        `Fichier des tracés : ${Buffer.byteLength(avant)} → ${Buffer.byteLength(apres)} octets.`,
    );
  } catch (erreur) {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  }
}
