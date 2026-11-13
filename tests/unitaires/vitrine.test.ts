// La fiche d'une école, v2 (13/11) : ce qu'elle écrit, et surtout ce qu'elle tait (aucun bloc vide, aucune date passée).
import { describe, expect, it } from 'vitest';
import type { FraisEcole } from '../../src/modele/frais-ecole';
import type { EcolePubliee } from '../../src/modele/ports';
import {
  admissionAMontrer,
  calendrierAMontrer,
  decaler,
  dossiersOuverts,
  ficheCourte,
  inscriptionDesFrais,
  libelleLigneDeFrais,
  ligneDIdentite,
  lignesDeFraisDeLEcole,
  nouvellesAMontrer,
  rondDeLEcole,
  rubriquesDeLaFiche,
  siteWebLisible,
  sourceDesFrais,
  surtitreNouvelle,
  type AdmissionPublique,
  type NouvellePublique,
} from '../../src/modele/vitrine';

const JOUR = '2026-11-13';
const media = { id: 'm1', sujet: 'logo' as const, legende: null, prisLe: null };

describe('le rond de l’école', () => {
  it('son logo d’abord, puis son sigle, puis la lettre de son cycle le plus élevé, sinon rien', () => {
    expect(
      rondDeLEcole({
        medias: { logo: media, couverture: null, galerie: [] },
        sigle: 'GSE',
        niveaux: [],
      }),
    ).toEqual({ genre: 'logo', media });
    expect(rondDeLEcole({ sigle: ' GSE ', niveaux: ['primaire'] })).toEqual({
      genre: 'sigle',
      texte: 'GSE',
    });
    expect(rondDeLEcole({ sigle: '', niveaux: ['maternelle', 'college'] })).toEqual({
      genre: 'cycle',
      lettre: 'C',
    });
    expect(rondDeLEcole({ niveaux: [] })).toEqual({ genre: 'vide' });
  });
});

describe('la ligne sous le nom', () => {
  it('chaque morceau absent disparaît, sans point ni crochet', () => {
    const e = {
      etiquette: 'Site 1',
      niveaux: ['maternelle', 'primaire', 'college'] as EcolePubliee['niveaux'],
      sigle: 'CSLP',
      fondeeEn: 2012,
    };
    expect(ligneDIdentite(e, 2)).toBe('Site 1 · Maternelle à collège · CSLP · depuis 2012');
    expect(ligneDIdentite(e, 1)).toBe('Maternelle à collège · CSLP · depuis 2012');
    expect(ligneDIdentite({ etiquette: null, niveaux: [], sigle: null, fondeeEn: null }, 1)).toBe(
      '',
    );
    expect(
      ligneDIdentite({ etiquette: null, niveaux: ['primaire'], sigle: null, fondeeEn: null }, 1),
    ).toBe('Primaire');
  });
  it('le site web se lit sans https ni barre finale', () => {
    expect(siteWebLisible('https://exemple.cg/')).toBe('exemple.cg');
  });
});

const nouvelle = (
  id: string,
  genre: NouvellePublique['genre'],
  jours: number,
): NouvellePublique => ({
  id,
  genre,
  titre: id,
  texte: '…',
  publieeLe: decaler(JOUR, jours),
  fournieParLEcole: true,
  media: null,
});

describe('les nouvelles', () => {
  it('les trois plus récentes ; un événement de plus de 60 jours sort ; une date à venir n’est pas encore là', () => {
    const n = [
      nouvelle('a', 'vie_ecole', -100),
      nouvelle('b', 'evenement', -90),
      nouvelle('c', 'evenement', -5),
      nouvelle('d', 'autre', -1),
      nouvelle('e', 'inscriptions', -30),
      nouvelle('f', 'autre', 3),
    ];
    expect(nouvellesAMontrer(n, JOUR).map((x) => x.id)).toEqual(['d', 'c', 'e']);
    expect(nouvellesAMontrer([nouvelle('a', 'vie_ecole', -100)], JOUR).map((x) => x.id)).toEqual([
      'a',
    ]);
  });
  it('« Nouvelle de l’école » seulement si l’école l’a fournie', () => {
    expect(surtitreNouvelle({ fournieParLEcole: true })).toBe('Nouvelle de l’école');
    expect(surtitreNouvelle({ fournieParLEcole: false })).toBe('Nouvelle');
  });
});

const admission = (
  etapes: AdmissionPublique['etapes'],
  reste: Partial<AdmissionPublique> = {},
): AdmissionPublique => ({
  anneeScolaire: '2026-2027',
  pieces: [],
  ouDeposer: null,
  surPlaceSeulement: false,
  declareeLe: '2026-11-01',
  etapes,
  ...reste,
});

