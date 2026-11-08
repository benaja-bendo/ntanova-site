// Le contrat entre le code et la base : tout ce que `src/infra/supabase/` demande (une fonction et ses paramètres, une
// table ou une vue, une colonne, un lien entre deux tables) existe dans les migrations. Les parcours de bout en bout
// tournent sur un faux serveur : sans ce test, une faute de frappe dans un nom de colonne ne se verrait qu'en production.
//
// C'est une lecture du SQL et du TypeScript, pas une exécution : elle attrape les noms qui n'existent pas, pas les
// types. Les fonctions et les droits sont éprouvés par les 425 tests pgTAP (`supabase/tests/`).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = join(import.meta.dirname, '../..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

// Lire un peu de SQL ou de TypeScript ----------------------------------------------------------------------

/** Sans commentaires, pour qu'un commentaire ne passe pas pour du code : `-- …` en SQL, `// …` en TypeScript. */
function sansCommentaires(texte: string, sql = false): string {
  const sansBlocs = texte.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return sql
    ? sansBlocs.replace(/(^|[^:\w'"`])--.*$/gm, '$1')
    : sansBlocs.replace(/(^|[^:\w'"`])\/\/.*$/gm, '$1');
}

/** L'indice de la parenthèse (ou accolade, ou crochet) qui ferme celle ouverte à `ouvrante`, en ignorant les chaînes. */
function fermante(texte: string, ouvrante: number, sql = false): number {
  const paires: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const pile: string[] = [];
  let chaine: string | null = null;
  for (let i = ouvrante; i < texte.length; i++) {
    const c = texte[i] as string;
    if (chaine) {
      // En SQL, la barre oblique inverse n'échappe rien (`'\.'` est une chaîne complète).
      if (c === '\\' && !sql) i++;
      else if (c === chaine) chaine = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    else if (c in paires) pile.push(paires[c] as string);
    else if (c === pile[pile.length - 1]) {
      pile.pop();
      if (pile.length === 0) return i;
    }
  }
  throw new Error(`parenthèse jamais fermée : ${texte.slice(ouvrante, ouvrante + 60)}`);
}

/** Découpe aux virgules du premier niveau. */
function decouper(texte: string, sql = false): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let chaine: string | null = null;
  let debut = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i] as string;
    if (chaine) {
      if (c === '\\' && !sql) i++;
      else if (c === chaine) chaine = null;
    } else if (c === "'" || c === '"' || c === '`') chaine = c;
    else if ('([{'.includes(c)) profondeur++;
    else if (')]}'.includes(c)) profondeur--;
    else if (c === ',' && profondeur === 0) {
      morceaux.push(texte.slice(debut, i));
      debut = i + 1;
    }
  }
  morceaux.push(texte.slice(debut));
  return morceaux.map((m) => m.trim()).filter((m) => m !== '');
}

// Le schéma, lu dans les migrations --------------------------------------------------------------------------

/** Une clé étrangère : les colonnes de la table, et la table qu'elles désignent. */
interface Cle {
  colonnes: string[];
  vers: string;
}
interface Table {
  colonnes: Set<string>;
  /** Les tables que celle-ci référence. */
  vers: Set<string>;
  /** Ses clés étrangères, une par contrainte (deux clés vers la même table comptent pour deux). */
  cles: Cle[];
  /** Les colonnes de sa clé primaire. */
  cle: Set<string>;
}
interface Schema {
  tables: Map<string, Table>;
  vues: Map<string, string>;
  /** Pour une fonction : ses paramètres, avec « a une valeur par défaut ». */
  fonctions: Map<string, { nom: string; defaut: boolean }[]>;
  contraintes: Set<string>;
  seaux: Set<string>;
}

function lireSchema(): Schema {
  const dossier = 'supabase/migrations';
  const sql = readdirSync(join(RACINE, dossier))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => sansCommentaires(lire(`${dossier}/${f}`), true))
    .join('\n;\n');

  const tables = new Map<string, Table>();
  const vues = new Map<string, string>();
  const fonctions = new Map<string, { nom: string; defaut: boolean }[]>();
  const contraintes = new Set<string>();
  const seaux = new Set<string>();
  const table = (nom: string): Table => {
    let t = tables.get(nom);
    if (!t)
      tables.set(nom, (t = { colonnes: new Set(), vers: new Set(), cles: [], cle: new Set() }));
    return t;
  };
  const MOTS_DE_TABLE = /^(constraint|primary|foreign|unique|check|exclude|like)\b/i;
  const reference = (texte: string) => /\breferences\s+(?:public\.)?(\w+)/i.exec(texte)?.[1];
  const colonnesDe = (liste: string) =>
    liste
      .split(',')
      .map((c) => c.trim().replace(/"/g, ''))
      .filter((c) => c !== '');
  /** `foreign key (a, b) references t (…)`, dans une définition de table ou un `alter table`. */
  const clesEtrangeres = (texte: string): Cle[] =>
    [...texte.matchAll(/foreign\s+key\s*\(([^)]*)\)\s*references\s+(?:public\.)?(\w+)/gi)].map(
      (m) => ({ colonnes: colonnesDe(m[1] as string), vers: m[2] as string }),
    );
  /** `primary key (a, b)` : les colonnes de la clé primaire. */
  const clePrimaire = (texte: string): string[] =>
    colonnesDe(/primary\s+key\s*\(([^)]*)\)/i.exec(texte)?.[1] ?? '');

  for (const m of sql.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi,
  )) {
    const nom = m[1] as string;
    const ouvrante = (m.index as number) + m[0].length - 1;
    const t = table(nom);
    for (const element of decouper(sql.slice(ouvrante + 1, fermante(sql, ouvrante, true)), true)) {
      const nomContrainte = /^constraint\s+(\w+)/i.exec(element)?.[1];
      if (nomContrainte) contraintes.add(nomContrainte);
      const cible = reference(element);
      if (MOTS_DE_TABLE.test(element)) {
        if (cible) t.vers.add(cible);
        t.cles.push(...clesEtrangeres(element));
        for (const c of clePrimaire(element)) t.cle.add(c);
        continue;
      }
      const colonne = /^"?(\w+)"?/.exec(element)?.[1];
      if (!colonne) continue;
      t.colonnes.add(colonne);
      if (/\bprimary\s+key\b/i.test(element)) t.cle.add(colonne);
      if (cible) {
        t.vers.add(cible);
        t.cles.push({ colonnes: [colonne], vers: cible });
        contraintes.add(`${nom}_${colonne}_fkey`);
      }
    }
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?(\w+)\s+([^;]*);/gi)) {
    const t = table(m[1] as string);
    for (const ajout of (m[2] as string).matchAll(
      /add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?([^,]*)/gi,
    )) {
      t.colonnes.add(ajout[1] as string);
      const cible = reference(ajout[2] as string);
      if (cible) {
        t.vers.add(cible);
        t.cles.push({ colonnes: [ajout[1] as string], vers: cible });
        contraintes.add(`${m[1]}_${ajout[1]}_fkey`);
      }
    }
    t.cles.push(...clesEtrangeres(m[2] as string));
    for (const c of clePrimaire(m[2] as string)) t.cle.add(c);
    for (const c of (m[2] as string).matchAll(/add\s+constraint\s+(\w+)([^,]*)/gi)) {
      contraintes.add(c[1] as string);
      const cible = reference(c[2] as string);
      if (cible) t.vers.add(cible);
    }
    // `alter table … rename column a to b` / `drop column a`
    const renomme = /rename\s+column\s+"?(\w+)"?\s+to\s+"?(\w+)"?/i.exec(m[2] as string);
    if (renomme) {
      t.colonnes.delete(renomme[1] as string);
      t.colonnes.add(renomme[2] as string);
    }
    for (const retire of (m[2] as string).matchAll(
      /drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/gi,
    )) {
      t.colonnes.delete(retire[1] as string);
    }
  }
  for (const m of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)([\s\S]*?);/gi,
  )) {
    vues.set(m[1] as string, m[2] as string);
  }
  for (const m of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi,
  )) {
    const ouvrante = (m.index as number) + m[0].length - 1;
    const parametres = decouper(sql.slice(ouvrante + 1, fermante(sql, ouvrante, true)), true).map(
      (p) => {
        const sansSens = p.replace(/^(in|out|inout|variadic)\s+/i, '');
        return {
          nom: /^"?(\w+)"?/.exec(sansSens)?.[1] ?? '',
          defaut: /\bdefault\b|:=|=\s/i.test(p),
        };
      },
    );
    // La dernière définition d'un nom l'emporte (une migration suivante peut la remplacer).
    fonctions.set(m[1] as string, parametres);
  }
  for (const m of sql.matchAll(/storage\.buckets[^;]*?values\s*\(\s*'(\w+)'/gi)) {
    seaux.add(m[1] as string);
  }
  return { tables, vues, fonctions, contraintes, seaux };
}

