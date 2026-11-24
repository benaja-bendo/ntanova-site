import { beforeEach, describe, expect, it } from 'vitest';
import { REGLAGES, type Contenu, type Nature } from '../../src/modele/demandes';
import type { EnvoiPublic, LaissezPasser, PortDemandes } from '../../src/modele/envoi-public';
import { creerDemandesFausses } from '../../src/infra/faux/demandes-publiques';
import { creerMessagesFaux, type EtatDesMessages } from '../../src/infra/faux/messages';

// Le faux serveur des formulaires (refonte, lot 3C) : les neuf situations du contrat, ses bornes et ses refus, sur la même boîte que
// la fausse administration. Les parcours s'appuient sur lui : il doit répondre comme la base (`messages_envoi.test.sql`).

let memoire: string | null;
let reglages: Record<string, string>;
let port: PortDemandes;
const etat = (): EtatDesMessages =>
  memoire
    ? (JSON.parse(memoire) as EtatDesMessages)
    : {
        messages: [],
        dernierPassageAlertesLe: null,
        dernierPassagePurgeLe: null,
        plafondAtteintLe: null,
      };

beforeEach(() => {
  memoire = null;
  reglages = {};
  port = creerDemandesFausses({
    garde: () => memoire,
    garder: (e) => {
      memoire = e;
    },
    reglage: (nom) => reglages[nom] ?? null,
    reseau: async () => {},
    maintenant: () => Date.UTC(2026, 10, 24, 12),
  });
});

const contact = (message: string): Contenu => ({ origine: 'pied', message, reponse: 'non' });
async function passe(): Promise<LaissezPasser> {
  const r = await port.demanderLaissezPasser();
  if (r.genre !== 'accorde') throw new Error(r.genre);
  return r.passe;
}
const envoi = (
  p: LaissezPasser,
  revision: number,
  contenu: Contenu,
  nature: Nature = 'contact',
): EnvoiPublic => ({ passe: p, revision, nature, contenu, piege: '' });
const admin = () =>
  creerMessagesFaux({
    reseau: async () => {},
    garde: () => memoire,
    garder: (e) => {
      memoire = e;
    },
    panne: () => null,
    estAdmin: () => true,
    ecole: () => null,
    photoDeLEcole: () => false,
    photoPublique: () => false,
    depart: () => null,
  });
/** La référence d'un envoi enregistré, sinon un échec lisible. */
async function reussi(e: EnvoiPublic, code: string): Promise<string> {
  const i = await port.envoyer(e);
  expect(i).toMatchObject({ genre: 'enregistre', code });
  return i.genre === 'enregistre' ? i.reference : '';
}

describe('les neuf situations du contrat', () => {
  it('1, 3 : une création, puis le même texte : la même référence, une seule demande, une seule alerte', async () => {
    const p = await passe();
    const ref = await reussi(envoi(p, 1, contact('a')), 'enregistree');
    expect(await reussi(envoi(p, 1, contact('a')), 'deja_enregistree')).toBe(ref);
    expect(await reussi(envoi(p, 7, contact('a')), 'deja_enregistree')).toBe(ref);
    expect(etat().messages).toHaveLength(1);
    expect(etat().messages[0]).toMatchObject({
      reference: ref,
      etat: 'recue',
      envoi: { ecritures: 1 },
    });
  });

  it('2 : clé inconnue, laissez-passer expiré, faux ou absent : rien', async () => {
    const p = await passe();
    reglages.avance = String(REGLAGES.validiteJours * 24 * 60 - 60);
    await reussi(envoi(p, 1, contact('à 6 j 23 h')), 'enregistree');
    reglages.avance = String(REGLAGES.validiteJours * 24 * 60);
    const neuf = { ...p, cle: 'd1200000-0000-4000-8000-000000000009' };
    for (const mauvais of [neuf, { ...neuf, sceau: 'faux' }, { ...p, emisLe: p.emisLe + 999999 }]) {
      expect(await port.envoyer(envoi(mauvais, 1, contact('b')))).toMatchObject({
        genre: 'refuse',
        code: 'expiree',
      });
    }
    expect(etat().messages).toHaveLength(1);
  });

  it('3, 4 : expiré, un renvoi identique retrouve sa référence ; un autre texte ne s’écrit pas et rend la référence', async () => {
    const p = await passe();
    const ref = await reussi(envoi(p, 1, contact('a')), 'enregistree');
    reglages.avance = String(8 * 24 * 60);
    expect(await reussi(envoi(p, 1, contact('a')), 'deja_enregistree')).toBe(ref);
    expect(await port.envoyer(envoi(p, 2, contact('b')))).toEqual({
      genre: 'refuse',
      code: 'expiree',
      dejaEnregistree: ref,
    });
  });

  it('5, 7 : jamais ouverte, la plus récente devient courante ; un texte en retard est gardé sans la remplacer', async () => {
    const p = await passe();
    const ref = await reussi(envoi(p, 1, contact('a')), 'enregistree');
    expect(await reussi(envoi(p, 3, contact('c')), 'mise_a_jour')).toBe(ref);
    expect(await reussi(envoi(p, 2, contact('b')), 'version_ancienne')).toBe(ref);
    const m = await admin().ouvrirMessage(ref);
    expect(m.versions.find((v) => v.courante)?.contenu.message).toBe('c');
    expect(m.versions.find((v) => v.tardive)?.contenu.message).toBe('b');
  });

  it('6, 8 : ouverte, le texte suivant est une suite reliée ; une révision déjà reçue avec un autre texte aussi', async () => {
    const p = await passe();
    const ref = await reussi(envoi(p, 1, contact('a')), 'enregistree');
    await admin().ouvrirMessage(ref);
    const suite = await port.envoyer(envoi(p, 2, contact('b')));
    expect(suite).toMatchObject({ code: 'suite', precedente: ref });
    const refSuite = suite.genre === 'enregistre' ? suite.reference : '';
    expect(await port.envoyer(envoi(p, 2, contact('b')))).toMatchObject({
      code: 'deja_enregistree',
      reference: refSuite,
      precedente: ref,
    });
    expect((await admin().ouvrirMessage(ref)).versions).toHaveLength(1);
    expect((await admin().ouvrirMessage(refSuite)).suiteDe).toBe(ref);

    const q = await passe();
    await reussi(envoi(q, 1, contact('x')), 'enregistree');
    expect(await port.envoyer(envoi(q, 1, contact('y')))).toMatchObject({ code: 'suite' });
  });

  it('9 : huit écritures, trois suites, puis un refus daté qui n’écrit pas le texte', async () => {
    const p = await passe();
    const ref = await reussi(envoi(p, 1, contact('t1')), 'enregistree');
    for (let r = 2; r <= REGLAGES.ecrituresParCle; r++) {
      await reussi(envoi(p, r, contact(`t${r}`)), 'mise_a_jour');
    }
    expect(await port.envoyer(envoi(p, 9, contact('t9')))).toEqual({
      genre: 'refuse',
      code: 'limite_atteinte',
      dejaEnregistree: ref,
    });
    expect(memoire).not.toContain('t9"');
    expect(etat().messages[0]!.limiteLe).not.toBeNull();

    const q = await passe();
    const ouverte = await reussi(envoi(q, 1, contact('s1')), 'enregistree');
    await admin().ouvrirMessage(ouverte);
    for (let r = 2; r <= 1 + REGLAGES.suitesParCle; r++) {
      await reussi(envoi(q, r, contact(`s${r}`)), 'suite');
    }
    expect(await port.envoyer(envoi(q, 9, contact('s9')))).toMatchObject({
      code: 'limite_atteinte',
    });
  });
});

