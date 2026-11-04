// Les glyphes qu'il faut servir avec le fond de carte (ticket 114). MapLibre dessine un nom avec des glyphes servis par
// plages de 256 codes (`0-255.pbf`, `8192-8447.pbf`…) et redemande une plage dès qu'un nom y touche. Une nouvelle build
// d'OpenStreetMap peut apporter un caractère dont la plage n'est pas dans `public/polices/carte/` (un « œ », une
// apostrophe courbe) : l'étiquette le perdrait, avec une erreur 404 dans la console du visiteur. Cet outil lit les noms
// que la carte écrit (`name:fr`, sinon `name` : l'expression du style, `src/modele/carte/style.ts`) et dit les plages
// qui manquent. `fabriquer.sh` le lance.
//
//   node outils/fond-de-carte/glyphes.ts <fichier.pmtiles> [dossier des glyphes]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Compression } from 'pmtiles';
import { POLICE_DE_LA_CARTE, ZOOM_MIN_DE_LA_CARTE } from '../../src/modele/carte/fond.ts';
import { champs, lireArchive, lireVarint } from './alleger.ts';

const texteDe = new TextDecoder();

/**
 * Les noms que la carte écrirait pour les lieux d'une tuile (MVT non compressé) : `name:fr`, sinon `name`. Une couche
 * est ses lieux (champ 2), la liste de ses clés (champ 3) et celle de ses valeurs (champ 4) ; un lieu dit ses
 * propriétés par des paires (indice de clé, indice de valeur).
 */
function* nomsEcrits(mvt: Uint8Array): Generator<string> {
  for (const c of champs(mvt)) {
    if (c.champ !== 3 || c.type !== 2) continue;
    const couche = mvt.subarray(c.contenu, c.fin);
    const cles: string[] = [];
    const valeurs: (string | null)[] = [];
    const lieux: Uint8Array[] = [];
    for (const f of champs(couche)) {
      if (f.type !== 2) continue;
      const contenu = couche.subarray(f.contenu, f.fin);
      if (f.champ === 3) cles.push(texteDe.decode(contenu));
      else if (f.champ === 4) {
        const texte = [...champs(contenu)].find((v) => v.champ === 1 && v.type === 2);
        valeurs.push(texte ? texteDe.decode(contenu.subarray(texte.contenu, texte.fin)) : null);
      } else if (f.champ === 2) lieux.push(contenu);
    }
    for (const lieu of lieux) {
      const proprietes = new Map<string, string>();
      for (const t of champs(lieu)) {
        if (t.champ !== 2 || t.type !== 2) continue;
        let pos = t.contenu;
        while (pos < t.fin) {
          let cle: number;
          let valeur: number;
          [cle, pos] = lireVarint(lieu, pos);
          [valeur, pos] = lireVarint(lieu, pos);
          const nom = cles[cle];
          const texte = valeurs[valeur];
          if (nom !== undefined && texte !== undefined && texte !== null)
            proprietes.set(nom, texte);
        }
      }
      const nom = proprietes.get('name:fr') ?? proprietes.get('name');
      if (nom) yield nom;
    }
  }
}

export interface PlageUtilisee {
  /** Le nombre d'étiquettes qui ont au moins un caractère dans cette plage. */
  etiquettes: number;
  /** La première étiquette rencontrée, pour la reconnaître. */
  exemple: string;
}

/**
 * Les plages de glyphes (« 0-255 », « 8192-8447 »…) dont les noms de l'archive ont besoin. `zoomMin` écarte les tuiles
 * que la carte n'affiche jamais (la carte ne descend pas sous le zoom 4,5 : elle lit des tuiles du zoom 4 au moins).
 */
export function plagesDeGlyphes(archive: Uint8Array, zoomMin = 0): Map<string, PlageUtilisee> {
  const lue = lireArchive(archive);
  const compression = lue.entete.tileCompression;
  if (compression !== Compression.Gzip && compression !== Compression.None) {
    throw new Error('Les tuiles doivent être en gzip ou non compressées.');
  }
  const plages = new Map<string, PlageUtilisee>();
  for (const tuile of lue.tuiles()) {
    if (tuile.z < zoomMin) continue;
    const mvt = compression === Compression.Gzip ? gunzipSync(tuile.octets) : tuile.octets;
    for (const nom of nomsEcrits(mvt)) {
      const dites = new Set<string>();
      for (const caractere of nom) {
        const code = caractere.codePointAt(0) ?? 0;
        const debut = code - (code % 256);
        dites.add(`${debut}-${debut + 255}`);
      }
      for (const plage of dites) {
        const deja = plages.get(plage);
        if (deja) deja.etiquettes += 1;
        else plages.set(plage, { etiquettes: 1, exemple: nom });
      }
    }
  }
  return plages;
}

/** Celles des plages dont le fichier `<plage>.pbf` n'est pas dans le dossier des glyphes. */
export function plagesManquantes(plages: Iterable<string>, dossier: string): string[] {
  return [...plages].filter((plage) => !existsSync(join(dossier, `${plage}.pbf`)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [fichier, dossierDonne] = process.argv.slice(2);
  if (!fichier) {
    console.error(
      'Usage : node outils/fond-de-carte/glyphes.ts <fichier.pmtiles> [dossier des glyphes]',
    );
    process.exit(2);
  }
  const dossier =
    dossierDonne ??
    fileURLToPath(new URL(`../../public/polices/carte/${POLICE_DE_LA_CARTE}`, import.meta.url));
  const zoomMin = Math.floor(ZOOM_MIN_DE_LA_CARTE);
  const plages = plagesDeGlyphes(new Uint8Array(readFileSync(fichier)), zoomMin);
  const manquantes = new Set(plagesManquantes(plages.keys(), dossier));
  const ordre = [...plages].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  console.log(`Glyphes dont les noms ont besoin (zoom ${zoomMin} et plus) :`);
  for (const [plage, { etiquettes, exemple }] of ordre) {
    const fichierPbf = join(dossier, `${plage}.pbf`);
    if (manquantes.has(plage)) {
      console.log(
        `✗ ${plage} : ${etiquettes} étiquette(s), par exemple « ${exemple} » : le fichier manque.`,
      );
    } else {
      const ko = (statSync(fichierPbf).size / 1024).toFixed(1);
      console.log(
        `✓ ${plage} : ${etiquettes} étiquette(s), ${ko} Ko (par exemple « ${exemple.slice(0, 40)} »)`,
      );
    }
  }
  if (manquantes.size > 0) {
    console.error(
      `\nLe copier dans ${dossier}/ depuis\nhttps://github.com/protomaps/basemaps-assets/tree/main/fonts/Noto%20Sans%20Regular`,
    );
    process.exit(1);
  }
}
