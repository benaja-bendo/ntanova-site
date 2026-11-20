// Ticket 199, A2 (fondateur, 20/11) : une date de déclaration ou d'accord n'est jamais pré-remplie à aujourd'hui. On la
// tape : sinon, un oubli publie une fausse date. Ce test relit les écrans de l'administration et la saisie des places.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { saisieClasseVide } from '../../src/modele/places-effectifs';

const dossier = join(import.meta.dirname, '../../src/app/admin');
const ecrans = readdirSync(dossier).filter((f) => f.endsWith('.tsx'));

// Aujourd'hui posé comme valeur d'un champ : `useState(jourDuCongo())`, `setX(jourDuCongo())`, `?? jourDuCongo()`,
// `xLe: jourDuCongo()` ou `: aujourdhui` dans une saisie. `max={jourDuCongo()}` (pas de date future) reste permis.
const PRE_REMPLI = [
  /useState\(\s*(jourDuCongo|aujourdhui)\(\)\s*\)/,
  /\bset[A-Z]\w*\(\s*(jourDuCongo|aujourdhui)\(\)\s*\)/,
  /\?\?\s*(jourDuCongo|aujourdhui)\(\)/,
  /\b\w+Le:\s*jourDuCongo\(\)/,
  /\b\w+Le:.*:\s*(aujourdhui|jourDuCongo\(\))\s*,?$/,
];
// Hors de la règle : le jour de parution d'une nouvelle, choisi par NTanova (il peut être à venir), et le mot de la
// direction, noté le jour où il est remis (décision du 18/11, à revoir seulement sur l'avis du fondateur).
const PERMIS = [
  /publieeLe: jourDuCongo\(\)/,
  /useState\(mot\?\.ditLe \?\? jourDuCongo\(\)\)/,
  /setDitLe\(jourDuCongo\(\)\)/,
];

describe('A2 : aucune date pré-remplie à aujourd’hui', () => {
  it.each(ecrans)('%s', (fichier) => {
    const lignes = readFileSync(join(dossier, fichier), 'utf8').split('\n');
    const fautives = lignes
      .map((l, i) => `${i + 1}: ${l.trim()}`)
      .filter((l) => PRE_REMPLI.some((r) => r.test(l)) && !PERMIS.some((r) => r.test(l)));
    expect(fautives).toEqual([]);
  });
  it('une nouvelle annonce de places attend son jour', () => {
    expect(saisieClasseVide('primaire').ditLe).toBe('');
  });
});
