import { describe, expect, it } from 'vitest';
import { libelleNiveau, libelleTypeEcole } from '../../src/modele/libelles';
import { listes } from '../../src/modele/listes';

describe('les mots des listes', () => {
  it('chaque valeur de niveau et de type a son libellé, et aucun libellé n’est en trop', () => {
    expect(Object.keys(libelleNiveau).sort()).toEqual([...listes.niveau].sort());
    expect(Object.keys(libelleTypeEcole).sort()).toEqual([...listes.type_ecole].sort());
  });

  it('dit les niveaux comme on les lit sur une enseigne', () => {
    expect(libelleNiveau).toMatchObject({
      creche: 'Crèche ou garderie',
      maternelle: 'Maternelle',
      technique: 'Technique ou professionnel',
      superieur: 'Supérieur',
      autre_formation: 'Autre formation',
    });
  });

  it('dit les types, dont « Communautaire », « Autre » et « Pas indiqué »', () => {
    expect(libelleTypeEcole).toMatchObject({
      privee: 'Privée',
      publique: 'Publique',
      confessionnelle: 'Confessionnelle',
      communautaire: 'Communautaire',
      autre: 'Autre',
      non_indique: 'Pas indiqué',
    });
  });

  it('range les cases de sortie en dernier, dans l’ordre de l’écran du relais', () => {
    const types = Object.keys(libelleTypeEcole);
    expect(types.slice(-2)).toEqual(['autre', 'non_indique']);
    expect(Object.keys(libelleNiveau).at(-1)).toBe('autre_formation');
  });
});
