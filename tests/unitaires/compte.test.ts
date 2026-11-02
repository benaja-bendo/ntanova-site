import { describe, expect, it } from 'vitest';
import {
  appartientAuCompte,
  avertissementDeDeconnexion,
  ceQuiResteSurLeTelephone,
  duBrouillon,
  phraseFichesEnAttente,
} from '../../src/modele/compte';
import { nouvelleFiche, type FicheLocale } from '../../src/modele/fiche';

// Un téléphone peut servir à deux relais (ticket #55, PR 6). Les fiches non envoyées d'un relais ne sont ni vues, ni
// envoyées sous le nom d'un autre ; se déconnecter ne les efface jamais, et prévient de ce qu'il reste.

const fiche = (champs: Partial<FicheLocale> = {}): FicheLocale => ({
  ...nouvelleFiche('10000000-0000-4000-8000-000000000001', '2026-11-02T08:00:00.000Z', null),
  ...champs,
});

describe('à qui appartient une fiche', () => {
  it('à son compte : celui qui l’a commencée', () => {
    expect(appartientAuCompte(fiche({ compteId: 'alice' }), 'alice')).toBe(true);
    expect(appartientAuCompte(fiche({ compteId: 'alice' }), 'bastien')).toBe(false);
  });

  it('une fiche d’avant la mise à jour, sans compte, est à celui qui se connecte', () => {
    expect(appartientAuCompte(fiche({ compteId: null }), 'alice')).toBe(true);
    expect(appartientAuCompte(fiche(), 'alice')).toBe(true);
  });

  it('quand on ne sait pas encore qui est connecté, une fiche d’un compte n’est à personne', () => {
    expect(appartientAuCompte(fiche({ compteId: 'alice' }), null)).toBe(false);
  });
});

describe('le brouillon d’un compte', () => {
  it('est le brouillon le plus récent de ce compte, jamais celui d’un autre', () => {
    const lesFiches = [
      fiche({
        id: 'a-ancien',
        etat: 'brouillon',
        compteId: 'alice',
        creeeLe: '2026-11-02T08:00:00.000Z',
      }),
      fiche({
        id: 'a-recent',
        etat: 'brouillon',
        compteId: 'alice',
        creeeLe: '2026-11-02T09:00:00.000Z',
      }),
      fiche({
        id: 'b',
        etat: 'brouillon',
        compteId: 'bastien',
        creeeLe: '2026-11-02T10:00:00.000Z',
      }),
      fiche({
        id: 'a-envoyee',
        etat: 'envoyee',
        compteId: 'alice',
        creeeLe: '2026-11-02T11:00:00.000Z',
      }),
    ];
    expect(duBrouillon(lesFiches, 'alice')?.id).toBe('a-recent');
    expect(duBrouillon(lesFiches, 'bastien')?.id).toBe('b');
    expect(duBrouillon(lesFiches, 'chloe')).toBeUndefined();
  });
});

describe('ce qui reste sur le téléphone quand on se déconnecte', () => {
  const fiches = [
    fiche({ id: '1', etat: 'brouillon', compteId: 'alice' }),
    fiche({ id: '2', etat: 'a_envoyer', compteId: 'alice' }),
    fiche({ id: '3', etat: 'a_envoyer', compteId: 'alice' }),
    fiche({ id: '4', etat: 'refusee', compteId: 'alice' }),
    fiche({ id: '5', etat: 'envoyee', compteId: 'alice' }),
    fiche({ id: '6', etat: 'a_envoyer', compteId: 'bastien' }),
  ];

  it('compte les fiches du compte qui ne sont pas reçues par NTanova', () => {
    expect(ceQuiResteSurLeTelephone(fiches, 'alice')).toEqual({
      brouillons: 1,
      aEnvoyer: 2,
      refusees: 1,
      total: 4,
    });
  });

  it('ne compte ni les fiches envoyées ni celles d’un autre compte', () => {
    expect(ceQuiResteSurLeTelephone(fiches, 'bastien').total).toBe(1);
    expect(ceQuiResteSurLeTelephone(fiches, 'chloe').total).toBe(0);
  });
});

describe('l’avertissement avant de se déconnecter', () => {
  const rien = { brouillons: 0, aEnvoyer: 0, refusees: 0, total: 0 };

  it('dit ce qui reste sur le téléphone et que cela ne part qu’à la prochaine connexion avec ce compte', () => {
    const phrases = avertissementDeDeconnexion(
      { brouillons: 1, aEnvoyer: 2, refusees: 0, total: 3 },
      true,
    );
    expect(phrases[0]).toBe(
      '3 fiches ne sont pas encore reçues par NTanova (1 brouillon, 2 à envoyer).',
    );
    expect(phrases[1]).toMatch(/restent sur ce téléphone/);
    expect(phrases[1]).toMatch(/prochaine connexion avec ce compte/);
  });

  it('accorde au singulier', () => {
    expect(
      avertissementDeDeconnexion({ brouillons: 0, aEnvoyer: 0, refusees: 1, total: 1 }, true)[0],
    ).toBe('1 fiche n’est pas encore reçue par NTanova (1 refusée).');
  });

  it('prévient hors ligne : on ne peut pas se reconnecter sans réseau', () => {
    const phrases = avertissementDeDeconnexion(rien, false);
    expect(phrases.join(' ')).toMatch(/hors ligne/);
    expect(phrases.join(' ')).toMatch(/réseau/);
  });

  it('rassure quand tout est reçu et que le réseau est là', () => {
    expect(avertissementDeDeconnexion(rien, true)).toEqual([
      'Toutes vos fiches sont reçues par NTanova.',
    ]);
  });
});

describe('la phrase de l’écran de connexion sur les fiches restées dans le téléphone', () => {
  it('ne dit rien quand il n’en reste aucune', () => {
    expect(phraseFichesEnAttente(0)).toBeNull();
  });

  it('accorde au singulier', () => {
    expect(phraseFichesEnAttente(1)).toBe(
      '1 fiche de ce téléphone attend d’être envoyée. Elle part quand le relais qui l’a commencée se connecte.',
    );
  });

  it('accorde au pluriel', () => {
    expect(phraseFichesEnAttente(3)).toBe(
      '3 fiches de ce téléphone attendent d’être envoyées. Elles partent quand le relais qui les a commencées se connecte.',
    );
  });
});
