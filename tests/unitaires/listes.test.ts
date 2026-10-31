import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listes } from '../../src/modele/listes';

// Les domaines SQL de toutes les migrations : `create domain public.<nom> as text check (value in (...))`.
const dossier = 'supabase/migrations';
const sql = readdirSync(dossier)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(dossier, f), 'utf8'))
  .join('\n');
const domaines = new Map(
  [...sql.matchAll(/create domain public\.(\w+) as text\s+check \(value in \(([^)]*)\)\)/g)].map(
    (m) => [m[1], [...(m[2] ?? '').matchAll(/'([^']*)'/g)].map((v) => v[1])],
  ),
);

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
});
