// « S'orienter » (refonte publique, lot 2) : les règles des six activités et des dix grands domaines, et les nombres que la
// page annonce. Chaque nombre doit valoir celui de la liste que son lien ouvre.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogueFaux } from '../../src/infra/faux/catalogue';
import { profilsDeLAccueil } from '../../src/modele/accueil';
import type { Valeur } from '../../src/modele/listes';
import {
  ACTIVITES,
  DOMAINES_SANS_GROUPE,
  GROUPES_DE_DOMAINES,
  PAUSE_ENTRE_DEUX_REPONSES_MS,
  dansUnePhrase,
  estFini,
  etatDeDepart,
  pistesDesReponses,
  repondre,
  type Reponse,
} from '../../src/modele/orientation';
import {
  DOMAINES_DE_L_ANNUAIRE,
  activitesDeLaPage,
  compterLaListe,
  formationsEtEcoles,
  groupesDeLaPage,
  niveauxDuParcours,
  offreDesDomaines,
  reponseCoursDuSoir,
} from '../../src/modele/orientation-catalogue';
import {
  lignesDeRecherche,
  type FormationRecherche,
  type LigneRecherche,
} from '../../src/modele/recherche';

// Les domaines de l'annuaire tels que la migration du catalogue les crée.
const migration = readFileSync('supabase/migrations/20261101200300_catalogue.sql', 'utf8');
const semis = migration.slice(migration.indexOf('insert into public.education_domains'));
const DOMAINES_DE_LA_BASE = Object.fromEntries(
  [...semis.slice(0, semis.indexOf(';')).matchAll(/\('([a-z-]+)', '((?:[^']|'')+)', \d+\)/g)].map(
    (m) => [m[1]!, m[2]!.replace(/''/g, '’')],
  ),
);

let n = 0;
function ligne(
  formations: Partial<FormationRecherche>[],
  cycles: Valeur<'niveau'>[] = ['superieur'],
): LigneRecherche {
  n += 1;
  return {
    i: `e${n}`,
    n: `École ${n}`,
    u: `/ecoles/ecole-${n}/`,
    d: 'Congo › Pointe-Noire',
    z: 'congo/pointe-noire',
    c: cycles,
    f: formations.map((f) => ({ c: 'superieur', t: 'Une formation', ...f })),
  };
}

describe('les dix groupes et les domaines de l’annuaire', () => {
  it('la copie des noms suit la migration du catalogue', () => {
    expect(Object.keys(DOMAINES_DE_LA_BASE)).toHaveLength(23);
    expect(DOMAINES_DE_L_ANNUAIRE).toEqual(DOMAINES_DE_LA_BASE);
  });

  it('chaque domaine de l’annuaire appartient à un seul groupe, sauf « Autre »', () => {
    const ranges = GROUPES_DE_DOMAINES.flatMap((g) => g.domaines);
    expect(new Set(ranges).size).toBe(ranges.length);
    expect([...ranges, ...DOMAINES_SANS_GROUPE].sort()).toEqual(
      Object.keys(DOMAINES_DE_LA_BASE).sort(),
    );
  });

  it('dix groupes, codés comme les grands domaines 01 à 10 de la CITE-F 2013', () => {
    expect(GROUPES_DE_DOMAINES.map((g) => g.code)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
    ]);
  });

  it('les six activités de la planche ne citent que des domaines de l’annuaire', () => {
    expect(ACTIVITES.map((a) => a.texte)).toHaveLength(6);
    for (const a of ACTIVITES)
      for (const d of a.domaines) expect(DOMAINES_DE_LA_BASE).toHaveProperty(d);
    expect(dansUnePhrase(ACTIVITES[0]!.texte)).toBe('réparer un téléphone qui ne charge plus');
  });
});

