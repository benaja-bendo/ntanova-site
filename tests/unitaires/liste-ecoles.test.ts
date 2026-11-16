// Lot 4 bis (16/11/2026) : « Les écoles », l'état dans l'adresse, les filtres pilotés par les données et leurs compteurs.
import { describe, expect, it } from 'vitest';
import {
  ecrireEtat,
  etatVide,
  filtrer,
  groupesAffiches,
  lireEtat,
  nombreDeFiltres,
  rayonsComptes,
  sortiesDuVide,
  titreDeLaListe,
} from '../../src/modele/liste-ecoles';
import type { LigneRecherche } from '../../src/modele/recherche';

const ligne = (
  x: Partial<LigneRecherche> & { i: string; z: string; d: string; vue?: boolean },
): LigneRecherche => {
  const { vue = true, ...reste } = x;
  return {
    n: `École ${x.i}`,
    u: `/ecoles/${x.i}/`,
    c: ['primaire'],
    f: [],
    ...(vue ? { o: 1 as const } : {}),
    k: 'privee',
    ...reste,
  };
};
const PN = 'congo/pointe-noire';
const NPN = 'Congo › Pointe-Noire';
const LIGNES: LigneRecherche[] = [
  ligne({
    i: 'a',
    z: `${PN}/loandjili`,
    d: `${NPN} › Loandjili`,
    la: -4.79,
    lo: 11.86,
    t: '2026-11-06',
  }),
  ligne({
    i: 'b',
    z: `${PN}/loandjili`,
    d: `${NPN} › Loandjili`,
    c: ['college', 'lycee'],
    f: [
      { c: 'lycee', t: 'Bac C', s: 'c' },
      { c: 'lycee', t: 'Bac D', s: 'd' },
    ],
    t: '2026-11-09',
  }),
  ligne({ i: 'c', z: `${PN}/ngoyo`, d: `${NPN} › Ngoyo`, t: '2026-11-04', si: 'GSSJ' }),
  ligne({
    i: 'd',
    z: 'congo/brazzaville/bacongo',
    d: 'Congo › Brazzaville › Bacongo',
    k: 'publique',
    vue: false,
  }),
];

describe('l’adresse de la page', () => {
  it('se lit et s’écrit sans perte, les valeurs par défaut absentes', () => {
    const etat = lireEtat(
      new URLSearchParams('q=lycee&ville=pointe-noire&niveau=L,S&tri=nom&vue=carte&rayon=3000'),
    );
    expect(etat.choix.niveau).toEqual(['L', 'S']);
    expect(ecrireEtat(etat)).toBe(
      '?q=lycee&ville=pointe-noire&niveau=L%2CS&rayon=3000&tri=nom&vue=carte',
    );
    expect(ecrireEtat(lireEtat(new URLSearchParams(ecrireEtat(etat))))).toBe(ecrireEtat(etat));
    expect(ecrireEtat(etatVide())).toBe('');
  });

  it('comprend les anciennes adresses : zone, nom de niveau, cycle, autour', () => {
    const etat = lireEtat(
      new URLSearchParams('zone=congo/pointe-noire/ngoyo&niveau=primaire&cycle=C&autour=3'),
    );
    expect(etat.choix.ville).toEqual(['pointe-noire']);
    expect(etat.choix.arrondissement).toEqual(['ngoyo']);
    expect(etat.choix.niveau).toEqual(['P', 'C']);
    expect(etat.rayonM).toBe(3000);
    expect(nombreDeFiltres(etat)).toBe(5);
  });
});

