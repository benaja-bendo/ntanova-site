import { describe, expect, it } from 'vitest';
import {
  avecFormation,
  cycleAvecFormations,
  CYCLES_AVEC_FORMATIONS,
  duCycle,
  erreurFormation,
  formationSerie,
  formationVide,
  memeFormation,
  resume,
  sansCycle,
  sansFormation,
  SERIES_RAPIDES,
} from '../../src/modele/formations';
import { listes } from '../../src/modele/listes';
import type { FormationSaisie } from '../../src/modele/ports';

const bts: FormationSaisie = {
  cycle: 'superieur',
  titre: 'BTS Informatique de gestion',
  domaine: 'informatique',
  serie: null,
  diplome: 'bts',
  rythmes: ['jour', 'weekend'],
};

describe('les formations lues sur un panneau', () => {
  it('seuls le lycée, le technique, le supérieur et les autres formations en ont', () => {
    expect([...CYCLES_AVEC_FORMATIONS]).toEqual([
      'lycee',
      'technique',
      'superieur',
      'autre_formation',
    ]);
    expect(cycleAvecFormations('lycee')).toBe(true);
    expect(cycleAvecFormations('primaire')).toBe(false);
    expect(cycleAvecFormations('creche')).toBe(false);
  });

  it('toutes les séries rapides existent dans la liste fermée de la base', () => {
    for (const s of SERIES_RAPIDES) expect(listes.bac_track).toContain(s);
  });

  it('une série cochée devient une formation « Série C », baccalauréat', () => {
    expect(formationSerie('lycee', 'c')).toEqual({
      cycle: 'lycee',
      titre: 'Série C',
      domaine: null,
      serie: 'c',
      diplome: 'bac',
      rythmes: [],
    });
  });

  it('une formation libre démarre vide', () => {
    expect(formationVide('technique')).toEqual({
      cycle: 'technique',
      titre: '',
      domaine: null,
      serie: null,
      diplome: null,
      rythmes: [],
    });
  });

  it('deux formations sont les mêmes à l’accent, à la casse et aux espaces près, dans un même cycle', () => {
    const a = { cycle: 'superieur', titre: 'BTS  Gestion ' } as const;
    expect(memeFormation(a, { cycle: 'superieur', titre: 'bts gestion' })).toBe(true);
    expect(
      memeFormation({ cycle: 'lycee', titre: 'Série É' }, { cycle: 'lycee', titre: 'serie e' }),
    ).toBe(true);
    // Le même titre dans un autre cycle n'est pas la même formation.
    expect(memeFormation(a, { cycle: 'technique', titre: 'BTS Gestion' })).toBe(false);
  });

  it('ajouter deux fois la même formation ne la double pas', () => {
    const une = avecFormation([], bts);
    const deux = avecFormation(une, { ...bts, titre: 'bts informatique de gestion' });
    expect(deux).toHaveLength(1);
    expect(avecFormation(une, formationSerie('lycee', 'd'))).toHaveLength(2);
    // La liste d'origine n'est jamais modifiée.
    expect(une).toHaveLength(1);
  });

  it('retirer une formation, un cycle, et lire celles d’un cycle', () => {
    const liste = [bts, formationSerie('lycee', 'c'), formationSerie('lycee', 'd')];
    expect(sansFormation(liste, { cycle: 'lycee', titre: 'série c' }).map((f) => f.titre)).toEqual([
      'BTS Informatique de gestion',
      'Série D',
    ]);
    expect(sansCycle(liste, 'lycee')).toEqual([bts]);
    expect(duCycle(liste, 'lycee').map((f) => f.serie)).toEqual(['c', 'd']);
    expect(duCycle(liste, 'technique')).toEqual([]);
  });

  it('se résume en une ligne : titre · diplôme · rythmes', () => {
    expect(resume(bts)).toBe('BTS Informatique de gestion · BTS · jour, week-end');
    expect(resume({ titre: 'Couture', serie: null, diplome: null, rythmes: [] })).toBe('Couture');
    expect(resume(formationSerie('lycee', 'g2'))).toBe('Série G2 · Baccalauréat');
  });

  it('ne part que si le titre est écrit et les listes sont respectées', () => {
    expect(erreurFormation(bts)).toBeNull();
    expect(erreurFormation({ ...bts, titre: '   ' })).toMatch(/écris/i);
    expect(erreurFormation({ ...bts, titre: 'x'.repeat(161) })).toMatch(/trop long/i);
    // Une valeur hors liste (ce qu'un fichier mal fait pourrait apporter) est refusée avant la base.
    expect(erreurFormation({ ...bts, serie: 'z' as never })).toMatch(/série/i);
    expect(erreurFormation({ ...bts, diplome: 'magicien' as never })).toMatch(/diplôme/i);
  });
});
