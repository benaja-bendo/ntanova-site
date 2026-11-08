// Les formations que le relais coche sans clavier (audit de la fiche relais, 08/11/2026) : les intitulés produits par
// deux touchers, le plafond, les niveaux décochés, et la lecture qui ne plante jamais (un brouillon d'avant n'a pas la liste).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERIES_RAPIDES } from '../../src/modele/formations';
import {
  DIPLOMES_PAR_CYCLE,
  DOMAINES_RAPIDES,
  DOMAINES_VISIBLES,
  FORMATIONS_PAR_CYCLE_MAX,
  basculerFormation,
  basculerSerie,
  diplomesDuCycle,
  formationLibre,
  formationRapide,
  formationsDesNiveaux,
  lireFormationsVues,
  sansLesFormationsDuCycle,
  seriesCochees,
  titreDeFormation,
  versLaBase,
} from '../../src/modele/formations-rapides';
import { listes } from '../../src/modele/listes';

const RACINE = join(import.meta.dirname, '../..');

describe('les domaines du téléphone', () => {
  it('sont ceux de la base : un domaine semé qui manque au téléphone, ou l’inverse, se voit ici', () => {
    const dossier = join(RACINE, 'supabase/migrations');
    const semes = new Set<string>();
    for (const f of readdirSync(dossier).filter((n) => n.endsWith('.sql'))) {
      const sql = readFileSync(join(dossier, f), 'utf8');
      for (const bloc of sql.matchAll(
        /insert\s+into\s+public\.education_domains\s*\(slug[^)]*\)\s*values([\s\S]*?);/gi,
      )) {
        for (const ligne of (bloc[1] as string).matchAll(/\(\s*'([a-z0-9-]+)'\s*,/g)) {
          semes.add(ligne[1] as string);
        }
      }
    }
    expect(semes.size).toBeGreaterThan(15);
    expect([...DOMAINES_RAPIDES.map((d) => d.slug)].sort()).toEqual([...semes].sort());
  });

  it('se montrent par dix, le reste derrière « Plus de domaines » ; chaque mot court est unique', () => {
    expect(DOMAINES_VISIBLES).toBe(10);
    expect(DOMAINES_RAPIDES.length).toBeGreaterThan(DOMAINES_VISIBLES);
    const mots = DOMAINES_RAPIDES.map((d) => d.libelle);
    expect(new Set(mots).size).toBe(mots.length);
    // Ceux que le fondateur a cités le 08/11 se voient tout de suite.
    const visibles = DOMAINES_RAPIDES.slice(0, DOMAINES_VISIBLES).map((d) => d.slug);
    for (const s of ['gestion', 'informatique', 'droit', 'sante', 'btp']) {
      expect(visibles).toContain(s);
    }
  });

  it('les diplômes proposés et les séries sont des valeurs que la base connaît', () => {
    for (const diplomes of Object.values(DIPLOMES_PAR_CYCLE)) {
      for (const d of diplomes) expect(listes.diploma_kind).toContain(d);
    }
    for (const s of SERIES_RAPIDES) expect(listes.bac_track).toContain(s);
    expect(diplomesDuCycle('lycee')).toEqual([]);
    expect(diplomesDuCycle('superieur')).toContain('licence');
    expect(diplomesDuCycle('technique')).toContain('cap');
    expect(diplomesDuCycle('superieur')).not.toContain('cap');
  });
});

describe('deux touchers font une filière', () => {
  it('« BTS Gestion », « Licence Droit » ; un autre diplôme s’écrit « Formation … »', () => {
    expect(formationRapide('superieur', 'bts', 'gestion')).toEqual({
      cycle: 'superieur',
      titre: 'BTS Gestion',
      domaine: 'gestion',
      serie: null,
      diplome: 'bts',
      rythmes: [],
    });
    expect(formationRapide('superieur', 'licence', 'droit')?.titre).toBe('Licence Droit');
    expect(formationRapide('technique', 'autre', 'btp')?.titre).toBe('Formation BTP');
    expect(formationRapide('superieur', 'bts', 'autre')?.titre).toBe('BTS Autre domaine');
    expect(formationRapide('superieur', 'bts', 'domaine-inconnu')).toBeNull();
    const gestion = DOMAINES_RAPIDES.find((d) => d.slug === 'gestion');
    expect(titreDeFormation('master', gestion!)).toBe('Master Gestion');
  });

  it('« Autre filière… » : un texte court, avec le diplôme en cours ; vide ou trop long, rien', () => {
    expect(formationLibre('technique', 'cap', '  Pâtisserie ')?.titre).toBe('CAP Pâtisserie');
    expect(formationLibre('technique', null, 'Cuisine')).toEqual({
      cycle: 'technique',
      titre: 'Cuisine',
      domaine: null,
      serie: null,
      diplome: null,
      rythmes: [],
    });
    expect(formationLibre('technique', 'cap', '   ')).toBeNull();
    expect(formationLibre('technique', null, 'x'.repeat(161))).toBeNull();
  });

  it('un toucher ajoute, le même toucher retire (à l’accent et à la casse près)', () => {
    const bts = formationRapide('superieur', 'bts', 'gestion')!;
    const une = basculerFormation([], bts);
    expect(une).toHaveLength(1);
    expect(basculerFormation(une, { ...bts, titre: 'bts gestion' })).toEqual([]);
    // Un même titre dans un autre cycle est une autre filière.
    expect(basculerFormation(une, { ...bts, cycle: 'technique' })).toHaveLength(2);
  });

  it(`vingt filières au plus par cycle ; retirer reste possible au plafond`, () => {
    let liste = [] as ReturnType<typeof basculerFormation>;
    for (let i = 0; i < FORMATIONS_PAR_CYCLE_MAX + 5; i++) {
      liste = basculerFormation(liste, formationLibre('superieur', 'licence', `Filière ${i}`)!);
    }
    expect(liste).toHaveLength(FORMATIONS_PAR_CYCLE_MAX);
    // Un autre cycle a son propre plafond.
    expect(basculerFormation(liste, formationRapide('technique', 'cap', 'btp')!)).toHaveLength(
      FORMATIONS_PAR_CYCLE_MAX + 1,
    );
    expect(basculerFormation(liste, liste[0]!)).toHaveLength(FORMATIONS_PAR_CYCLE_MAX - 1);
  });
});

