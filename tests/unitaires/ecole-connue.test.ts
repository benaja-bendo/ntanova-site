// Lot 3 du cahier : « Est-ce une école connue ? ». Le verdict suit la base (`similar_schools`) : 100 m, 500 m, 0,45.
import { describe, expect, it } from 'vitest';
import { affinerLesCandidats, memeEcolePossible, motsDeLieux } from '../../src/modele/autre-site';
import { noyauDuNom, ressemblance } from '../../src/modele/deja-sur-ntanova';
import { verdictDeProximite, type EcoleSimilaire } from '../../src/modele/fiche-admin';

describe('le verdict de proximité', () => {
  it('à moins de 100 m avec un nom proche, c’est le même endroit', () => {
    expect(verdictDeProximite(40, 0.8)).toBe('deja_la');
  });
  it('lot G : un autre nom à moins de 100 m, c’est une voisine (« Même lieu » se propose)', () => {
    expect(verdictDeProximite(40, 0)).toBe('voisine');
  });
  it('à moins de 500 m avec un nom proche, aussi', () => {
    expect(verdictDeProximite(450, 0.6)).toBe('deja_la');
  });
  it('un nom proche plus loin : un autre site', () => {
    expect(verdictDeProximite(1100, 0.6)).toBe('autre_site');
    expect(verdictDeProximite(null, 0.5)).toBe('autre_site');
  });
  it('un autre nom à moins de 500 m : une voisine', () => {
    expect(verdictDeProximite(300, 0.1)).toBe('voisine');
  });
  it('rien de proche, ni par le nom ni par la distance', () => {
    expect(verdictDeProximite(2000, 0.2)).toBeNull();
    expect(verdictDeProximite(null, 0.2)).toBeNull();
  });
  it('ticket 201 (A18) : le même nom, une école connue sans position, c’est « déjà dans la base »', () => {
    expect(verdictDeProximite(null, 0.6, false)).toBe('deja_la');
    expect(verdictDeProximite(null, 0.6, true)).toBe('autre_site');
    expect(verdictDeProximite(null, 0.2, false)).toBeNull();
  });
});

// Ticket 236 (27/11) : « Un autre site de cette école ? » se déclenchait sur un nom de lieu partagé (3,2 km) et sur un mot
// courant d'une autre ville (379 km). Noms et lieux inventés.
describe('un autre site : un mot distinctif, et la distance', () => {
  const lieux = motsDeLieux(['Pointe-Noire', 'Brazzaville', 'Tchimbamba', null]);
  const candidat = (
    nom: string,
    distanceM: number | null,
    verdict: EcoleSimilaire['verdict'] = 'autre_site',
  ): EcoleSimilaire => ({
    genre: 'campus',
    id: nom,
    institutionId: 'i',
    nom,
    sigle: null,
    etat: 'publiee',
    distanceM,
    ressemblance: 0.5,
    verdict,
  });

  it('un nom de quartier partagé ne suffit pas, même à 3,2 km', () => {
    const nom = 'Complexe scolaire Les Ixias de Tchimbamba';
    const autre = 'École L’Okapi de Tchimbamba';
    // La base les rapproche par le nom entier : c'est ce que l'écran relit désormais.
    expect(ressemblance(noyauDuNom(nom), noyauDuNom(autre))).toBeGreaterThanOrEqual(0.45);
    expect(affinerLesCandidats(nom, [candidat(autre, 3200)], lieux)).toEqual([]);
  });

  it('dans une autre ville, il faut le même nom distinctif', () => {
    const loin = 'Groupe scolaire La Girafe Bleue';
    expect(ressemblance(noyauDuNom('École La Girafe'), noyauDuNom(loin))).toBeGreaterThanOrEqual(
      0.45,
    );
    expect(affinerLesCandidats('École La Girafe', [candidat(loin, 379_000)], lieux)).toEqual([]);
    expect(
      affinerLesCandidats(
        'Institut Zimbola',
        [candidat('Institut supérieur Zimbola — Campus de la gare', 379_000)],
        lieux,
      ),
    ).toHaveLength(1);
  });

  it('dans la même ville, ou sans distance, un mot distinctif commun propose le site', () => {
    expect(
      memeEcolePossible('Les Palmiers de Tchimbamba', 'Les Petits Palmiers', 4000, lieux),
    ).toBe(true);
    expect(memeEcolePossible('Lycée Zimbola', 'Zimbola', null, lieux)).toBe(true);
    // « Sainte » ne distingue rien.
    expect(memeEcolePossible('École Sainte Girafe', 'École Sainte Boussole', 2000, lieux)).toBe(
      false,
    );
  });

  it('tout près sans mot distinctif commun : une voisine, jamais « déjà dans la base »', () => {
    const [c] = affinerLesCandidats(
      'École L’Okapi de Tchimbamba',
      [candidat('Les Ixias de Tchimbamba', 120, 'deja_la')],
      lieux,
    );
    expect(c?.verdict).toBe('voisine');
  });

  it('un nom fait de lieux et de mots courants ne se rapproche que du même nom', () => {
    expect(memeEcolePossible('Lycée de Tchimbamba', 'École de Tchimbamba', 900, lieux)).toBe(true);
    expect(
      memeEcolePossible('Lycée de Tchimbamba', 'École L’Okapi de Tchimbamba', 900, lieux),
    ).toBe(false);
  });
});
