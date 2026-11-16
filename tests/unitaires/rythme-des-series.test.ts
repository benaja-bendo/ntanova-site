// C4 (fondateur, 16/11/2026) : un rythme par cycle pour les séries du bac cochées par pastille.
import { describe, expect, it } from 'vitest';
import {
  avecRythmeDesSeries,
  formationSerie,
  formationVide,
  rythmeDesSeries,
} from '../../src/modele/formations';

const libre = { ...formationVide('lycee'), titre: 'Couture', rythmes: ['jour' as const] };
const liste = [formationSerie('lycee', 'c'), formationSerie('lycee', 'd'), libre];

describe('le rythme des séries d’un cycle', () => {
  it('se donne à toutes les séries du cycle, pas à la formation libre', () => {
    const avec = avecRythmeDesSeries(liste, 'lycee', ['soir', 'jour']);
    expect(avec.filter((f) => f.serie !== null).map((f) => f.rythmes)).toEqual([
      ['jour', 'soir'],
      ['jour', 'soir'],
    ]);
    expect(avec.find((f) => f.titre === 'Couture')?.rythmes).toEqual(['jour']);
    expect(rythmeDesSeries(avec, 'lycee')).toEqual(['jour', 'soir']);
  });

  it('ne touche pas un autre cycle ; sans série, il est vide', () => {
    const tech = [formationSerie('technique', 'g2')];
    expect(avecRythmeDesSeries(tech, 'lycee', ['soir'])).toEqual(tech);
    expect(rythmeDesSeries([libre], 'lycee')).toEqual([]);
  });
});