describe('les séries du lycée', () => {
  it('une série touchée devient « Série C » (baccalauréat), la même touchée deux fois disparaît', () => {
    const une = basculerSerie([], 'c');
    expect(une).toEqual([
      { cycle: 'lycee', titre: 'Série C', domaine: null, serie: 'c', diplome: 'bac', rythmes: [] },
    ]);
    expect(basculerSerie(une, 'c')).toEqual([]);
  });

  it('les séries cochées se relisent dans l’ordre de la liste, quel que soit l’ordre des touchers', () => {
    let liste = basculerSerie([], 'g2');
    liste = basculerSerie(liste, 'c');
    liste = basculerSerie(liste, 'd');
    expect(seriesCochees(liste)).toEqual(['c', 'd', 'g2']);
  });
});

describe('décocher un niveau', () => {
  const lycee = basculerSerie([], 'c');
  const liste = basculerFormation(lycee, formationRapide('superieur', 'bts', 'gestion')!);

  it('ses filières partent avec lui', () => {
    expect(sansLesFormationsDuCycle(liste, 'lycee').map((f) => f.titre)).toEqual(['BTS Gestion']);
    expect(sansLesFormationsDuCycle(liste, 'superieur').map((f) => f.titre)).toEqual(['Série C']);
  });

  it('l’envoi ne garde que les filières d’un niveau coché : la base refuserait d’accepter une filière orpheline', () => {
    expect(formationsDesNiveaux(liste, ['lycee']).map((f) => f.titre)).toEqual(['Série C']);
    expect(formationsDesNiveaux(liste, ['primaire', 'college'])).toEqual([]);
    expect(formationsDesNiveaux(liste, ['lycee', 'superieur'])).toHaveLength(2);
  });
});

describe('lire ce qui vient du téléphone ou de la base ne plante jamais', () => {
  it('rien, ou autre chose qu’une liste : une liste vide (un brouillon d’avant n’a pas le champ)', () => {
    for (const v of [undefined, null, '', 'texte', 3, {}, { cycle: 'lycee' }]) {
      expect(lireFormationsVues(v)).toEqual([]);
    }
  });

  it('laisse de côté une ligne illisible, un cycle sans formations, un titre vide ou trop long', () => {
    const lues = lireFormationsVues([
      null,
      'x',
      42,
      { cycle: 'primaire', titre: 'Primaire' },
      { cycle: 'lycee', titre: '   ' },
      { cycle: 'lycee', titre: 'x'.repeat(161) },
      { cycle: 'cycle-inconnu', titre: 'Autre chose' },
      { cycle: 'lycee', titre: 'Série C', serie: 'c', diplome: 'bac' },
    ]);
    expect(lues.map((f) => f.titre)).toEqual(['Série C']);
  });

  it('une valeur que cette version ne connaît pas devient « non indiqué », jamais une erreur', () => {
    const [f] = lireFormationsVues([
      {
        cycle: 'superieur',
        titre: 'Master Données',
        serie: 'z9',
        diplome: 'diplome-futur',
        domaine: 'robotique',
      },
    ]);
    expect(f).toEqual({
      cycle: 'superieur',
      titre: 'Master Données',
      domaine: null,
      serie: null,
      diplome: null,
      rythmes: [],
    });
  });

  it('ne garde pas deux fois la même filière, ni plus de vingt par cycle, ni un cycle décoché', () => {
    const doublons = lireFormationsVues([
      { cycle: 'superieur', titre: 'BTS Gestion' },
      { cycle: 'superieur', titre: 'bts  gestion' },
    ]);
    expect(doublons).toHaveLength(1);
    const beaucoup = Array.from({ length: 30 }, (_, i) => ({
      cycle: 'technique',
      titre: `CAP ${i}`,
    }));
    expect(lireFormationsVues(beaucoup)).toHaveLength(FORMATIONS_PAR_CYCLE_MAX);
    const melange = [
      { cycle: 'lycee', titre: 'Série C' },
      { cycle: 'superieur', titre: 'BTS Gestion' },
    ];
    expect(lireFormationsVues(melange, ['lycee']).map((f) => f.titre)).toEqual(['Série C']);
  });

  it('ce que le relais envoie est exactement la forme que la base garde', () => {
    const bts = formationRapide('superieur', 'bts', 'gestion')!;
    expect(versLaBase([bts])).toEqual([
      { cycle: 'superieur', titre: 'BTS Gestion', serie: null, diplome: 'bts', domaine: 'gestion' },
    ]);
    // Aller-retour : ce qui part se relit à l'identique.
    expect(lireFormationsVues(versLaBase([bts]))).toEqual([bts]);
  });
});