describe('filtrer et trier', () => {
  it('vues sur place d’abord, la plus récente en tête', () => {
    expect(filtrer(LIGNES, etatVide()).map((t) => t.ligne.i)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('deux choix d’un groupe s’additionnent, deux groupes se croisent', () => {
    const etat = lireEtat(new URLSearchParams('ville=pointe-noire,brazzaville&type=publique'));
    expect(filtrer(LIGNES, etat).map((t) => t.ligne.i)).toEqual(['d']);
  });

  it('cherche aussi le sigle', () => {
    expect(filtrer(LIGNES, { ...etatVide(), q: 'gssj' }).map((t) => t.ligne.i)).toEqual(['c']);
  });

  it('« Près de moi » sans position retombe sur « Récemment vues »', () => {
    expect(filtrer(LIGNES, { ...etatVide(), tri: 'proches' }).map((t) => t.ligne.i)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });
});

describe('les options des filtres', () => {
  it('chaque option dit combien d’écoles elle donnerait, selon les autres choix', () => {
    const etat = lireEtat(new URLSearchParams('ville=pointe-noire'));
    const groupes = groupesAffiches(LIGNES, etat);
    const ville = groupes.find((g) => g.groupe === 'ville')!;
    expect(ville.options.map((o) => [o.libelle, o.nombre, o.choisie])).toEqual([
      ['Pointe-Noire', 3, true],
      ['Brazzaville', 1, false],
    ]);
    const arr = groupes.find((g) => g.groupe === 'arrondissement')!;
    expect(arr.options.map((o) => [o.libelle, o.nombre])).toEqual([
      ['Loandjili', 2],
      ['Ngoyo', 1],
    ]);
  });

  it('cache un groupe qui ne trie rien : Type à Pointe-Noire (toutes privées)', () => {
    const groupes = groupesAffiches(LIGNES, lireEtat(new URLSearchParams('ville=pointe-noire')));
    expect(groupes.map((g) => g.groupe)).not.toContain('type');
    expect(groupesAffiches(LIGNES, etatVide()).map((g) => g.groupe)).toContain('type');
  });

  it('une option cochée qui tombe à 0 reste, pour pouvoir revenir en arrière', () => {
    const etat = lireEtat(new URLSearchParams('ville=brazzaville&serie=c'));
    const serie = groupesAffiches(LIGNES, etat).find((g) => g.groupe === 'serie')!;
    expect(serie.options).toEqual([
      { valeur: 'c', libelle: expect.any(String), nombre: 0, choisie: true },
    ]);
  });

  it('une option à 0 non cochée disparaît ; l’arrondissement attend une seule ville', () => {
    const groupes = groupesAffiches(LIGNES, lireEtat(new URLSearchParams('niveau=L')));
    expect(groupes.find((g) => g.groupe === 'niveau')!.options.map((o) => o.valeur)).toEqual([
      'P',
      'C',
      'L',
    ]);
    expect(groupes.map((g) => g.groupe)).not.toContain('arrondissement');
  });

  it('les rayons se comptent autour de la position', () => {
    const r = rayonsComptes(LIGNES, etatVide(), { latitude: -4.79, longitude: 11.86 });
    expect(r.map((x) => x.nombre)).toEqual([1, 1, 1]);
  });
});

describe('les mots de la page', () => {
  it('le titre dit ce qu’on a cherché', () => {
    expect(
      titreDeLaListe(lireEtat(new URLSearchParams('ville=pointe-noire&niveau=P')), LIGNES),
    ).toBe('Écoles primaires à Pointe-Noire');
    expect(titreDeLaListe(lireEtat(new URLSearchParams('niveau=L,S')), LIGNES)).toBe(
      'Lycées et supérieur',
    );
    expect(titreDeLaListe(etatVide(), LIGNES)).toBe('Les écoles');
  });

  it('un résultat vide propose des sorties, la plus utile d’abord', () => {
    const etat = lireEtat(new URLSearchParams('ville=brazzaville&niveau=L'));
    const sorties = sortiesDuVide(LIGNES, etat, null);
    expect(sorties.map((s) => [s.libelle, s.nombre])).toEqual([
      ['Retirer Brazzaville', 1],
      ['Retirer Lycée', 1],
    ]);
  });
});
