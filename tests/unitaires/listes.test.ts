import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listes } from '../../src/modele/listes';

// Les domaines SQL de toutes les migrations : `create domain public.<nom> as text check (value in (...))`.
const dossier = 'supabase/migrations';
const sql = readdirSync(dossier)
  .sort()
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(dossier, f), 'utf8'))
  .join('\n');
// Une migration peut redéfinir la liste (`alter domain … add constraint … check (value in (...))`) :
// la dernière définition, dans l'ordre des migrations, fait foi.
const definitions = [
  ...sql.matchAll(
    /(?:create domain public\.(\w+) as text|alter domain public\.(\w+) add constraint \w+)\s+check \(value in \(([^)]*)\)\)/g,
  ),
].map((m) => ({
  nom: (m[1] ?? m[2]) as string,
  valeurs: [...(m[3] ?? '').matchAll(/'([^']*)'/g)].map((v) => v[1] as string),
}));
const domaines = new Map(definitions.map((d) => [d.nom, d.valeurs]));

describe('listes fermées', () => {
  it('chaque liste du code existe dans la base', () => {
    expect([...domaines.keys()].sort()).toEqual(Object.keys(listes).sort());
  });

  it.each(Object.entries(listes))(
    '%s : mêmes valeurs dans le code et dans la base',
    (nom, valeurs) => {
      expect(domaines.get(nom)).toEqual([...valeurs]);
    },
  );

  // On ne retire et on ne renomme jamais une valeur : des fiches dorment dans des téléphones,
  // des pages sont construites chaque nuit. Pour changer un mot, on change le libellé.
  it('une migration ne retire aucune valeur d’une liste', () => {
    const noms = new Set(definitions.map((d) => d.nom));
    for (const nom of noms) {
      const versions = definitions.filter((d) => d.nom === nom).map((d) => d.valeurs);
      const derniere = versions.at(-1) ?? [];
      for (const avant of versions.slice(0, -1)) {
        expect(derniere, `${nom} : une valeur a été retirée`).toEqual(
          expect.arrayContaining(avant),
        );
      }
    }
  });
});

describe('toutes les écoles, de la crèche au supérieur (ticket 12)', () => {
  it('les types gardent une case de sortie « autre » et « non_indique » (le défaut de la base)', () => {
    expect(listes.type_ecole).toEqual(
      expect.arrayContaining([
        'publique',
        'privee',
        'confessionnelle',
        'communautaire',
        'autre',
        'non_indique',
      ]),
    );
  });

  it('les niveaux vont de la crèche au supérieur, avec une case de sortie « autre_formation »', () => {
    expect(listes.niveau).toEqual(
      expect.arrayContaining([
        'creche',
        'maternelle',
        'primaire',
        'college',
        'lycee',
        'technique',
        'superieur',
        'autre_formation',
      ]),
    );
  });
});
