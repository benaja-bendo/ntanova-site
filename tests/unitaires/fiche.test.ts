import { describe, expect, it } from 'vitest';
import {
  contactVide,
  erreursEtape1,
  erreursEtape2,
  erreursEtape3,
  nouvelleFiche,
  versContact,
  versReleve,
  type FicheLocale,
} from '../../src/modele/fiche';
import { dansContour, distanceMetres, plusProche } from '../../src/modele/geo';
import { afficherTelephone, normaliserTelephone } from '../../src/modele/telephone';

const fiche = (champs: Partial<FicheLocale> = {}): FicheLocale => ({
  ...nouvelleFiche('10000000-0000-4000-8000-000000000001', '2026-11-02T08:00:00.000Z', null),
  ...champs,
});

describe('les numéros de téléphone', () => {
  it('ajoute 242 à un numéro congolais de 9 chiffres', () => {
    expect(normaliserTelephone('06 123 45 67')).toBe('242061234567');
    expect(normaliserTelephone('+242 06 123 45 67')).toBe('242061234567');
    expect(normaliserTelephone('00242061234567')).toBe('242061234567');
  });
  it('refuse ce qui n’est pas un numéro', () => {
    expect(normaliserTelephone('06 12')).toBeNull();
    expect(normaliserTelephone('demander au gardien')).toBeNull();
    expect(normaliserTelephone('')).toBeNull();
  });
  it('affiche un numéro congolais par groupes', () => {
    expect(afficherTelephone('242061234567')).toBe('+242 06 123 45 67');
  });
});

describe('les positions', () => {
  const ecole = { id: 'e', nom: '[École]', latitude: -4.79105, longitude: 11.925 };
  it('trouve une école à moins de 40 m, pas à 100 m', () => {
    const a30m = { latitude: -4.79105 + 0.00027, longitude: 11.925 };
    const a100m = { latitude: -4.79105 + 0.0009, longitude: 11.925 };
    expect(distanceMetres(ecole, a30m)).toBeGreaterThan(25);
    expect(distanceMetres(ecole, a30m)).toBeLessThan(35);
    expect(plusProche(a30m, [ecole])?.id).toBe('e');
    expect(plusProche(a100m, [ecole])).toBeNull();
  });
  it('dit si un point est dans le contour, trous compris', () => {
    const carre = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ];
    const trou = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ];
    expect(dansContour({ latitude: 2, longitude: 2 }, [carre])).toBe(true);
    expect(dansContour({ latitude: 12, longitude: 2 }, [carre])).toBe(false);
    expect(dansContour({ latitude: 5, longitude: 5 }, [[...carre, trou]])).toBe(false);
  });
});

describe('les étapes de la fiche', () => {
  it('1/3 demande la photo, et une réponse quand une école est à 40 m', () => {
    expect(erreursEtape1(fiche())).toHaveProperty('photo');
    const photo = new Blob(['x'], { type: 'image/jpeg' });
    expect(erreursEtape1(fiche({ photo }))).toEqual({});
    const doublon = { ecoleId: 'e', nom: '[École]' };
    expect(erreursEtape1(fiche({ photo, doublonPropose: doublon }))).toHaveProperty(
      'reponseDoublon',
    );
    expect(
      erreursEtape1(fiche({ photo, doublonPropose: doublon, reponseDoublon: 'une_autre' })),
    ).toEqual({});
  });

  it('2/3 demande le nom de l’enseigne et un numéro complet s’il y en a un', () => {
    expect(erreursEtape2(fiche())).toHaveProperty('nomEnseigne');
    expect(
      erreursEtape2(fiche({ nomEnseigne: '[École]', numeroEnseigne: '06 12' })),
    ).toHaveProperty('numeroEnseigne');
    expect(
      erreursEtape2(fiche({ nomEnseigne: '[École]', numeroEnseigne: '06 123 45 67' })),
    ).toEqual({});
  });

  it('3/3 refuse un numéro sans l’accord de la personne', () => {
    expect(erreursEtape3(fiche())).toHaveProperty('direction');
    const sansAccord = fiche({
      direction: 'vue',
      contact: { ...contactVide(), fonction: 'promoteur', whatsapp: '06 123 45 67' },
    });
    expect(erreursEtape3(sansAccord)).toHaveProperty('whatsapp');
    const sansFonction = fiche({ direction: 'vue', contact: contactVide() });
    expect(erreursEtape3(sansFonction)).toHaveProperty('fonction');
    const avecAccord = fiche({
      direction: 'vue',
      contact: {
        ...contactVide(),
        fonction: 'promoteur',
        accord: true,
        accordLe: '2026-11-02T08:05:00.000Z',
        whatsapp: '06 123 45 67',
      },
    });
    expect(erreursEtape3(avecAccord)).toEqual({});
    expect(erreursEtape3(fiche({ direction: 'absente' }))).toEqual({});
  });
});

describe('ce qui part vers la base', () => {
  it('le relevé ne porte jamais le contact', () => {
    const f = fiche({
      nomEnseigne: ' [École] ',
      numeroEnseigne: '06 123 45 67',
      direction: 'vue',
      contact: { ...contactVide(), fonction: 'directeur', accord: true, whatsapp: '05 555 55 55' },
    });
    const releve = versReleve(f);
    expect(releve.nomEnseigne).toBe('[École]');
    expect(releve.numeroEnseigne).toBe('242061234567');
    expect(JSON.stringify(releve)).not.toContain('555');
    expect(versContact(f)?.whatsapp).toBe('242055555555');
  });

  it('sans accord, aucun numéro ne part ; absente, aucun contact', () => {
    const sansAccord = fiche({
      direction: 'vue',
      contact: { ...contactVide(), fonction: 'directeur', whatsapp: '05 555 55 55' },
    });
    expect(versContact(sansAccord)?.whatsapp).toBeNull();
    expect(versContact(fiche({ direction: 'absente', repasser: 'lundi' }))).toBeNull();
    expect(versReleve(fiche({ direction: 'absente', repasser: 'lundi' })).repasser).toBe('lundi');
  });

  it('« la même » école renvoie à l’école publiée', () => {
    const f = fiche({
      doublonPropose: { ecoleId: 'e', nom: '[École]' },
      reponseDoublon: 'la_meme',
    });
    expect(versReleve(f).doublonDe).toBe('e');
    expect(versReleve({ ...f, reponseDoublon: 'une_autre' }).doublonDe).toBeNull();
  });
});
