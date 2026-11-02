import { describe, expect, it } from 'vitest';
import {
  avecPhoto,
  contactVide,
  demandeLesFormations,
  erreursEtape1,
  erreursEtape2,
  erreursEtape3,
  nouvelleContreVisite,
  nouvelleFiche,
  peutAjouterPhoto,
  photoEnseigne,
  photosFacultatives,
  sansPhoto,
  toutEnvoye,
  versContact,
  versPhotos,
  versReleve,
  type FicheLocale,
  type PhotoLocale,
} from '../../src/modele/fiche';
import { dansContour, distanceMetres, plusProche } from '../../src/modele/geo';
import { listes } from '../../src/modele/listes';
import { afficherTelephone, normaliserTelephone } from '../../src/modele/telephone';

const fiche = (champs: Partial<FicheLocale> = {}): FicheLocale => ({
  ...nouvelleFiche('10000000-0000-4000-8000-000000000001', '2026-11-02T08:00:00.000Z', null),
  ...champs,
});

const unePhoto = (
  id: string,
  role: PhotoLocale['role'],
  champs: Partial<PhotoLocale> = {},
): PhotoLocale => ({
  id,
  role,
  blob: new Blob(['x'], { type: 'image/webp' }),
  mime: 'image/webp',
  octets: 90_000,
  largeur: 1280,
  hauteur: 960,
  prisLe: '2026-11-02T08:00:00.000Z',
  envoyee: false,
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
  it('1/3 demande la photo de l’enseigne, et une réponse quand une école est à 40 m', () => {
    expect(erreursEtape1(fiche())).toHaveProperty('photo');
    const photos = [unePhoto('p1', 'signboard')];
    expect(erreursEtape1(fiche({ photos }))).toEqual({});
    const doublon = { ecoleId: 'e', nom: '[École]' };
    expect(erreursEtape1(fiche({ photos, doublonPropose: doublon }))).toHaveProperty(
      'reponseDoublon',
    );
    expect(
      erreursEtape1(fiche({ photos, doublonPropose: doublon, reponseDoublon: 'une_autre' })),
    ).toEqual({});
  });

  it('1/3 : un panneau ou un prospectus ne remplace pas l’enseigne', () => {
    expect(
      erreursEtape1(
        fiche({ photos: [unePhoto('p1', 'programs_board'), unePhoto('p2', 'brochure')] }),
      ),
    ).toHaveProperty('photo');
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

describe('les dates affichées', () => {
  const maintenant = new Date(2026, 10, 2, 15, 0);
  const date = (mois: number, j: number, h: number, m: number) =>
    new Date(2026, mois, j, h, m).toISOString();

  it('disent « aujourd’hui », « hier » ou la date, jamais « le Aujourd’hui »', async () => {
    const { quand } = await import('../../src/ui/composants');
    expect(quand(date(10, 2, 9, 5), maintenant)).toBe("aujourd'hui à 9\u00a0h\u00a005");
    expect(quand(date(10, 1, 14, 30), maintenant)).toBe('hier à 14\u00a0h\u00a030');
    expect(quand(date(9, 31, 8, 0), maintenant)).toBe('le 31/10 à 8\u00a0h\u00a000');
  });
});

describe('dans le lot', () => {
  it('ne dit rien pour le lot d’entraînement, où l’on se forme n’importe où', async () => {
    const { dansLeLot } = await import('../../src/modele/geo');
    const contour = [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    ];
    const loin = { latitude: 50, longitude: 50 };
    expect(dansLeLot(loin, { essai: false, contour })).toBe(false);
    expect(dansLeLot(loin, { essai: true, contour })).toBeNull();
    expect(dansLeLot(loin, { essai: false, contour: null })).toBeNull();
    expect(dansLeLot(loin, null)).toBeNull();
  });
});

describe('la contre-visite d’une école confiée', () => {
  it('part liée à l’école visitée, avec ce qu’on savait déjà', async () => {
    const { nouvelleContreVisite } = await import('../../src/modele/fiche');
    const fiche = nouvelleContreVisite('r1', '2026-11-02T08:00:00.000Z', 'lot', {
      id: 'ecole-1',
      nom: '[École connue]',
      quartier: '[Quartier]',
      typeEcole: 'privee',
      niveaux: ['primaire'],
      programme: null,
      repere: '[Repère]',
      numeroEnseigne: '242060000001',
      note: 'Nom à vérifier',
      genre: 'verify',
    });
    const releve = versReleve(fiche);
    expect(releve).toMatchObject({
      type: 'contre_visite',
      doublonDe: 'ecole-1',
      reponseDoublon: 'la_meme',
      nomEnseigne: '[École connue]',
      repere: '[Repère]',
      numeroEnseigne: '242060000001',
    });
  });
});

// Ticket 12 : toutes les écoles, et des listes qui ne bloquent jamais ----------------------

describe('une fiche neuve ne dit que ce que le relais a vu', () => {
  it('commence à « Pas indiqué », sans niveau ni programme : jamais « Privée » cochée d’avance', () => {
    const neuve = nouvelleFiche('id', '2026-11-02T08:00:00.000Z', null);
    expect(neuve.typeEcole).toBe('non_indique');
    expect(neuve.niveaux).toEqual([]);
    expect(neuve.programme ?? '').toBe('');
  });

  it('une fiche où rien n’est choisi part quand même, avec « non_indique »', () => {
    const f = fiche({ nomEnseigne: '[École]' });
    expect(erreursEtape2(f)).toEqual({});
    expect(versReleve(f)).toMatchObject({ typeEcole: 'non_indique', niveaux: [], programme: null });
  });
});

describe('le programme, une ligne libre et facultative', () => {
  it('part nettoyé, ou vide quand il n’y a rien', () => {
    expect(
      versReleve(fiche({ nomEnseigne: '[École]', programme: '  Programme français-congolais ' }))
        .programme,
    ).toBe('Programme français-congolais');
    expect(versReleve(fiche({ nomEnseigne: '[École]', programme: '   ' })).programme).toBeNull();
  });

  it('tient en 200 signes', () => {
    const f = (programme: string) => fiche({ nomEnseigne: '[École]', programme });
    expect(erreursEtape2(f('a'.repeat(200)))).toEqual({});
    expect(erreursEtape2(f('a'.repeat(201)))).toHaveProperty('programme');
  });

  it('une fiche faite avant le ticket 12, sans programme, se contrôle et part sans erreur', () => {
    const ancienne: Partial<FicheLocale> = fiche({ nomEnseigne: '[École]' });
    delete ancienne.programme;
    expect(erreursEtape2(ancienne as FicheLocale)).toEqual({});
    expect(versReleve(ancienne as FicheLocale).programme).toBeNull();
  });
});

describe('les listes ne bloquent personne', () => {
  it('tous les types et tous les niveaux, nouveaux compris, passent l’étape 2/3', () => {
    for (const typeEcole of listes.type_ecole) {
      expect(erreursEtape2(fiche({ nomEnseigne: '[École]', typeEcole })), typeEcole).toEqual({});
    }
    expect(erreursEtape2(fiche({ nomEnseigne: '[École]', niveaux: [...listes.niveau] }))).toEqual(
      {},
    );
  });

  it('une valeur que la version ne connaît pas dit un message en français, champ par champ', () => {
    const e = erreursEtape2(
      fiche({
        nomEnseigne: '[École]',
        typeEcole: 'type_de_demain' as never,
        niveaux: ['niveau_de_demain' as never],
      }),
    );
    expect(e.typeEcole).toMatch(/type/i);
    expect(e.niveaux).toMatch(/niveau/i);
    expect(`${e.typeEcole} ${e.niveaux}`).not.toMatch(/invalid|expected/i);
  });

  it('la contre-visite ne reprend que ce que cette version connaît, le reste devient « Pas indiqué »', () => {
    const ecole = {
      id: 'ecole-1',
      nom: '[École connue]',
      quartier: null,
      typeEcole: 'type_de_demain',
      niveaux: ['primaire', 'niveau_de_demain', 'creche'],
      programme: '[Programme]',
      repere: null,
      numeroEnseigne: null,
      note: null,
      genre: 'verify' as const,
    };
    const visite = nouvelleContreVisite('r1', '2026-11-02T08:00:00.000Z', 'lot', ecole);
    expect(visite.typeEcole).toBe('non_indique');
    expect(visite.niveaux).toEqual(['creche', 'primaire']);
    expect(visite.programme).toBe('[Programme]');
    // La fiche avance : rien dans ce que la version ne connaît pas ne bloque l’étape 2/3.
    expect(erreursEtape2(visite)).toEqual({});
  });

  it('la contre-visite garde un type connu, nouveau compris', () => {
    const visite = nouvelleContreVisite('r1', '2026-11-02T08:00:00.000Z', 'lot', {
      id: 'ecole-1',
      nom: '[École]',
      quartier: null,
      typeEcole: 'communautaire',
      niveaux: ['autre_formation'],
      programme: null,
      repere: null,
      numeroEnseigne: null,
      note: null,
      genre: 'verify',
    });
    expect(visite.typeEcole).toBe('communautaire');
    expect(visite.niveaux).toEqual(['autre_formation']);
  });
});

describe('les photos de la fiche', () => {
  it('l’enseigne d’abord, puis au plus trois autres', () => {
    let f = fiche();
    f = avecPhoto(f, unePhoto('b', 'programs_board'));
    f = avecPhoto(f, unePhoto('a', 'signboard'));
    f = avecPhoto(f, unePhoto('c', 'brochure'));
    f = avecPhoto(f, unePhoto('d', 'building'));
    expect(f.photos.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(peutAjouterPhoto(f)).toBe(false);
    // Une quatrième photo facultative n’est pas gardée.
    expect(avecPhoto(f, unePhoto('e', 'building')).photos).toHaveLength(4);
    expect(photosFacultatives(f).map((p) => p.id)).toEqual(['b', 'c', 'd']);
  });

  it('une seconde enseigne remplace la première', () => {
    const f = avecPhoto(
      avecPhoto(fiche(), unePhoto('a', 'signboard')),
      unePhoto('a2', 'signboard'),
    );
    expect(f.photos.map((p) => p.id)).toEqual(['a2']);
    expect(photoEnseigne(f)?.id).toBe('a2');
  });

  it('retire une photo prise par erreur', () => {
    const f = sansPhoto(avecPhoto(fiche(), unePhoto('a', 'signboard')), 'a');
    expect(f.photos).toEqual([]);
  });

  it('envoie l’enseigne d’abord, et seulement les photos pas encore reçues', () => {
    const f = fiche({
      photos: [
        unePhoto('b', 'programs_board'),
        unePhoto('a', 'signboard'),
        unePhoto('c', 'brochure', { envoyee: true, blob: null }),
      ],
    });
    expect(versPhotos(f).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('la fiche n’est entièrement partie que quand chaque photo est partie', () => {
    const partie = { releve: true, photo: true, contact: true };
    const f = fiche({
      envoyes: partie,
      photos: [unePhoto('a', 'signboard', { envoyee: true, blob: null })],
    });
    expect(toutEnvoye(f)).toBe(true);
    expect(toutEnvoye({ ...f, photos: [...f.photos, unePhoto('b', 'brochure')] })).toBe(false);
  });
});

describe('les séries et les filières', () => {
  it('ne sont demandées que pour un lycée, un établissement technique, du supérieur ou une autre formation', () => {
    expect(demandeLesFormations(['maternelle', 'primaire', 'college'])).toBe(false);
    expect(demandeLesFormations(['college', 'lycee'])).toBe(true);
    expect(demandeLesFormations(['technique'])).toBe(true);
    expect(demandeLesFormations(['superieur'])).toBe(true);
    expect(demandeLesFormations(['autre_formation'])).toBe(true);
  });

  it('partent avec le relevé quand un niveau les demande, pas sinon', () => {
    const base = { programmesVus: 'Séries C et D', programmesEnPhoto: true };
    expect(versReleve(fiche({ ...base, niveaux: ['lycee'] }))).toMatchObject({
      programmesVus: 'Séries C et D',
      programmesEnPhoto: true,
    });
    // Un relais qui décoche le lycée après avoir noté les séries : la note ne part pas.
    expect(versReleve(fiche({ ...base, niveaux: ['primaire'] }))).toMatchObject({
      programmesVus: null,
      programmesEnPhoto: false,
    });
  });
});
