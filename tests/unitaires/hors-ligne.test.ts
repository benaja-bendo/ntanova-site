// Ce que le téléphone d'un relais garde : les fiches et les photos vivent dans IndexedDB (Dexie), jamais dans
// `localStorage` ni `sessionStorage` (une limite de 5 Mo, effacés par le navigateur sans prévenir, et lus par
// n'importe quel script de la page). Ces tests relisent le code : si quelqu'un y remet un `localStorage`, ils échouent.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = join(import.meta.dirname, '../..');

function fichiersDe(dossier: string): string[] {
  return readdirSync(join(RACINE, dossier)).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(join(RACINE, chemin)).isDirectory()) return fichiersDe(chemin);
    return /\.(ts|tsx|astro)$/.test(nom) ? [chemin] : [];
  });
}

/** Le code d'un fichier, sans ses commentaires (un commentaire peut dire « jamais localStorage »). */
function code(chemin: string): string {
  return readFileSync(join(RACINE, chemin), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const STOCKAGES_DU_NAVIGATEUR = /\b(localStorage|sessionStorage)\b/;

describe('fiches et photos : IndexedDB, jamais localStorage', () => {
  it('l’espace relais n’utilise ni localStorage ni sessionStorage', () => {
    const fautifs = fichiersDe('src/app/relais').filter((f) =>
      STOCKAGES_DU_NAVIGATEUR.test(code(f)),
    );
    expect(fautifs).toEqual([]);
  });

  it('le modèle, les écrans de l’administration et l’adaptateur Supabase non plus, sauf la reprise d’une ancienne session', () => {
    const dossiers = ['src/modele', 'src/app/admin', 'src/infra/supabase', 'src/ui'];
    const fautifs = dossiers
      .flatMap(fichiersDe)
      .filter((f) => STOCKAGES_DU_NAVIGATEUR.test(code(f)))
      .map((f) => relative('.', f));
    // Le seul endroit : la reprise, une fois, d'une session ouverte par la version d'avant, aussitôt retirée de là.
    expect(fautifs).toEqual(['src/infra/supabase/stockage-session.ts']);
    const reprise = code('src/infra/supabase/stockage-session.ts');
    expect(reprise).toContain('localStorage.removeItem');
    expect(reprise).not.toContain('localStorage.setItem');
  });

  it('le téléphone garde les fiches avec leurs photos dans une base locale Dexie', () => {
    const base = code('src/app/relais/base-locale.ts');
    expect(base).toContain("from 'dexie'");
    expect(base).toContain('fiches');
    // Les photos sont des fichiers (Blob) dans la fiche, pas du texte.
    expect(readFileSync(join(RACINE, 'src/app/relais/base-locale.ts'), 'utf8')).toMatch(/Blob/);
  });

  it('le faux serveur, lui, vit dans le navigateur : il est le seul à écrire dans localStorage, et jamais pour les fiches du relais', () => {
    const faux = fichiersDe('src/infra/faux').filter((f) => STOCKAGES_DU_NAVIGATEUR.test(code(f)));
    expect(faux.map((f) => relative('.', f))).toEqual(['src/infra/faux/index.ts']);
  });
});
