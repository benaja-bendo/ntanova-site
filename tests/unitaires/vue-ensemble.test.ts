import { describe, expect, it } from 'vitest';
import { lireVueEnsemble, zonesOuvertesRacines } from '../../src/modele/vue-ensemble';

// La vue d'ensemble de l'administration (ticket #76). La base rend du JSON ; le modèle le lit sans jamais casser :
// un champ absent vaut zéro, un nombre venu en texte se lit, rien ne lève d'erreur.

const reponse = {
  generated_at: '2026-11-03T12:00:00+00:00',
  to_review: { count: 3, oldest_received_at: '2026-11-02T06:00:00+00:00', over_24h: 1 },
  received_per_day: [
    { day: '2026-11-02', total: 2, trial: 1 },
    { day: '2026-11-03', total: 1, trial: 0 },
  ],
  decisions: { count: 4, average_hours: 3.5 },
  signboard: { with_photo: 2, total: 3 },
  contacts: { confirmed_total: 2, confirmed_7d: 1 },
  relays: { active: 5, pending: 1, suspended: 0, sent_this_week: 2 },
};

describe('lireVueEnsemble', () => {
  it('lit la réponse de la base', () => {
    expect(lireVueEnsemble(reponse)).toEqual({
      generee: '2026-11-03T12:00:00+00:00',
      aValider: { nombre: 3, plusAncienneLe: '2026-11-02T06:00:00+00:00', depuisPlusDe24h: 1 },
      recusParJour: [
        { jour: '2026-11-02', total: 2, essai: 1 },
        { jour: '2026-11-03', total: 1, essai: 0 },
      ],
      decisions: { nombre: 4, delaiMoyenHeures: 3.5 },
      enseigne: { avecPhoto: 2, total: 3 },
      contacts: { confirmesTotal: 2, confirmes7j: 1 },
      relais: { actifs: 5, enAttente: 1, suspendus: 0, ontEnvoye7j: 2 },
    });
  });

  it('une file vide n’a pas de plus ancienne fiche, un délai absent reste absent', () => {
    const vue = lireVueEnsemble({
      ...reponse,
      to_review: { count: 0, oldest_received_at: null, over_24h: 0 },
      decisions: { count: 0, average_hours: null },
    });
    expect(vue.aValider.plusAncienneLe).toBeNull();
    expect(vue.decisions.delaiMoyenHeures).toBeNull();
  });

  it('un champ absent vaut zéro : une base plus ancienne ou plus récente ne casse rien', () => {
    const vue = lireVueEnsemble({});
    expect(vue.aValider).toEqual({ nombre: 0, plusAncienneLe: null, depuisPlusDe24h: 0 });
    expect(vue.recusParJour).toEqual([]);
    expect(vue.relais).toEqual({ actifs: 0, enAttente: 0, suspendus: 0, ontEnvoye7j: 0 });
  });

  it('une réponse qui n’est pas un objet se lit comme vide', () => {
    expect(lireVueEnsemble(null).aValider.nombre).toBe(0);
    expect(lireVueEnsemble('oups').relais.actifs).toBe(0);
  });

  it('un nombre rendu en texte (numeric de PostgreSQL) se lit', () => {
    const vue = lireVueEnsemble({ ...reponse, decisions: { count: '4', average_hours: '3.5' } });
    expect(vue.decisions).toEqual({ nombre: 4, delaiMoyenHeures: 3.5 });
  });
});

describe('zonesOuvertesRacines', () => {
  const z = (chemin: string, ouverte: boolean) => ({ id: chemin, chemin, ouverte });

  it('une zone ouverte sous une autre zone ouverte n’est pas comptée deux fois', () => {
    const zones = [
      z('congo.brazzaville.brazzaville', true),
      z('congo.brazzaville.brazzaville.bacongo', true),
      z('congo.pointe_noire.pointe_noire.ngoyo', true),
      z('congo.pointe_noire.pointe_noire.lumumba', false),
    ];
    expect(zonesOuvertesRacines(zones).map((d) => d.chemin)).toEqual([
      'congo.brazzaville.brazzaville',
      'congo.pointe_noire.pointe_noire.ngoyo',
    ]);
  });

  it('un nom qui n’est qu’un début de chemin n’est pas un parent', () => {
    const zones = [z('congo.pointe_noire', true), z('congo.pointe_noire_est', true)];
    expect(zonesOuvertesRacines(zones)).toHaveLength(2);
  });

  it('aucune zone ouverte : liste vide', () => {
    expect(zonesOuvertesRacines([z('congo', false)])).toEqual([]);
  });
});