describe('les pistes des réponses', () => {
  const six = (r: Reponse): Reponse[] => Array.from({ length: 6 }, () => r);

  it('aucune activité aimée, même six « Je ne sais pas » : aucune piste', () => {
    expect(pistesDesReponses(six('peut'))).toEqual([]);
    expect(pistesDesReponses(six('non'))).toEqual([]);
    expect(pistesDesReponses([])).toEqual([]);
  });

  it('seuls les « J’aime » ouvrent des pistes, dans l’ordre des activités', () => {
    expect(pistesDesReponses(['oui', 'non', 'peut', 'non', 'non', 'oui'])).toEqual([
      { activite: 0, domaines: ['electricite-electronique', 'informatique'] },
      { activite: 5, domaines: ['secretariat-administration', 'gestion'] },
    ]);
  });

  it('un domaine n’apparaît qu’une fois : sous la première activité aimée qui y mène', () => {
    const activites = [{ domaines: ['a', 'b'] }, { domaines: ['b', 'c'] }, { domaines: ['a'] }];
    expect(pistesDesReponses(['oui', 'oui', 'oui'], activites)).toEqual([
      { activite: 0, domaines: ['a', 'b'] },
      { activite: 1, domaines: ['c'] },
      { activite: 2, domaines: [] },
    ]);
    expect(pistesDesReponses(['non', 'oui', 'oui'], activites)).toEqual([
      { activite: 1, domaines: ['b', 'c'] },
      { activite: 2, domaines: ['a'] },
    ]);
  });
});

describe('une réponse par geste', () => {
  it('six réponses, puis le résultat', () => {
    let etat = etatDeDepart();
    for (let q = 0; q < 6; q++) etat = repondre(etat, q, 'oui', 1000 * (q + 1));
    expect(etat.reponses).toEqual(['oui', 'oui', 'oui', 'oui', 'oui', 'oui']);
    expect(estFini(etat)).toBe(true);
    // Une septième réponse ne change rien.
    expect(repondre(etat, 6, 'non', 99_000)).toBe(etat);
  });

  it('un appui de trop, juste après une réponse, ne répond pas à la question suivante', () => {
    const premiere = repondre(etatDeDepart(), 0, 'oui', 10_000);
    expect(repondre(premiere, 1, 'oui', 10_000 + 40)).toBe(premiere);
    expect(repondre(premiere, 1, 'oui', 10_000 + PAUSE_ENTRE_DEUX_REPONSES_MS - 1)).toBe(premiere);
    expect(repondre(premiere, 1, 'peut', 10_000 + PAUSE_ENTRE_DEUX_REPONSES_MS).reponses).toEqual([
      'oui',
      'peut',
    ]);
  });

  it('une réponse ne vaut que pour la question affichée', () => {
    const premiere = repondre(etatDeDepart(), 0, 'non', 0);
    expect(repondre(premiere, 0, 'oui', 5_000)).toBe(premiere);
    expect(repondre(premiere, 2, 'oui', 5_000)).toBe(premiere);
    expect(repondre(etatDeDepart(), 1, 'oui', 0)).toEqual(etatDeDepart());
  });

  it('« Recommencer » repart de zéro', () => {
    expect(etatDeDepart()).toEqual({ reponses: [], depuis: null });
    expect(estFini(etatDeDepart())).toBe(false);
  });
});

