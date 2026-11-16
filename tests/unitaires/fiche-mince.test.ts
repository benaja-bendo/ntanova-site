// Lot 4 du site public (fiche mince, 16/11/2026) : la couverture, l'image d'une carte d'école et « Écoles proches ».
import { describe, expect, it } from 'vitest';
import type { EcolePubliee } from '../../src/modele/ports';
import {
  couvertureDeLaFiche,
  distanceCourte,
  ecolesProches,
  vignetteDeLaCarte,
} from '../../src/modele/fiche-mince';

let n = 0;
function ecole(reste: Partial<EcolePubliee> = {}): EcolePubliee {
  n += 1;
  return {
    id: `e${n}`,
    institutionId: `i${n}`,
    divisionId: 'd',
    slug: `ecole-${n}`,
    numero: String(100000 + n),
    nom: `École ${n}`,
    etiquette: null,
    arrondissement: '',
    adresse: [],
    divisionNoms: [],
    quartier: null,
    typeEcole: 'privee',
    niveaux: ['primaire'],
    programme: null,
    formations: [],
    repere: null,
    numeroEnseigne: null,
    latitude: -4.79,
    longitude: 11.86,
    etat: 'relevee',
    verifieeLe: null,
    releveeLe: '2026-11-06',
    situeeLe: null,
    misAJourLe: '2026-11-06T10:00:00Z',
    ...reste,
  };
}
const media = (id: string) => ({ id, sujet: 'facade' as never, legende: null, prisLe: null });

describe('la couverture de la fiche', () => {
  it('la couverture choisie passe avant la photo d’enseigne', () => {
    const e = ecole({
      medias: { logo: null, couverture: media('m1'), galerie: [] },
      photo: { id: 'p1', prisLe: null },
    });
    expect(couvertureDeLaFiche(e)).toEqual({
      genre: 'couverture',
      src: '/medias/m1-couverture.webp',
    });
  });
  it('sinon la photo d’enseigne', () => {
    const e = ecole({ photo: { id: 'p1', prisLe: '2026-11-06' } });
    expect(couvertureDeLaFiche(e)).toMatchObject({ genre: 'enseigne', src: '/photos/p1.webp' });
  });
  it('sans photo, aucun bandeau', () => {
    expect(couvertureDeLaFiche(ecole())).toBeNull();
    expect(couvertureDeLaFiche(ecole({ photo: null }))).toBeNull();
  });
});

describe('la vignette d’une carte d’école', () => {
  it('la photo d’enseigne, en deux formes', () => {
    expect(vignetteDeLaCarte(ecole({ photo: { id: 'p2', prisLe: null } }))).toEqual({
      carree: '/photos/vignettes/p2-carree.webp',
      large: '/photos/vignettes/p2-large.webp',
    });
  });
  it('sans photo : rien (le fond pierre et le rond)', () => {
    expect(vignetteDeLaCarte(ecole())).toBeNull();
  });
});

describe('« Écoles proches »', () => {
  const ici = ecole({ niveaux: ['primaire', 'college'] });
  // 0,001° de latitude ≈ 111 m.
  const a = ecole({ latitude: -4.792, nom: 'A' }); // ≈ 220 m
  const b = ecole({ latitude: -4.8, niveaux: ['college'], nom: 'B' }); // ≈ 1,1 km
  const loin = ecole({ latitude: -4.9, nom: 'Loin' }); // ≈ 12 km
  const pasVue = ecole({ latitude: -4.791, releveeLe: null, nom: 'Pas vue' });
  const autreNiveau = ecole({ latitude: -4.791, niveaux: ['superieur'], nom: 'Sup' });
  const memeEcole = ecole({ latitude: -4.791, institutionId: ici.institutionId, nom: 'Site 2' });
  const sansPosition = ecole({ latitude: null, longitude: null, nom: 'Sans position' });

  it('vues sur place, à moins de 5 km, un niveau en commun, les plus proches d’abord', () => {
    const r = ecolesProches(ici, [ici, b, loin, pasVue, autreNiveau, memeEcole, sansPosition, a]);
    expect(r.map((p) => p.ecole.nom)).toEqual(['A', 'B']);
    expect(Math.round(r[0]!.distanceM / 10) * 10).toBe(220);
  });
  it('trois au plus', () => {
    const quatre = [1, 2, 3, 4].map((i) => ecole({ latitude: -4.79 - i / 1000 }));
    expect(ecolesProches(ici, quatre)).toHaveLength(3);
  });
  it('une fiche sans position n’a pas d’écoles proches', () => {
    expect(ecolesProches(ecole({ latitude: null, longitude: null }), [a, b])).toEqual([]);
  });
});

describe('la distance d’une carte', () => {
  it.each([
    [3, '10 m'],
    [248, '250 m'],
    [999, '1 km'],
    [1049, '1 km'],
    [1120, '1,1 km'],
    [4960, '5 km'],
  ])('%d m → %s', (m, texte) => {
    expect(distanceCourte(m)).toBe(texte);
  });
});
