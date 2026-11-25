// Les statistiques ouvertes de la page « Données » (ticket 149) : des nombres et des dates, jamais un pourcentage, sans rien
// de privé, calculées à la construction et datées de cette construction. Lot 4 de la refonte (24/11/2026) : les mentions se
// comptent côte à côte, plus « à la preuve la plus forte » ; trois dates distinctes (construction, mentions, modification).
import { describe, expect, it } from 'vitest';
import type { PageDivision } from '../../src/modele/geo-divisions';
import type { EcolePubliee } from '../../src/modele/ports';
import { statistiquesOuvertes } from '../../src/modele/statistiques-ouvertes';

type Maquette = Partial<EcolePubliee> & { id: string };

const ecole = (m: Maquette): EcolePubliee =>
  ({
    niveaux: ['primaire'],
    etat: 'relevee',
    origine: 'field',
    verifieeLe: null,
    releveeLe: null,
    situeeLe: null,
    declareeLe: null,
    misAJourLe: '2026-11-01T08:00:00Z',
    photo: null,
    agrement: null,
    formations: [],
    ...m,
  }) as unknown as EcolePubliee;

const lieu = (
  nom: string,
  chemin: string[],
  ecoles: EcolePubliee[],
  enfants: PageDivision[] = [],
): PageDivision =>
  ({
    division: { nom, niveau: chemin.length + 1 },
    chemin,
    ecoles,
    enfants,
  }) as unknown as PageDivision;

const a = ecole({
  id: 'a',
  niveaux: ['maternelle', 'primaire', 'college'],
  releveeLe: '2026-11-06T09:00:00Z',
  misAJourLe: '2026-11-06T09:30:00Z',
});
const b = ecole({ id: 'b', niveaux: ['lycee'], releveeLe: '2026-11-02T23:30:00Z' });
const c = ecole({
  id: 'c',
  niveaux: ['superieur'],
  etat: 'verifiee',
  verifieeLe: '2026-11-07',
  releveeLe: '2026-11-03T10:00:00Z',
  photo: {} as NonNullable<EcolePubliee['photo']>,
  agrement: { reference: '[arrêté n° exemple]' } as unknown as NonNullable<
    EcolePubliee['agrement']
  >,
});
const d = ecole({ id: 'd', origine: 'school', declareeLe: '2026-11-05', niveaux: ['technique'] });
const e = ecole({ id: 'e', situeeLe: '2026-11-04T10:00:00Z', niveaux: [] });
const ecoles = [a, b, c, d, e];

const ngoyo = lieu('Ngoyo', ['pointe-noire', 'ngoyo'], [a, b]);
const loandjili = lieu('Loandjili', ['pointe-noire', 'loandjili'], [c, d]);
const tieTie = lieu('Tié-Tié', ['pointe-noire', 'tie-tie'], []);
const pointeNoire = lieu('Pointe-Noire', ['pointe-noire'], [e], [ngoyo, loandjili, tieTie]);
const brazzaville = lieu('Brazzaville', ['brazzaville'], []);
const pays = lieu('Congo', [], [], [pointeNoire, brazzaville]);

const construiteLe = new Date('2026-11-08T20:00:00Z');
const stats = statistiquesOuvertes({ racines: [pays], ecoles, construiteLe });

