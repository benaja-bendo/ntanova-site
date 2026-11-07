import { describe, expect, it } from 'vitest';
import {
  decrirePhotosPubliques,
  lireEtatPhotoPublique,
  peutParaitreSurLeSite,
  ROLES_PUBLIABLES,
  type EtatPhotoPublique,
} from '../../src/modele/photos-publiques';
import type { PhotoVue } from '../../src/modele/ports';

type Photo = Pick<PhotoVue, 'id' | 'role' | 'publiable' | 'publique'>;
const enseigne = (champs: Partial<Photo> = {}): Photo => ({
  id: 'enseigne',
  role: 'signboard',
  publiable: true,
  publique: false,
  ...champs,
});
const batiment = (champs: Partial<Photo> = {}): Photo => ({
  id: 'batiment',
  role: 'building',
  publiable: true,
  publique: false,
  ...champs,
});
const etat = (champs: Partial<EtatPhotoPublique> = {}): EtatPhotoPublique => ({
  mode: 'automatique',
  choisieId: null,
  publiee: true,
  retenueId: null,
  ...champs,
});
const situations = (photos: Photo[], e: EtatPhotoPublique) =>
  Object.fromEntries(decrirePhotosPubliques(photos, e).photos.map((p) => [p.id, p.situation]));

describe('les photos qui peuvent paraître sur une fiche', () => {
  it('seules l’enseigne et la vue du bâtiment : le panneau des formations et le prospectus restent privés', () => {
    expect([...ROLES_PUBLIABLES].sort()).toEqual(['building', 'signboard']);
    expect(peutParaitreSurLeSite('signboard')).toBe(true);
    expect(peutParaitreSurLeSite('building')).toBe(true);
    expect(peutParaitreSurLeSite('programs_board')).toBe(false);
    expect(peutParaitreSurLeSite('brochure')).toBe(false);
  });
});

describe('lire l’état que la base répond', () => {
  it('lit les trois modes, le choix, la publication et la photo retenue', () => {
    expect(
      lireEtatPhotoPublique({ mode: 'choix', choice: 'p1', published: true, retained: 'p1' }),
    ).toEqual({ mode: 'choix', choisieId: 'p1', publiee: true, retenueId: 'p1' });
    expect(
      lireEtatPhotoPublique({ mode: 'retire', choice: null, published: true, retained: null }),
    ).toEqual({ mode: 'retire', choisieId: null, publiee: true, retenueId: null });
    expect(
      lireEtatPhotoPublique({
        mode: 'automatique',
        choice: null,
        published: false,
        retained: null,
      }),
    ).toEqual({ mode: 'automatique', choisieId: null, publiee: false, retenueId: null });
  });

  it('une réponse vide ou inconnue ne casse jamais l’écran et ne déclare jamais une photo publique', () => {
    for (const brut of [null, undefined, {}, { mode: 'inconnu', retained: 12, published: 'oui' }]) {
      expect(lireEtatPhotoPublique(brut)).toEqual({
        mode: 'automatique',
        choisieId: null,
        publiee: false,
        retenueId: null,
      });
    }
  });
});

