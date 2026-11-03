import { describe, expect, it } from 'vitest';
import { ageDe, trierParAnciennete } from '../../src/modele/age';

// L'âge d'une fiche à valider (ticket #76) : le livret promet aux relais une validation sous 24 à 48 h ; l'écran dit
// depuis quand chaque fiche attend, et signale celle qui dépasse 24 heures.

const maintenant = new Date('2026-11-03T12:00:00.000Z');
const ilYA = (minutes: number) => new Date(maintenant.getTime() - minutes * 60_000).toISOString();

describe('ageDe', () => {
  it('moins d’une minute', () => {
    expect(ageDe(ilYA(0), maintenant)).toMatchObject({
      texte: 'depuis moins d’une minute',
      ancienne: false,
    });
  });

  it('en minutes, jusqu’à une heure', () => {
    expect(ageDe(ilYA(5), maintenant).texte).toBe('depuis 5 min');
    expect(ageDe(ilYA(59), maintenant).texte).toBe('depuis 59 min');
  });

  it('en heures, jusqu’à 24 heures', () => {
    expect(ageDe(ilYA(60), maintenant).texte).toBe('depuis 1 h');
    expect(ageDe(ilYA(5 * 60 + 40), maintenant).texte).toBe('depuis 5 h');
    expect(ageDe(ilYA(23 * 60 + 59), maintenant)).toMatchObject({
      texte: 'depuis 23 h',
      ancienne: false,
    });
  });

  it('en jours à partir de 24 heures, et la fiche est signalée', () => {
    expect(ageDe(ilYA(24 * 60), maintenant)).toMatchObject({
      texte: 'depuis 1 jour',
      ancienne: true,
    });
    expect(ageDe(ilYA(47 * 60), maintenant).texte).toBe('depuis 1 jour');
    expect(ageDe(ilYA(2 * 24 * 60 + 30), maintenant)).toMatchObject({
      texte: 'depuis 2 jours',
      ancienne: true,
    });
  });

  it('une date dans le futur (horloge du téléphone) ne casse rien', () => {
    expect(ageDe(ilYA(-30), maintenant)).toMatchObject({
      texte: 'depuis moins d’une minute',
      ancienne: false,
    });
  });
});

describe('trierParAnciennete', () => {
  it('la plus ancienne d’abord, sans toucher à la liste reçue', () => {
    const fiches = [
      { id: 'b', recuLe: ilYA(60) },
      { id: 'a', recuLe: ilYA(600) },
      { id: 'c', recuLe: ilYA(5) },
    ];
    expect(trierParAnciennete(fiches).map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(fiches.map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });
});