describe('l’admission', () => {
  const ouverte = admission([
    { etape: 'resultats', debut: decaler(JOUR, 30), fin: null },
    { etape: 'dossiers', debut: decaler(JOUR, -10), fin: decaler(JOUR, 12) },
  ]);
  it('le calendrier est rangé par date, l’étape d’aujourd’hui « en cours »', () => {
    expect(calendrierAMontrer(ouverte, JOUR).map((x) => `${x.etape}:${x.etat}`)).toEqual([
      'dossiers:en_cours',
      'resultats:a_venir',
    ]);
  });
  it('« Dossiers ouverts » seulement pendant la période, avec les jours qui restent', () => {
    expect(dossiersOuverts(ouverte, JOUR)).toEqual({
      jusquau: decaler(JOUR, 12),
      joursRestants: 12,
    });
    expect(dossiersOuverts(ouverte, decaler(JOUR, 13))).toBeNull();
    expect(dossiersOuverts(ouverte, decaler(JOUR, -11))).toBeNull();
  });
  it('une admission finie, ou qui ne dit rien, ne paraît plus', () => {
    const finie = admission([{ etape: 'rentree', debut: decaler(JOUR, -5), fin: null }], {
      pieces: ['Un acte'],
    });
    expect(admissionAMontrer(finie, JOUR)).toBe(false);
    expect(admissionAMontrer(admission([]), JOUR)).toBe(false);
    expect(admissionAMontrer(admission([], { surPlaceSeulement: true }), JOUR)).toBe(true);
    expect(admissionAMontrer(ouverte, JOUR)).toBe(true);
    expect(admissionAMontrer(null, JOUR)).toBe(false);
  });
});

const frais = (x: Partial<FraisEcole>): FraisEcole => ({
  id: 'f',
  cycle: 'primaire',
  minimum: 1,
  maximum: 1,
  periode: 'mois',
  precisionPeriode: null,
  inscription: null,
  anneeScolaire: null,
  declaresLe: '2026-11-01',
  note: null,
  ...x,
});

describe('les frais', () => {
  it('la classe quand elle est dite, sinon le cycle ; les lignes d’une formation n’y sont pas', () => {
    const l = lignesDeFraisDeLEcole([
      frais({ id: 'c', cycle: 'college', classe: '6e à 4e' }),
      frais({ id: 's', cycle: 'superieur', formationId: 'p1' }),
      frais({ id: 'm', cycle: 'maternelle' }),
    ]);
    expect(l.map((f) => f.id)).toEqual(['m', 'c']);
    expect(l.map(libelleLigneDeFrais)).toEqual(['Maternelle', '6e à 4e']);
  });
  it('l’inscription : une somme, ou une fourchette', () => {
    expect(
      inscriptionDesFrais([frais({ inscription: 5000 }), frais({ inscription: 5000 })]),
    ).toEqual({ min: 5000, max: 5000 });
    expect(
      inscriptionDesFrais([frais({ inscription: 5000 }), frais({ inscription: 9000 }), frais({})]),
    ).toEqual({ min: 5000, max: 9000 });
    expect(inscriptionDesFrais([frais({})])).toBeNull();
  });
  it('la source : la date la plus récente ; « sur le prospectus » seulement si toutes les lignes en viennent', () => {
    expect(
      sourceDesFrais([
        frais({ declaresLe: '2026-11-02', preuve: 'prospectus' }),
        frais({ declaresLe: '2026-11-04', preuve: 'declaration' }),
      ]),
    ).toEqual({ declaresLe: '2026-11-04', surProspectus: false });
    expect(sourceDesFrais([frais({ preuve: 'prospectus' })])?.surProspectus).toBe(true);
    expect(sourceDesFrais([])).toBeNull();
  });
});

describe('les rubriques', () => {
  const rien = {
    ecole: false,
    formations: false,
    admission: false,
    photos: false,
    frais: false,
    nouvelles: false,
  };
  it('seules les rubriques qui ont un contenu ; sous deux, pas de barre', () => {
    expect(rubriquesDeLaFiche(rien)).toEqual([]);
    expect(rubriquesDeLaFiche({ ...rien, ecole: true })).toEqual([]);
    expect(
      rubriquesDeLaFiche({ ...rien, ecole: true, nouvelles: true }).map((r) => r.ancre),
    ).toEqual(['ecole', 'nouvelles']);
    expect(
      rubriquesDeLaFiche({ ...rien, formations: true, admission: true, frais: true }).map(
        (r) => r.titre,
      ),
    ).toEqual(['Formations', 'Admission', 'Frais']);
  });
});

describe('la fiche courte', () => {
  const nue = {
    motDirection: null,
    contactPublic: null,
    numeroEnseigne: null,
    siteWeb: null,
    frais: [],
    equipements: [],
    nouvelles: [],
    medias: { logo: null, couverture: null, galerie: [] },
    photo: null,
    formations: [],
    admission: null,
  } as unknown as EcolePubliee;
  it('le nom, les niveaux et le lieu seulement : une seule carte « Vous êtes de l’école ? »', () => {
    expect(ficheCourte(nue)).toBe(true);
    expect(ficheCourte({ ...nue, numeroEnseigne: '242060000000' })).toBe(false);
    expect(ficheCourte({ ...nue, photo: { id: 'p', prisLe: null } })).toBe(false);
  });
  it('un logo seul ne suffit pas à la rendre longue', () => {
    expect(ficheCourte({ ...nue, medias: { logo: media, couverture: null, galerie: [] } })).toBe(
      true,
    );
  });
});
