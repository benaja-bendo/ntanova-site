// Lot F du ticket 165 : « Ma paie » en facture, « Une de mes fiches », le détail des formations et la preuve d'un agrément.
import { describe, expect, it } from 'vitest';
import { preuveEnMots } from '../../src/modele/agrement';
import { detailsVides, erreurDesDetails, sansDetail } from '../../src/modele/fiche-admin';
import {
  ceQuiManqueEncore,
  ceQuiVientDuReleve,
  etapesDeLaFiche,
  raisonDeNTanova,
} from '../../src/modele/ma-fiche';
import { factureDeLaPaie, paieDeLaFiche } from '../../src/modele/paie';
import type { ReleveRecu } from '../../src/modele/ports';

const nbsp = (t: string) => t.replace(/\u00a0/g, ' ');

describe('« Ma paie » en facture', () => {
  it('écrit « N × tarif = sous-total », fiches puis missions puis essai', () => {
    const lignes = factureDeLaPaie({
      fiches: 2,
      contacts: 0,
      essais: 1,
      missions: 1,
      lignes: [
        { genre: 'essai', tarifXaf: 1500, nombre: 1, fiches: [] },
        { genre: 'mission', tarifXaf: 2000, nombre: 1, fiches: ['r3'] },
        { genre: 'fiche', tarifXaf: 500, nombre: 2, fiches: ['r1', 'r2'] },
      ],
    });
    expect(lignes.map((l) => [l.libelle, l.calcul && nbsp(l.calcul), l.sousTotal])).toEqual([
      ['2 fiches acceptées', '2 × 500 FCFA', 1000],
      ['1 mission faite', '1 × 2 000 FCFA', 2000],
      ['L’essai validé', null, 1500],
    ]);
  });

  it('deux missions à des montants différents font deux lignes', () => {
    const lignes = factureDeLaPaie({
      fiches: 0,
      contacts: 0,
      essais: 0,
      missions: 2,
      lignes: [
        { genre: 'mission', tarifXaf: 1000, nombre: 1, fiches: ['a'] },
        { genre: 'mission', tarifXaf: 2500, nombre: 1, fiches: ['b'] },
      ],
    });
    expect(lignes.map((l) => l.sousTotal)).toEqual([2500, 1000]);
  });

  it('une paie gardée avant la mise à jour (sans tarifs) se lit en quantités, comme avant', () => {
    expect(factureDeLaPaie({ fiches: 3, contacts: 1, essais: 0 })).toEqual([
      { libelle: '3 fiches acceptées', calcul: null, sousTotal: null },
      { libelle: '1 contact de direction confirmé', calcul: null, sousTotal: null },
    ]);
  });

  it('dit ce que rapporte une fiche : acquise, à payer ou payée', () => {
    const paie = {
      acquis: {
        vendredi: '2026-11-20',
        etat: 'acquis' as const,
        payeLe: null,
        lignes: [{ genre: 'fiche' as const, tarifXaf: 500, nombre: 1, fiches: ['r1'] }],
      },
      historique: [
        {
          vendredi: '2026-11-13',
          etat: 'paye' as const,
          payeLe: '2026-11-13T18:00:00Z',
          lignes: [
            { genre: 'fiche' as const, tarifXaf: 500, nombre: 1, fiches: ['r0'] },
            { genre: 'contact' as const, tarifXaf: 300, nombre: 1, fiches: ['r0'] },
          ],
        },
      ],
    };
    expect(paieDeLaFiche(paie, 'r1')).toMatchObject({ montantXaf: 500, etat: 'acquis' });
    expect(paieDeLaFiche(paie, 'r0')).toMatchObject({ montantXaf: 800, etat: 'paye' });
    expect(paieDeLaFiche(paie, 'inconnue')).toBeNull();
  });
});

const recu = (champs: Partial<ReleveRecu> = {}): ReleveRecu => ({
  id: 'r1',
  type: 'releve',
  nomEnseigne: '[École exemple]',
  prisLe: '2026-11-10T09:00:00Z',
  statut: 'a_valider',
  motif: null,
  messageAuRelais: null,
  direction: 'vue',
  ficheLiaisonRemise: false,
  repasser: null,
  contactConfirmeLe: null,
  contactFonction: null,
  campusId: null,
  niveaux: ['primaire'],
  typeEcole: 'privee',
  programme: null,
  programmesVus: null,
  programmesEnPhoto: false,
  formationsVues: [],
  repere: 'Face au marché',
  numeroEnseigne: null,
  position: { latitude: -4.79, longitude: 11.92 },
  precisionM: 12,
  photos: ['signboard'],
  aContact: true,
  ...champs,
});