describe('dire l’état des photos d’une école', () => {
  it('sans choix, une seule photo contrôlée est retenue : les autres candidates ne sont pas dites publiques', () => {
    const photos = [enseigne(), batiment(), enseigne({ id: 'brute', publiable: false })];
    const d = decrirePhotosPubliques(photos, etat({ retenueId: 'batiment' }));
    expect(situations(photos, etat({ retenueId: 'batiment' }))).toEqual({
      enseigne: 'candidate',
      batiment: 'retenue',
      brute: 'non_controlee',
    });
    expect(d.photos.find((p) => p.id === 'batiment')?.phrase).toMatch(/Retenue automatiquement/);
    expect(d.photos.find((p) => p.id === 'enseigne')?.phrase).toMatch(
      /une autre photo est retenue/,
    );
    expect(d.photos.find((p) => p.id === 'brute')?.phrase).toMatch(
      /Non contrôlée : elle reste privée/,
    );
    expect(d.resume).toMatch(/retenue automatiquement/);
    expect(d.retirable).toBe(true);
  });

  it('une photo contrôlée d’un rôle privé n’est jamais une candidate', () => {
    const panneau: Photo = {
      id: 'panneau',
      role: 'programs_board',
      publiable: true,
      publique: false,
    };
    const d = decrirePhotosPubliques([panneau], etat());
    expect(d.photos[0]?.situation).toBe('non_controlee');
    expect(d.aDesCandidates).toBe(false);
    expect(d.retirable).toBe(false);
    expect(d.resume).toMatch(/sans photo/);
  });

  it('fiche pas publiée : aucune photo n’est dite publique, la candidate est annoncée pour la publication', () => {
    const photos = [enseigne()];
    const d = decrirePhotosPubliques(photos, etat({ publiee: false }));
    expect(d.photos[0]?.situation).toBe('candidate');
    expect(d.resume).toMatch(/n’est pas publiée : aucune photo n’est publique/);
    expect(d.retirable).toBe(true);
  });

  it('un choix prioritaire valide passe avant le repli', () => {
    const photos = [enseigne({ publique: true }), batiment()];
    const e = etat({ mode: 'choix', choisieId: 'enseigne', retenueId: 'enseigne' });
    const d = decrirePhotosPubliques(photos, e);
    expect(situations(photos, e)).toEqual({ enseigne: 'retenue', batiment: 'candidate' });
    expect(d.photos[0]).toMatchObject({ prioritaire: true });
    expect(d.photos[0]?.phrase).toMatch(/Choix prioritaire, retenu/);
    expect(d.photos[1]?.phrase).toMatch(/le choix prioritaire passe avant/);
    expect(d.retirable).toBe(true);
  });

  it('un choix prioritaire sur une fiche pas publiée est dit en attente', () => {
    const photos = [enseigne({ publique: true })];
    const e = etat({ mode: 'choix', choisieId: 'enseigne', publiee: false });
    expect(situations(photos, e)).toEqual({ enseigne: 'prioritaire' });
    expect(decrirePhotosPubliques(photos, e).resume).toMatch(/tant que la fiche n’est pas publiée/);
  });

  it('un choix devenu invalide ne laisse paraître aucune autre photo, et le dit', () => {
    // Le contrôle de la photo choisie a été retiré : la base n'expose rien, et la bâtiment contrôlé ne la remplace pas.
    const photos = [enseigne({ publique: true, publiable: false }), batiment()];
    const e = etat({ mode: 'choix', choisieId: 'enseigne', retenueId: null });
    const d = decrirePhotosPubliques(photos, e);
    expect(situations(photos, e)).toEqual({
      enseigne: 'prioritaire_invalide',
      batiment: 'candidate',
    });
    expect(d.photos.some((p) => p.situation === 'retenue')).toBe(false);
    expect(d.resume).toMatch(/n’est plus valable/);
    expect(d.resume).toMatch(/aucune autre photo ne le remplace/);
    expect(d.retirable).toBe(true);
  });

  it('un choix dont la photo a disparu de la liste est invalide aussi', () => {
    const e = etat({ mode: 'choix', choisieId: 'effacee' });
    const d = decrirePhotosPubliques([batiment()], e);
    expect(d.resume).toMatch(/n’est plus valable/);
    expect(d.photos.some((p) => p.situation === 'retenue')).toBe(false);
  });

  it('après un retrait, les photos contrôlées sont écartées et aucune n’est retenue', () => {
    const photos = [enseigne(), batiment()];
    const e = etat({ mode: 'retire' });
    const d = decrirePhotosPubliques(photos, e);
    expect(situations(photos, e)).toEqual({ enseigne: 'ecartee', batiment: 'ecartee' });
    expect(d.resume).toMatch(/Retrait demandé/);
    expect(d.resume).toMatch(/même contrôlée/);
    // Déjà retiré : le bouton « Retirer » n'a plus de sens, choisir une photo suffit à la faire reparaître.
    expect(d.retirable).toBe(false);
  });

  it('sans photo contrôlée, rien à retirer', () => {
    const d = decrirePhotosPubliques([enseigne({ publiable: false })], etat());
    expect(d.retirable).toBe(false);
    expect(d.photos[0]?.situation).toBe('non_controlee');
  });
});
