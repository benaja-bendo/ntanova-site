import { describe, expect, it } from 'vitest';
import {
  libelleMotif,
  libelleNiveau,
  libelleTypeEcole,
  motifsProposes,
} from '../../src/modele/libelles';
import { listes } from '../../src/modele/listes';

describe('les mots des listes', () => {
  it('chaque valeur de niveau et de type a son libellé, et aucun libellé n’est en trop', () => {
    expect(Object.keys(libelleNiveau).sort()).toEqual([...listes.niveau].sort());
    expect(Object.keys(libelleTypeEcole).sort()).toEqual([...listes.type_ecole].sort());
  });

  it('chaque motif de décision a son libellé, et aucun libellé n’est en trop', () => {
    expect(Object.keys(libelleMotif).sort()).toEqual([...listes.motif_decision].sort());
  });

  it('l’administration ne propose plus « hors du lot » : la valeur reste, pour lire les anciennes fiches', () => {
    expect(listes.motif_decision).toContain('hors_lot');
    expect(motifsProposes).not.toContain('hors_lot');
    // Demander de reprendre la position reste possible, sous son vrai nom.
    expect(motifsProposes).toContain('position_imprecise');
    for (const motif of motifsProposes) expect(listes.motif_decision).toContain(motif);
    // Un relais qui relit une ancienne demande n'apprend plus que son école est « hors de son lot ».
    expect(libelleMotif.hors_lot).not.toMatch(/hors de votre lot/);
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
