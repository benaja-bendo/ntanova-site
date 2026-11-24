// Les mentions datées (refonte publique, lot 4, 24/11/2026) : une grammaire pour la fiche, la démonstration, Fiabilité et
// Données. Elles coexistent, chacune avec sa date ; aucune n'est « la plus forte » ; une date absente reste absente.
import { describe, expect, it } from 'vitest';
import {
  LIEN_MENTIONS,
  ORDRE_DES_MENTIONS,
  SENS_DES_MENTIONS,
  compterLesMentions,
  datesDesMentions,
  fichesParJourDeMention,
  fichesSansMentionDatee,
  mentionsDe,
  phraseDesMentions,
} from '../../src/modele/mentions';
import { libelleProvenance } from '../../src/modele/libelles';
import { preuvesDeLaFiche } from '../../src/modele/presentation-fiche';
import type { EcolePubliee } from '../../src/modele/ports';

type Fiche = Pick<
  EcolePubliee,
  'etat' | 'origine' | 'verifieeLe' | 'releveeLe' | 'declareeLe' | 'situeeLe'
>;
const fiche = (f: Partial<Fiche> = {}): Fiche => ({
  etat: 'relevee',
  origine: 'field',
  verifieeLe: null,
  releveeLe: null,
  declareeLe: null,
  situeeLe: null,
  ...f,
});

const vue = fiche({ releveeLe: '2026-11-12T09:00:00Z' });
// Vue sur place le 12, puis confirmée par la direction le 18 : les deux mentions, chacune avec sa date.
const vuePuisConfirmee = fiche({
  releveeLe: '2026-11-12T09:00:00Z',
  etat: 'verifiee',
  verifieeLe: '2026-11-18T10:00:00Z',
});
const declaree = fiche({ origine: 'school', declareeLe: '2026-11-05' });
const declareeSansDate = fiche({ origine: 'school' });
const ajoutee = fiche({ origine: 'admin', situeeLe: '2026-11-04T10:00:00Z' });

describe('les mentions d’une fiche', () => {
  it('coexistent, chacune avec son jour, dans l’ordre de lecture', () => {
    expect(mentionsDe(vuePuisConfirmee)).toEqual([
      { mention: 'relevee', libelle: 'Vue sur place', jour: '2026-11-12' },
      { mention: 'verifiee', libelle: 'Confirmée par la direction', jour: '2026-11-18' },
    ]);
    // Déclarée puis vue : la déclaration ne disparaît pas.
    expect(
      mentionsDe({ ...declaree, releveeLe: '2026-11-20T08:00:00Z' }).map((m) => m.mention),
    ).toEqual(['relevee', 'declaree']);
  });

  it('se datent à l’heure du Congo et ne déduisent jamais un jour absent', () => {
    // 23 h 30 UTC le 2 novembre : le 3 novembre à Brazzaville.
    expect(mentionsDe(fiche({ releveeLe: '2026-11-02T23:30:00Z' }))[0]?.jour).toBe('2026-11-03');
    expect(mentionsDe(declareeSansDate)).toEqual([
      { mention: 'declaree', libelle: 'Déclarée par l’école', jour: null },
    ]);
    // « Ajoutée par NTanova » n'a pas de date sur la fiche : le jour où l'équipe l'a située n'en devient pas une.
    expect(mentionsDe(ajoutee)).toEqual([
      { mention: 'ajoutee', libelle: 'Ajoutée par NTanova', jour: null },
    ]);
  });

  it('disent la même chose que les pastilles de la fiche', () => {
    for (const f of [vue, vuePuisConfirmee, declaree, declareeSansDate, ajoutee]) {
      const pastilles = preuvesDeLaFiche(f).map((p) => p.texte);
      for (const m of mentionsDe(f))
        expect(pastilles.some((p) => p.startsWith(m.libelle))).toBe(true);
    }
  });

  it('s’expliquent toutes, sans hiérarchie, et renvoient à une ancre de Fiabilité', () => {
    expect([...ORDRE_DES_MENTIONS].sort()).toEqual(Object.keys(libelleProvenance).sort());
    const textes = Object.values(SENS_DES_MENTIONS).join(' ');
    expect(textes).not.toMatch(/plus (forte|faible)|note|classement/i);
    // La base ne garde pas la source d'une fiche ajoutée : aucune mention n'en promet une.
    expect(textes).not.toMatch(/source|document/i);
    expect(LIEN_MENTIONS).toBe('/methode/#m-mentions');
  });
});

