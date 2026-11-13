// « Déjà sur NTanova ? » dans le téléphone : la même règle que la base (`school_name_core`, `similar_schools`), mêmes cas que
// les tests pgTAP (`frais_manques_nouvelles_admission.test.sql`, M9).
import { describe, expect, it } from 'vitest';
import {
  chercherUneEcole,
  distanceEnMots,
  memeEndroitPossible,
  noyauDuNom,
  rapprocher,
  ressemblance,
  type EcoleConnue,
} from '../../src/modele/deja-sur-ntanova';

const palmiers: EcoleConnue = {
  id: 'c1',
  nom: '[Complexe scolaire Les Palmiers]',
  sigle: 'CSLP',
  institutionId: 'i1',
  sites: 1,
  lieu: 'Loandjili',
  position: { latitude: -4.8, longitude: 11.85 },
};

describe('le cœur d’un nom', () => {
  it('sans accents ni mots génériques, comme la base', () => {
    expect(noyauDuNom('Complexe Scolaire Les Palmiers')).toBe('palmiers');
    expect(noyauDuNom('École privée Étoile du Matin')).toBe('etoile matin');
    expect(noyauDuNom('Complexe scolaire')).toBe('');
  });
  it('la ressemblance est celle de pg_trgm', () => {
    expect(ressemblance('palmiers', 'palmiers')).toBe(1);
    expect(ressemblance('palmier', 'palmiers')).toBeGreaterThanOrEqual(0.45);
    expect(ressemblance('palmiers', 'etoile')).toBeLessThan(0.2);
    expect(ressemblance('', 'palmiers')).toBe(0);
  });
});

describe('les deux groupes', () => {
  it('même nom à 15 m : près d’ici, et « même endroit possible »', () => {
    const r = rapprocher(
      'Complexe scolaire Les Palmiers',
      { latitude: -4.8001, longitude: 11.8501 },
      [palmiers],
    );
    expect(r.presDIci.map((e) => e.id)).toEqual(['c1']);
    expect(memeEndroitPossible(r.presDIci[0]!)).toBe(true);
    expect(r.memeNomAilleurs).toEqual([]);
  });
  it('même nom avec une faute, à 15 km : « même nom, ailleurs »', () => {
    const r = rapprocher('CS les Palmier', { latitude: -4.7, longitude: 11.95 }, [palmiers]);
    expect(r.presDIci).toEqual([]);
    expect(r.memeNomAilleurs.map((e) => e.id)).toEqual(['c1']);
  });
  it('un nom d’une autre école à 300 m : près d’ici, mais pas « même endroit »', () => {
    const r = rapprocher('[École Étoile]', { latitude: -4.8027, longitude: 11.85 }, [palmiers]);
    expect(r.presDIci.map((e) => e.id)).toEqual(['c1']);
    expect(memeEndroitPossible(r.presDIci[0]!)).toBe(false);
  });
  it('un nom fait de mots génériques ne rapproche jamais par le nom ; sans position, pas de « près d’ici »', () => {
    expect(rapprocher('Complexe scolaire', null, [palmiers])).toEqual({
      presDIci: [],
      memeNomAilleurs: [],
    });
    expect(rapprocher('Les Palmiers', null, [palmiers]).memeNomAilleurs).toHaveLength(1);
  });
  it('une école à plusieurs sites ne paraît qu’une fois dans « même nom, ailleurs »', () => {
    const autre = { ...palmiers, id: 'c2', position: { latitude: -4.2, longitude: 15.2 } };
    expect(rapprocher('Les Palmiers', null, [palmiers, autre]).memeNomAilleurs).toHaveLength(1);
  });
});

describe('chercher une école', () => {
  it('par son sigle ou son nom, jamais sur deux lettres', () => {
    expect(chercherUneEcole('cslp', [palmiers]).map((e) => e.id)).toEqual(['c1']);
    expect(chercherUneEcole('palmiers', [palmiers]).map((e) => e.id)).toEqual(['c1']);
    expect(chercherUneEcole('p', [palmiers])).toEqual([]);
  });
  it('la distance comme le relais la lit', () => {
    expect(distanceEnMots(1140)).toBe('à 1,1 km');
    expect(distanceEnMots(296)).toBe('à 300 m');
  });
});