describe('les statistiques ouvertes', () => {
  it('comptent les fiches publiées, sans jamais calculer de pourcentage', () => {
    expect(stats.fiches).toBe(5);
    expect(JSON.stringify(stats)).not.toMatch(/%|pourcent/i);
  });

  it('listent les lieux qui ont au moins une fiche, la ville avec ce qu’elle contient, jamais le pays ni un lieu vide', () => {
    expect(stats.lieux).toEqual([
      { nom: 'Pointe-Noire', lien: '/ecoles/pointe-noire/', profondeur: 1, fiches: 5 },
      { nom: 'Ngoyo', lien: '/ecoles/pointe-noire/ngoyo/', profondeur: 2, fiches: 2 },
      { nom: 'Loandjili', lien: '/ecoles/pointe-noire/loandjili/', profondeur: 2, fiches: 2 },
    ]);
  });

  it('compte les fiches par cycle (une fiche compte dans chaque cycle qu’elle enseigne) et laisse de côté un cycle sans fiche', () => {
    const parCycle = Object.fromEntries(stats.parCycle.map((x) => [x.niveau, x.fiches]));
    expect(parCycle).toEqual({
      maternelle: 1,
      primaire: 1,
      college: 1,
      lycee: 1,
      technique: 1,
      superieur: 1,
    });
    expect(stats.parCycle.map((x) => x.niveau)).toEqual([
      'maternelle',
      'primaire',
      'college',
      'lycee',
      'technique',
      'superieur',
    ]);
  });

  it('compte les fiches par mention, les quatre toujours, même à zéro : une fiche vue puis confirmée compte dans les deux', () => {
    // c est vue sur place le 3 et confirmée le 7 : elle compte dans les deux. d est déclarée, e ajoutée.
    expect(stats.mentions.parMention).toEqual([
      { mention: 'relevee', libelle: 'Vue sur place', fiches: 3 },
      { mention: 'declaree', libelle: 'Déclarée par l’école', fiches: 1 },
      { mention: 'ajoutee', libelle: 'Ajoutée par NTanova', fiches: 1 },
      { mention: 'verifiee', libelle: 'Confirmée par la direction', fiches: 1 },
    ]);
    expect(stats.mentions.confirmeesEtVues).toBe(1);
    const somme = stats.mentions.parMention.reduce((n, m) => n + m.fiches, 0);
    expect(somme).toBeGreaterThan(stats.fiches);
    const sansConfirmee = statistiquesOuvertes({ racines: [pays], ecoles: [a, b], construiteLe });
    expect(sansConfirmee.mentions.parMention[3]).toEqual({
      mention: 'verifiee',
      libelle: 'Confirmée par la direction',
      fiches: 0,
    });
    expect(JSON.stringify(stats)).not.toMatch(/plus forte|plus faible/);
  });

  it('date chaque mention à l’heure du Congo, compte une fiche à chacun de ses jours, et laisse sans date ce qui n’en a pas', () => {
    // b : passage le 2 novembre à 23 h 30 UTC = le 3 novembre à 0 h 30 à Brazzaville ; a : le 6 ; c : passage le 3 et accord le 7
    // (deux jours) ; d : déclarée le 5 ; e : ajoutée, sans date de mention (le jour où l'équipe l'a située n'en est pas une).
    expect(stats.parJour).toEqual([
      { jour: '2026-11-07', fiches: 1 },
      { jour: '2026-11-06', fiches: 1 },
      { jour: '2026-11-05', fiches: 1 },
      { jour: '2026-11-03', fiches: 2 },
    ]);
    expect(
      stats.datesDesMentions.map((d) => [d.mention, d.laPlusAncienne, d.laPlusRecente]),
    ).toEqual([
      ['relevee', '2026-11-03', '2026-11-06'],
      ['declaree', '2026-11-05', '2026-11-05'],
      ['verifiee', '2026-11-07', '2026-11-07'],
    ]);
    expect(stats.sansMentionDatee).toBe(1);
  });

  it('dit combien de fiches ont une photo publique ou citent une référence officielle', () => {
    expect(stats.avecPhoto).toBe(1);
    expect(stats.avecReference).toBe(1);
  });

  it('compte comme photo publique la couverture et la galerie, pas seulement l’enseigne (lot 4)', () => {
    const media = { id: 'm', sujet: 'batiment', legende: null, prisLe: null } as const;
    const avecCouverture = ecole({
      id: 'f',
      medias: { logo: null, couverture: media, galerie: [] },
    });
    const avecGalerie = ecole({
      id: 'g',
      medias: { logo: null, couverture: null, galerie: [media] },
    });
    const logoSeul = ecole({ id: 'h', medias: { logo: media, couverture: null, galerie: [] } });
    const s2 = statistiquesOuvertes({
      racines: [],
      ecoles: [avecCouverture, avecGalerie, logoSeul],
      construiteLe,
    });
    expect(s2.avecPhoto).toBe(2);
  });

  it('dit le jour de la dernière modification et le jour de la construction, à l’heure du Congo', () => {
    expect(stats.derniereMiseAJour).toBe('2026-11-06');
    expect(stats.construiteLe).toBe('2026-11-08');
    const tard = statistiquesOuvertes({
      racines: [pays],
      ecoles,
      construiteLe: new Date('2026-11-08T23:30:00Z'),
    });
    expect(tard.construiteLe).toBe('2026-11-09');
  });

  it('ne dit rien d’un catalogue vide, sans casser', () => {
    const vide = statistiquesOuvertes({ racines: [], ecoles: [], construiteLe });
    expect(vide.fiches).toBe(0);
    expect(vide.lieux).toEqual([]);
    expect(vide.parCycle).toEqual([]);
    expect(vide.parJour).toEqual([]);
    expect(vide.mentions.parMention.map((m) => m.fiches)).toEqual([0, 0, 0, 0]);
    expect(vide.datesDesMentions.every((d) => d.laPlusRecente === null)).toBe(true);
    expect(vide.sansMentionDatee).toBe(0);
    expect(vide.derniereMiseAJour).toBeNull();
  });

  it('n’emporte rien de privé : ni identifiant, ni nom d’école, ni numéro, ni position', () => {
    const brut = JSON.stringify(
      statistiquesOuvertes({
        racines: [pays],
        ecoles: ecoles.map((x) => ({
          ...x,
          nom: '[Nom privé exemple]',
          numeroEnseigne: '242060000001',
          latitude: -4.79,
        })),
        construiteLe,
      }),
    );
    expect(brut).not.toMatch(/Nom privé|060000001|-4\.79/);
  });
});