describe('« Une de mes fiches »', () => {
  it('suit les trois étapes : envoyée, acceptée, en ligne', () => {
    const etats = (r: ReleveRecu) => etapesDeLaFiche(r).map((e) => `${e.libelle}:${e.etat}`);
    expect(etats(recu())).toEqual(['Envoyée:faite', 'Acceptée:en_cours', 'En ligne:a_venir']);
    expect(etats(recu({ statut: 'accepte' }))).toEqual([
      'Envoyée:faite',
      'Acceptée:faite',
      'En ligne:en_cours',
    ]);
    expect(etats(recu({ statut: 'accepte', pageEnLigne: 158427 }))).toEqual([
      'Envoyée:faite',
      'Acceptée:faite',
      'En ligne:faite',
    ]);
    expect(etats(recu({ statut: 'refuse' }))[1]).toBe('Refusée:arretee');
  });

  it('donne la raison de NTanova seulement pour un refus ou une correction', () => {
    expect(raisonDeNTanova(recu({ statut: 'refuse', motif: 'photo_floue' }))).toBeTruthy();
    expect(
      raisonDeNTanova(recu({ statut: 'a_corriger', messageAuRelais: 'Reprenez le nom.' })),
    ).toBe('Reprenez le nom.');
    expect(raisonDeNTanova(recu({ statut: 'accepte', messageAuRelais: 'Merci' }))).toBeNull();
  });

  it('dit ce qui vient du relevé, sans le contact lui-même', () => {
    const lignes = ceQuiVientDuReleve(recu());
    expect(lignes.map((l) => l.libelle)).toEqual([
      'Photo',
      'Nom',
      'Type',
      'Niveaux',
      'Comment la trouver',
      'Position',
      'La rencontre',
    ]);
    expect(lignes.find((l) => l.libelle === 'La rencontre')?.valeur).toBe(
      'Oui · contact envoyé à NTanova',
    );
  });

  it('dit ce qui manque encore à la page, jamais le contact d’une direction qui a refusé', () => {
    expect(ceQuiManqueEncore(recu())).toEqual(['Des photos des lieux, vides (bonus)']);
    expect(
      ceQuiManqueEncore(
        recu({
          photos: [],
          position: null,
          repere: null,
          niveaux: ['superieur'],
          aContact: false,
          direction: 'refus',
        }),
      ),
    ).toEqual([
      'La photo de l’enseigne',
      'La position devant l’entrée',
      'Comment la trouver (un repère)',
      'Les formations affichées',
      'Des photos des lieux, vides (bonus)',
    ]);
    expect(ceQuiManqueEncore(recu({ precisionM: 80, aContact: false }))).toContain(
      'Une position plus précise',
    );
  });
});

describe('Le détail d’une formation du supérieur', () => {
  const d = { ...detailsVides(), dureeAnnees: 2, ditLe: '2026-11-05' };
  it('accepte un détail daté, refuse un détail sans date ou une durée impossible', () => {
    expect(erreurDesDetails(d, '2026-11-13')).toBeNull();
    expect(erreurDesDetails({ ...d, ditLe: null }, '2026-11-13')).toMatch(/jour où l’école/);
    expect(erreurDesDetails({ ...d, ditLe: '2026-12-01' }, '2026-11-13')).toMatch(/jour/);
    expect(erreurDesDetails({ ...d, dureeAnnees: 9 }, '2026-11-13')).toMatch(/durée/);
    expect(erreurDesDetails({ ...d, dureeAnnees: 1.3 }, '2026-11-13')).toMatch(/durée/);
    expect(erreurDesDetails({ ...d, fraisDossier: -5 }, '2026-11-13')).toMatch(/FCFA/);
  });
  it('un détail vidé n’exige pas de date', () => {
    expect(sansDetail(detailsVides())).toBe(true);
    expect(erreurDesDetails(detailsVides(), '2026-11-13')).toBeNull();
  });
});

describe('La preuve d’un agrément sur la page publique', () => {
  it('dit « vue sur le document » ou « dite par l’école », jamais « reconnue par l’État »', () => {
    expect(preuveEnMots('photo')).toBe('vue sur le document');
    expect(preuveEnMots('document_vu')).toBe('vue sur le document');
    expect(preuveEnMots('dit_ecole')).toMatch(/dite par l’école/);
    expect(preuveEnMots(null)).toBeNull();
    for (const g of ['photo', 'document_vu', 'dit_ecole'] as const)
      expect(preuveEnMots(g)).not.toMatch(/État|reconnue/);
  });
});