describe('les nombres de la page valent ceux des listes', () => {
  it('un domaine sans formation : aucun lien', () => {
    expect(offreDesDomaines([ligne([{ m: 'gestion' }])], ['sante'])).toEqual({
      ecoles: 0,
      formations: 0,
      lien: null,
    });
    expect(offreDesDomaines([], ['sante'])).toEqual({ ecoles: 0, formations: 0, lien: null });
  });

  it('une école à plusieurs domaines d’un groupe ne compte qu’une fois ; ses formations, chacune', () => {
    const lignes = [
      ligne([{ m: 'btp' }, { m: 'electricite-electronique' }, { m: 'gestion' }]),
      ligne([{ m: 'btp' }]),
      ligne([{ m: 'informatique' }]),
    ];
    const offre = offreDesDomaines(lignes, [
      'btp',
      'electricite-electronique',
      'mecanique-maintenance',
    ]);
    // Le lien ne nomme que les domaines qui ont une formation : la liste n'affiche pas une puce cochée à 0.
    expect(offre).toEqual({
      ecoles: 2,
      formations: 3,
      lien: '/ecoles/?domaine=btp,electricite-electronique',
    });
    expect(compterLaListe(lignes, offre.lien!)).toBe(offre.ecoles);
    expect(formationsEtEcoles(offre)).toBe('3 formations · 2 écoles');
    expect(formationsEtEcoles({ formations: 1, ecoles: 1 }, ', ')).toBe('1 formation, 1 école');
  });

  it('le parcours : un niveau sans école n’a pas de lien ; le technique a le sien quand il existe', () => {
    const sans = niveauxDuParcours([ligne([], ['lycee'])]);
    expect(sans.L).toEqual({ ecoles: 1, lien: '/ecoles/?niveau=L' });
    expect(sans.T).toEqual({ ecoles: 0, lien: null });
    expect(sans.M).toEqual({ ecoles: 0, lien: null });
    const avec = niveauxDuParcours([ligne([], ['lycee', 'technique']), ligne([], ['technique'])]);
    expect(avec.T).toEqual({ ecoles: 2, lien: '/ecoles/?niveau=T' });
  });

  it('les cours du soir : zéro, une, plusieurs écoles, sans promesse', () => {
    expect(reponseCoursDuSoir([], '24 nov. 2026')).toBe(
      'Oui, c’est possible. Au 24 nov. 2026, aucune école de l’annuaire n’a encore de cours du soir documentés. Les conditions se demandent à chaque établissement.',
    );
    expect(reponseCoursDuSoir([ligne([{ y: ['soir'] }])], '24 nov. 2026')).toMatch(
      /^Oui\. 1 école de l’annuaire a des cours du soir documentés au 24 nov\. 2026\./,
    );
    expect(
      reponseCoursDuSoir(
        [ligne([{ y: ['soir'] }]), ligne([{ y: ['soir', 'jour'] }]), ligne([{ y: ['jour'] }])],
        '24 nov. 2026',
      ),
    ).toMatch(/^Oui\. 2 écoles de l’annuaire ont/);
  });

  it('sur le faux catalogue, chaque lien de la page ouvre une liste au nombre annoncé', async () => {
    const [ecoles, divisions, domaines] = await Promise.all([
      catalogueFaux.ecoles(),
      catalogueFaux.divisions(),
      catalogueFaux.domaines(),
    ]);
    const lignes = lignesDeRecherche(ecoles, divisions);
    for (const s of profilsDeLAccueil(ecoles))
      expect(`${compterLaListe(lignes, s.lien)} ${s.titre}`).toBe(
        `${Number.parseInt(s.compte, 10)} ${s.titre}`,
      );
    for (const g of groupesDeLaPage(lignes)) {
      if (!g.offre.lien) expect(g.offre.ecoles).toBe(0);
      else expect(compterLaListe(lignes, g.offre.lien)).toBe(g.offre.ecoles);
    }
    const activites = activitesDeLaPage(lignes, domaines);
    expect(activites).toHaveLength(6);
    for (const a of activites)
      for (const p of a.pistes)
        if (p.offre.lien) expect(compterLaListe(lignes, p.offre.lien)).toBe(p.offre.ecoles);
    // Au moins un groupe fourni et un groupe vide : les deux états de la page existent dans les parcours.
    expect(groupesDeLaPage(lignes).some((g) => g.offre.lien)).toBe(true);
    expect(groupesDeLaPage(lignes).some((g) => !g.offre.lien)).toBe(true);
  });

  it('le nom d’une piste vient du catalogue, sinon de l’annuaire', () => {
    const [premiere] = activitesDeLaPage(
      [],
      [{ slug: 'electricite-electronique', nom: 'Électricité', ordre: 70 }],
    );
    expect(premiere!.pistes.map((p) => [p.nom, p.offre.lien])).toEqual([
      ['Électricité', null],
      ['Informatique', null],
    ]);
  });
});