const schema = lireSchema();

// Ce que le code demande -------------------------------------------------------------------------------------

interface Element {
  /** La colonne, ou la table liée. */
  nom: string;
  /** Pour une table liée : la contrainte demandée (`table!contrainte`). */
  contrainte?: string;
  enfants?: Element[];
}

/** `id, label, institutions(name), doublon:campuses!field_submissions_duplicate_of_campus_id_fkey(id)` → des éléments. */
function lireSelection(texte: string): Element[] {
  return decouper(texte).flatMap((morceau): Element[] => {
    if (morceau === '*') return [];
    const parenthese = morceau.indexOf('(');
    const tete = (parenthese === -1 ? morceau : morceau.slice(0, parenthese)).trim();
    const sansAlias = tete.includes(':') ? tete.slice(tete.indexOf(':') + 1) : tete;
    const [nom = '', contrainte] = sansAlias.split('!');
    if (parenthese === -1) return [{ nom: nom.trim() }];
    const interieur = morceau.slice(parenthese + 1, morceau.lastIndexOf(')'));
    return [
      {
        nom: nom.trim(),
        ...(contrainte ? { contrainte: contrainte.trim() } : {}),
        enfants: lireSelection(interieur),
      },
    ];
  });
}

/** Les constantes de texte d'un fichier : `const COLONNES = 'a, b, ' + 'c, d';` */
function constantes(source: string): Map<string, string> {
  const resultat = new Map<string, string>();
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*((?:\s*(?:'[^']*'|"[^"]*")\s*\+?)+)\s*;/g)) {
    resultat.set(
      m[1] as string,
      [...(m[2] as string).matchAll(/'([^']*)'|"([^"]*)"/g)]
        .map((s) => s[1] ?? s[2] ?? '')
        .join(''),
    );
  }
  return resultat;
}

/** Le premier argument d'un appel, comme texte (`.select(` ... `)`), ou `null`. */
function premierArgument(source: string, apres: number): { texte: string; fin: number } | null {
  const ouvrante = source.indexOf('(', apres);
  if (ouvrante === -1) return null;
  const fin = fermante(source, ouvrante);
  const [premier = ''] = decouper(source.slice(ouvrante + 1, fin));
  return { texte: premier, fin };
}

function textesLitteraux(argument: string, definies: Map<string, string>): string | null {
  const nu = argument.trim();
  if (/^\w+$/.test(nu) && definies.has(nu)) return definies.get(nu) as string;
  const litteraux = [...nu.matchAll(/'([^']*)'|"([^"]*)"/g)];
  if (litteraux.length === 0) return null;
  // Des chaînes mises bout à bout (`'a, ' + 'b'`) ; autre chose (un modèle, une variable) : on ne juge pas.
  if (!/^(?:\s*(?:'[^']*'|"[^"]*")\s*\+?)+$/.test(nu)) return null;
  return litteraux.map((s) => s[1] ?? s[2] ?? '').join('');
}

interface Demande {
  fichier: string;
  table: string;
  colonnes: string[];
  selections: Element[][];
}

/** Les mots d'une vue : une colonne demandée doit y figurer (lecture légère, un alias ou une colonne). */
const mots = (texte: string) => new Set(texte.toLowerCase().match(/\w+/g) ?? []);

const FICHIERS = readdirSync(join(RACINE, 'src/infra/supabase'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `src/infra/supabase/${f}`);

function lireLesDemandes() {
  const rpc: { fichier: string; nom: string; cles: string[] }[] = [];
  const demandes: Demande[] = [];
  const seaux: { fichier: string; nom: string }[] = [];
  const url: { fichier: string; table: string; colonnes: string[] }[] = [];

  for (const fichier of FICHIERS) {
    const source = sansCommentaires(lire(fichier));
    const definies = constantes(source);

    for (const m of source.matchAll(/\.rpc\(\s*'(\w+)'\s*(,\s*\{)?/g)) {
      let cles: string[] = [];
      if (m[2]) {
        const accolade = (m.index as number) + m[0].length - 1;
        cles = decouper(source.slice(accolade + 1, fermante(source, accolade))).flatMap((e) => {
          const cle = /^(?:'([^']+)'|(\w+))\s*(?::|$)/.exec(e);
          return cle ? [(cle[1] ?? cle[2]) as string] : [];
        });
      }
      rpc.push({ fichier, nom: m[1] as string, cles });
    }

    for (const m of source.matchAll(/(\.storage\s*)?\.from\(\s*(?:'(\w+)'|(\w+))\s*\)/g)) {
      const valeur = m[2] ?? definies.get(m[3] as string);
      if (m[1]) {
        if (valeur) seaux.push({ fichier, nom: valeur });
        continue;
      }
      if (!m[2]) continue;
      // La chaîne de cet appel : jusqu'à la prochaine requête ou la fin de l'instruction.
      const depart = (m.index as number) + m[0].length;
      const reste = source.slice(depart);
      const fin = Math.min(
        ...[reste.search(/\.from\(/), reste.search(/\.rpc\(/), reste.indexOf(';')].filter(
          (i) => i >= 0,
        ),
        reste.length,
      );
      const chaine = reste.slice(0, fin);
      const colonnes: string[] = [];
      const selections: Element[][] = [];
      for (const a of chaine.matchAll(/\.(select|insert|update|upsert)\(/g)) {
        const argument = premierArgument(chaine, a.index as number);
        if (!argument) continue;
        if (a[1] === 'select') {
          const texte = textesLitteraux(argument.texte, definies);
          if (texte !== null) selections.push(lireSelection(texte));
        } else if (argument.texte.trim().startsWith('{')) {
          const corps = argument.texte.trim();
          colonnes.push(
            ...decouper(corps.slice(1, fermante(corps, 0))).flatMap((e) => {
              const cle = /^(?:'([^']+)'|(\w+))\s*(?::|$)/.exec(e);
              return cle ? [(cle[1] ?? cle[2]) as string] : [];
            }),
          );
        }
      }
      for (const f of chaine.matchAll(
        /\.(?:eq|neq|is|in|not|gt|gte|lt|lte|like|ilike|order)\(\s*'(\w+)'/g,
      )) {
        colonnes.push(f[1] as string);
      }
      demandes.push({ fichier, table: m[2], colonnes, selections });
    }

    // Les lectures par l'API REST : 'table?select=a,b,c&order=a'
    for (const m of source.matchAll(/['`"](\w+)\?select=([^'`"&]+)(?:&order=([\w,.]+))?/g)) {
      url.push({
        fichier,
        table: m[1] as string,
        colonnes: [
          ...lireSelection(m[2] as string).map((e) => e.nom),
          ...(m[3] ? m[3].split(',').map((o) => o.split('.')[0] as string) : []),
        ],
      });
    }
  }
  return { rpc, demandes, seaux, url };
}

const demandes = lireLesDemandes();

/** La colonne existe-t-elle, pour une table (colonnes déclarées) ou une vue (présente dans sa définition) ? */
function colonneExiste(nomTable: string, colonne: string): boolean {
  const table = schema.tables.get(nomTable);
  if (table) return table.colonnes.has(colonne);
  const vue = schema.vues.get(nomTable);
  return vue !== undefined && mots(vue).has(colonne.toLowerCase());
}

/**
 * Les chemins que PostgREST voit entre deux tables : une clé étrangère de l'une vers l'autre (dans un sens ou dans
 * l'autre, une par contrainte), ou une table de jonction, c'est-à-dire une troisième table dont la clé primaire contient
 * une clé vers chacune. Une table qui a des clés vers les deux sans les avoir dans sa clé primaire n'en est pas une.
 * Quand il y en a plusieurs, `a(b(…))` ne dit pas lequel : l'API répond « 300 » (PGRST201), et l'écran qui lit `a`
 * ne s'affiche plus. Il faut alors nommer la contrainte : `a(b!contrainte(…))`.
 */
function liensEntre(a: string, b: string): string[] {
  if (a === b) return [];
  const liens: string[] = [];
  for (const [de, vers] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const cle of schema.tables.get(de)?.cles ?? []) {
      if (cle.vers === vers) liens.push(`${de}(${cle.colonnes.join(', ')}) → ${vers}`);
    }
  }
  for (const [jonction, t] of schema.tables) {
    if (jonction === a || jonction === b) continue;
    const dansLaCle = (c: Cle) => c.colonnes.every((colonne) => t.cle.has(colonne));
    const versA = t.cles.filter((c) => c.vers === a && dansLaCle(c));
    const versB = t.cles.filter((c) => c.vers === b && dansLaCle(c));
    for (let i = 0; i < versA.length * versB.length; i++) liens.push(`${a} ↔ ${b} par ${jonction}`);
  }
  return liens;
}

function problemesDeSelection(racine: string, elements: Element[], chemin = racine): string[] {
  const problemes: string[] = [];
  for (const e of elements) {
    if (!e.enfants) {
      if (!colonneExiste(racine, e.nom)) problemes.push(`${chemin}.${e.nom} : colonne inconnue`);
      continue;
    }
    const connue = schema.tables.has(e.nom) || schema.vues.has(e.nom);
    if (!connue) {
      problemes.push(`${chemin}→${e.nom} : table liée inconnue`);
      continue;
    }
    const lien =
      schema.tables.get(racine)?.vers.has(e.nom) || schema.tables.get(e.nom)?.vers.has(racine);
    if (!lien && !schema.vues.has(racine)) {
      problemes.push(`${chemin}→${e.nom} : aucun lien (clé étrangère) entre ${racine} et ${e.nom}`);
    }
    if (e.contrainte && !schema.contraintes.has(e.contrainte)) {
      problemes.push(`${chemin}→${e.nom} : la contrainte ${e.contrainte} n’existe pas`);
    }
    if (!e.contrainte && schema.tables.has(racine) && schema.tables.has(e.nom)) {
      const liens = liensEntre(racine, e.nom);
      if (liens.length > 1) {
        problemes.push(
          `${chemin}→${e.nom} : ${liens.length} liens possibles entre ${racine} et ${e.nom} (${liens.join(' ; ')}), ` +
            `l’API répond « 300 » : écrire ${e.nom}!<contrainte>(…)`,
        );
      }
    }
    problemes.push(...problemesDeSelection(e.nom, e.enfants, `${chemin}→${e.nom}`));
  }
  return problemes;
}

// Les vérifications -----------------------------------------------------------------------------------------

describe('le schéma lu dans les migrations', () => {
  it('connaît les objets principaux, avec leurs colonnes', () => {
    expect(schema.tables.get('campuses')?.colonnes).toContain('institution_id');
    expect(schema.tables.get('geo_divisions')?.colonnes).toContain('open_for_fieldwork');
    expect(schema.tables.get('geo_divisions')?.colonnes).toContain('public_status');
    expect(schema.fonctions.has('set_division_public_status')).toBe(true);
    expect(schema.tables.get('field_submissions')?.colonnes).toContain('observed_programs');
    expect(schema.vues.has('public_campuses')).toBe(true);
    expect(schema.fonctions.has('accept_submission')).toBe(true);
    expect(schema.seaux.has('releves')).toBe(true);
    expect(schema.contraintes.has('field_submissions_duplicate_of_campus_id_fkey')).toBe(true);
  });

  it('une migration qui ajoute une colonne est comptée, une colonne retirée ne l’est plus', () => {
    // `campuses.curriculum_note` vient d'une migration d'avant le catalogue universel ; `pitch`, jamais.
    expect(schema.tables.get('campuses')?.colonnes).toContain('curriculum_note');
    expect(schema.tables.get('campuses')?.colonnes).not.toContain('pitch');
  });
});

describe('ce que l’adaptateur appelle existe dans la base', () => {
  it('chaque fonction (rpc) existe, avec ses paramètres, et aucun paramètre obligatoire ne manque', () => {
    expect(demandes.rpc.length).toBeGreaterThan(30);
    const problemes: string[] = [];
    for (const appel of demandes.rpc) {
      const parametres = schema.fonctions.get(appel.nom);
      if (!parametres) {
        problemes.push(`${appel.fichier} : la fonction ${appel.nom} n’existe pas`);
        continue;
      }
      const connus = new Set(parametres.map((p) => p.nom));
      for (const cle of appel.cles) {
        if (!connus.has(cle)) problemes.push(`${appel.nom}(${cle}) : paramètre inconnu`);
      }
      for (const p of parametres) {
        if (!p.defaut && !appel.cles.includes(p.nom)) {
          problemes.push(
            `${appel.nom} : le paramètre ${p.nom} est obligatoire, et n’est pas donné`,
          );
        }
      }
    }
    expect(problemes).toEqual([]);
  });

  it('chaque table ou vue demandée existe, avec les colonnes lues, écrites ou filtrées', () => {
    expect(demandes.demandes.length).toBeGreaterThan(30);
    const problemes: string[] = [];
    for (const d of demandes.demandes) {
      if (!schema.tables.has(d.table) && !schema.vues.has(d.table)) {
        problemes.push(`${d.fichier} : ${d.table} n’existe ni comme table ni comme vue`);
        continue;
      }
      for (const colonne of d.colonnes) {
        if (!colonneExiste(d.table, colonne))
          problemes.push(`${d.table}.${colonne} : colonne inconnue`);
      }
      for (const s of d.selections) problemes.push(...problemesDeSelection(d.table, s));
    }
    expect([...new Set(problemes)]).toEqual([]);
  });

  it('les lectures publiques par l’API REST (catalogue) portent sur des vues et des colonnes qui existent', () => {
    expect(demandes.url.length).toBeGreaterThanOrEqual(4);
    const problemes: string[] = [];
    for (const u of demandes.url) {
      if (!schema.tables.has(u.table) && !schema.vues.has(u.table)) {
        problemes.push(`${u.fichier} : ${u.table} n’existe pas`);
        continue;
      }
      for (const colonne of u.colonnes) {
        if (!colonneExiste(u.table, colonne))
          problemes.push(`${u.table}.${colonne} : colonne inconnue`);
      }
    }
    expect([...new Set(problemes)]).toEqual([]);
  });

  it('les seaux de fichiers existent', () => {
    expect(demandes.seaux.length).toBeGreaterThan(0);
    for (const s of demandes.seaux)
      expect(schema.seaux.has(s.nom), `${s.fichier} : ${s.nom}`).toBe(true);
  });
});

describe('le contrôle de contrat mord', () => {
  it('une colonne qui n’existe pas est repérée', () => {
    expect(colonneExiste('campuses', 'label')).toBe(true);
    expect(colonneExiste('campuses', 'libele')).toBe(false);
    expect(
      problemesDeSelection('campuses', lireSelection('id, institutions(name), nom_faux')),
    ).toEqual(['campuses.nom_faux : colonne inconnue']);
  });

  it('un lien entre deux tables qui n’existe pas est repéré', () => {
    const problemes = problemesDeSelection(
      'geo_divisions',
      lireSelection('name, payout_batches(id)'),
    );
    expect(problemes[0]).toMatch(/aucun lien/);
  });

  it('une contrainte demandée qui n’existe pas est repérée', () => {
    const problemes = problemesDeSelection(
      'field_submissions',
      lireSelection('doublon:campuses!field_submissions_inventee_fkey(id)'),
    );
    expect(problemes.join()).toMatch(/n’existe pas/);
  });

  it('un lien ambigu entre deux tables est repéré : l’API répondrait « 300 » (ticket 147, 08/11/2026)', () => {
    // La table des anciennes adresses (`campus_former_addresses`) a une clé vers `campuses` et une vers `geo_divisions`,
    // toutes deux dans sa clé primaire : PostgREST y voit un second chemin entre les deux, et `geo_divisions(name)`
    // lu depuis `campuses` ne marchait plus (l'onglet Écoles de l'administration : « La base ne répond pas »).
    expect(liensEntre('campuses', 'geo_divisions')).toHaveLength(2);
    expect(liensEntre('geo_divisions', 'campuses')).toHaveLength(2);
    expect(
      problemesDeSelection('campuses', lireSelection('id, geo_divisions(name)')).join(),
    ).toMatch(/2 liens possibles entre campuses et geo_divisions/);
    expect(
      problemesDeSelection(
        'institutions',
        lireSelection('campuses(id, geo_divisions(name))'),
      ).join(),
    ).toMatch(/geo_divisions/);
    // Nommer la contrainte lève l'ambiguïté.
    expect(
      problemesDeSelection(
        'campuses',
        lireSelection('id, geo_divisions!campuses_division_id_fkey(name)'),
      ),
    ).toEqual([]);
  });

  it('un seul lien, ou des clés qui ne forment pas une jonction, ne sont pas ambigus', () => {
    // `lots` n'a qu'une clé vers `geo_divisions`.
    expect(liensEntre('lots', 'geo_divisions')).toHaveLength(1);
    expect(problemesDeSelection('lots', lireSelection('nom, geo_divisions(name, path)'))).toEqual(
      [],
    );
    // `field_submissions` a des clés vers `campuses` et vers `geo_divisions`, mais hors de sa clé primaire (`id`) :
    // ce n'est pas une table de jonction, elle ne s'ajoute pas aux chemins entre les deux.
    expect(liensEntre('campuses', 'field_submissions')).toHaveLength(2);
    expect(liensEntre('campuses', 'institutions')).toHaveLength(1);
  });

  it('la lecture d’une sélection garde alias, contrainte et imbrication', () => {
    expect(lireSelection('id, a:campuses!c_fkey(id, institutions(name)), *')).toEqual([
      { nom: 'id' },
      {
        nom: 'campuses',
        contrainte: 'c_fkey',
        enfants: [{ nom: 'id' }, { nom: 'institutions', enfants: [{ nom: 'name' }] }],
      },
    ]);
  });
});