describe('les autres refus', () => {
  it('une autre nature sous la même clé, une fiche retirée, un contenu refusé : rien d’écrit', async () => {
    const p = await passe();
    await reussi(envoi(p, 1, contact('a')), 'enregistree');
    const absente: Contenu = { origine: 'pied', nomEcole: 'x', ville: 'y', reponse: 'non' };
    expect(await port.envoyer(envoi(p, 2, absente, 'absente'))).toMatchObject({
      code: 'cle_deja_utilisee',
    });
    const fiche = 'd1200000-0000-4000-8000-000000000007';
    reglages['fiches-retirees'] = fiche;
    const erreur: Contenu = {
      origine: 'fiche',
      fiche,
      information: 'nom',
      correction: 'z',
      reponse: 'non',
    };
    expect(await port.envoyer(envoi(await passe(), 1, erreur, 'erreur'))).toMatchObject({
      code: 'ecole_inconnue',
    });
    expect(await port.envoyer(envoi(await passe(), 1, {}, 'contact'))).toMatchObject({
      code: 'refusee',
      erreurs: { message: 'requis', reponse: 'requis' },
    });
    expect(etat().messages).toHaveLength(1);
  });

  it('fermé, plafond, connexion, coupure avant, coupure après, réponse inconnue', async () => {
    const p = await passe();
    reglages.envois = 'fermes';
    expect(await port.demanderLaissezPasser()).toEqual({ genre: 'ferme' });
    for (const [panne, code] of [
      ['plafond', 'plafond'],
      ['trop', 'trop_d_envois'],
    ] as const) {
      reglages.envois = panne;
      expect(await port.envoyer(envoi(p, 1, contact('a')))).toMatchObject({ code });
    }
    reglages.envois = 'avant';
    expect(await port.envoyer(envoi(p, 1, contact('a')))).toEqual({ genre: 'non_confirme' });
    expect(etat().messages).toHaveLength(0);
    reglages.envois = 'apres';
    expect(await port.envoyer(envoi(p, 1, contact('a')))).toEqual({ genre: 'non_confirme' });
    expect(etat().messages).toHaveLength(1);
    reglages.envois = 'illisible';
    expect(await port.envoyer(envoi(p, 1, contact('a')))).toEqual({ genre: 'non_confirme' });
    delete reglages.envois;
    expect(await reussi(envoi(p, 1, contact('a')), 'deja_enregistree')).toBe(
      etat().messages[0]!.reference,
    );
  });

  it('une répétition identique passe malgré le plafond ; un message purgé ne renaît pas d’une vieille page', async () => {
    const p = await passe();
    const ref = await reussi(envoi(p, 1, contact('a')), 'enregistree');
    reglages.envois = 'plafond';
    expect(await reussi(envoi(p, 1, contact('a')), 'deja_enregistree')).toBe(ref);
    delete reglages.envois;
    memoire = null; // la purge : plus aucune trace, pas même une empreinte.
    reglages.avance = String(REGLAGES.indesirableJours * 24 * 60);
    expect(await port.envoyer(envoi(p, 1, contact('a')))).toMatchObject({ code: 'expiree' });
    expect(memoire).toBeNull();
  });

  it('le champ piège : la même réponse, rangé avec les indésirables, sans alerte', async () => {
    const i = await port.envoyer({ ...envoi(await passe(), 1, contact('a')), piege: 'x' });
    expect(i).toMatchObject({ genre: 'enregistre', code: 'enregistree' });
    expect(etat().messages[0]).toMatchObject({ etat: 'indesirable', alerte: null });
  });
});