describe('les comptes des mentions', () => {
  it('une fiche vue sur place puis confirmée compte dans les deux mentions', () => {
    const c = compterLesMentions([vuePuisConfirmee]);
    expect(c.fiches).toBe(1);
    expect(Object.fromEntries(c.parMention.map((m) => [m.mention, m.fiches]))).toEqual({
      relevee: 1,
      declaree: 0,
      ajoutee: 0,
      verifiee: 1,
    });
    expect(c.confirmeesEtVues).toBe(1);
    expect(phraseDesMentions(c)).toBe(
      '1 fiche vue sur place, 1 confirmée par sa direction, qui est aussi vue sur place',
    );
  });

  it('les lignes ne s’additionnent pas : leur somme dépasse le nombre de fiches', () => {
    const ecoles = [vue, vuePuisConfirmee, declaree, ajoutee, fiche({ etat: 'verifiee' })];
    const c = compterLesMentions(ecoles);
    const somme = c.parMention.reduce((n, m) => n + m.fiches, 0);
    expect(somme).toBeGreaterThan(c.fiches);
    expect(c.parMention.map((m) => m.fiches)).toEqual([2, 1, 2, 2]);
    expect(phraseDesMentions(c)).toBe(
      '2 fiches vues sur place, 1 déclarée par l’école, 2 ajoutées par NTanova, 2 confirmées par leur direction, dont 1 aussi vue sur place',
    );
  });

  it('ne disent rien d’un annuaire vide, sans casser', () => {
    const c = compterLesMentions([]);
    expect(c.parMention.map((m) => m.fiches)).toEqual([0, 0, 0, 0]);
    expect(phraseDesMentions(c)).toBeNull();
    expect(datesDesMentions([]).every((d) => d.fiches === 0 && d.laPlusRecente === null)).toBe(
      true,
    );
    expect(fichesParJourDeMention([])).toEqual([]);
    expect(fichesSansMentionDatee([])).toBe(0);
  });
});

describe('les dates des mentions', () => {
  const ecoles = [vue, vuePuisConfirmee, declaree, declareeSansDate, ajoutee];

  it('donnent, pour chaque mention datée, la plus ancienne, la plus récente et les fiches sans jour', () => {
    expect(datesDesMentions(ecoles)).toEqual([
      {
        mention: 'relevee',
        libelle: 'Vue sur place',
        fiches: 2,
        laPlusRecente: '2026-11-12',
        laPlusAncienne: '2026-11-12',
        sansDate: 0,
      },
      {
        mention: 'declaree',
        libelle: 'Déclarée par l’école',
        fiches: 2,
        laPlusRecente: '2026-11-05',
        laPlusAncienne: '2026-11-05',
        sansDate: 1,
      },
      {
        mention: 'verifiee',
        libelle: 'Confirmée par la direction',
        fiches: 1,
        laPlusRecente: '2026-11-18',
        laPlusAncienne: '2026-11-18',
        sansDate: 0,
      },
    ]);
  });

  it('comptent une fiche à chacun de ses jours de mention, une seule fois par jour', () => {
    const memeJour = fiche({
      releveeLe: '2026-11-18T07:00:00Z',
      etat: 'verifiee',
      verifieeLe: '2026-11-18T15:00:00Z',
    });
    expect(fichesParJourDeMention([...ecoles, memeJour])).toEqual([
      { jour: '2026-11-18', fiches: 2 },
      { jour: '2026-11-12', fiches: 2 },
      { jour: '2026-11-05', fiches: 1 },
    ]);
    // La fiche ajoutée et la déclaration sans jour n'ont aucune mention datée.
    expect(fichesSansMentionDatee(ecoles)).toBe(2);
  });
});
