// « Pour les écoles » et « Outils en préparation » (refonte publique, lot 5) : l'état réel des services et la cohérence de
// l'exemple 016. Les pages rendues sont vérifiées dans ecoles-et-directions.spec.ts.
import { describe, expect, it } from 'vitest';
import {
  CHRONOLOGIE_016,
  DOSSIER_016,
  DOSSIERS_EXEMPLE,
  PROCHAINE_016,
  RESTE_016,
  jourEcrit,
  somme,
  verseSur,
} from '../../src/modele/exemple-outils';
import {
  BESOINS_DES_ECOLES,
  ETATS_DE_SERVICE,
  libelleEtatDeService,
  servicesALEssai,
} from '../../src/modele/services-ecoles';

describe('les services pour les écoles', () => {
  it('ont trois libellés d’état, et aucun service n’est à l’essai', () => {
    expect(ETATS_DE_SERVICE.map((e) => libelleEtatDeService[e])).toEqual([
      'Disponible',
      'À l’essai',
      'En préparation',
    ]);
    expect(servicesALEssai()).toBe(0);
    expect(
      servicesALEssai([{ titre: 't', ancre: 'a', services: [{ nom: 'n', etat: 'essai' }] }]),
    ).toBe(1);
  });

  it('les logiciels et la prestation de communication restent en préparation', () => {
    const enPreparation = BESOINS_DES_ECOLES.flatMap((b) => b.services)
      .filter((s) => s.etat === 'preparation')
      .map((s) => s.nom);
    expect(enPreparation).toEqual([
      'Des visuels et des contenus pour l’école',
      'Inscriptions',
      'Frais et reçus',
    ]);
  });
});

describe('le dossier 016', () => {
  const d = DOSSIER_016;

  it('tient ses comptes : 30 000 dus, 20 000 versés, 10 000 restants, 15 000 puis 5 000', () => {
    expect([d.du, d.recu.montant, RESTE_016]).toEqual([30_000, 20_000, 10_000]);
    expect(d.echeances.map((e) => e.verse)).toEqual([15_000, 5_000]);
    expect(d.echeances.reduce((t, e) => t + e.du, 0)).toBe(d.du);
    expect(d.echeances.reduce((t, e) => t + e.verse, 0)).toBe(d.recu.montant);
    // Le reste est celui de la prochaine échéance.
    expect(PROCHAINE_016.du - PROCHAINE_016.verse).toBe(RESTE_016);
    expect(somme(RESTE_016)).toMatch(/^10\s000\sFCFA$/);
  });

  it('dit les mêmes jours dans le tableau et dans la chronologie, dans l’ordre', () => {
    const ligne = DOSSIERS_EXEMPLE.find((l) => l.suivi)!;
    const jours = [d.recuLe, d.piecesLe, d.admisLe, d.recu.le, d.confirmeLe, d.transmis.le];
    expect([...jours].sort()).toEqual(jours);
    expect(CHRONOLOGIE_016.map((e) => e.quand)).toEqual([
      jourEcrit(d.recuLe, true),
      jourEcrit(d.piecesLe),
      jourEcrit(d.admisLe),
      jourEcrit(d.recu.le),
      jourEcrit(d.confirmeLe),
      `${jourEcrit(d.transmis.le)}, ${d.transmis.heure}`,
    ]);
    expect(ligne.recue).toBe(jourEcrit(d.recuLe));
    expect(ligne.pieces).toContain(jourEcrit(d.piecesLe));
    expect(ligne.decision).toContain(jourEcrit(d.admisLe));
    expect(ligne.paiement).toBe(verseSur(d.recu.montant, d.du));
    expect(ligne.inscription).toContain(jourEcrit(d.confirmeLe));
  });

  it('une inscription peut être confirmée sur dérogation sans être soldée ; un dossier complet, attendre', () => {
    const derogation = DOSSIERS_EXEMPLE.find((l) => l.inscription.includes('dérogation'))!;
    expect(derogation.paiement).toMatch(/^0 sur/);
    expect(
      DOSSIERS_EXEMPLE.some((l) => l.pieces === 'Complet' && l.inscription === 'Non confirmée'),
    ).toBe(true);
  });

  it('écrit « 1er juin », et l’année seulement quand elle se dit', () => {
    expect(jourEcrit('2027-06-01')).toMatch(/^1er\sjuin$/);
    expect(jourEcrit('2027-06-28', true)).toMatch(/^28\sjuin\s2027$/);
  });
});
