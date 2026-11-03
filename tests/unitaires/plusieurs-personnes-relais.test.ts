import { describe, expect, it } from 'vitest';
import {
  ajouterUnePersonne,
  contactVide,
  erreursEtape3,
  nouvelleFiche,
  retirerUnePersonne,
  toutEnvoye,
  versAutresPersonnes,
  versContact,
  type FicheLocale,
} from '../../src/modele/fiche';

// Plusieurs personnes à contacter, côté relais (ticket #96, étape 2) : la direction, puis une ou deux autres personnes,
// chacune avec son accord et son identifiant (l'envoi se rejoue sans doublon). Trois au plus par fiche.

const vue = (champs: Partial<FicheLocale> = {}): FicheLocale => ({
  ...nouvelleFiche('f1', '2026-11-03T08:00:00.000Z', null),
  direction: 'vue',
  contact: {
    ...contactVide(),
    fonction: 'directeur',
    accord: true,
    accordLe: '2026-11-03T08:05:00.000Z',
    whatsapp: '06 111 11 11',
  },
  ...champs,
});

describe('les autres personnes d’une fiche', () => {
  it('s’ajoutent avec un identifiant, deux au plus en plus de la direction', () => {
    const une = ajouterUnePersonne(vue(), 'p1');
    expect(une.autresPersonnes).toHaveLength(1);
    expect(une.autresPersonnes?.[0]).toMatchObject({ id: 'p1', fonction: null, accord: false });
    const deux = ajouterUnePersonne(une, 'p2');
    expect(deux.autresPersonnes?.map((p) => p.id)).toEqual(['p1', 'p2']);
    // Trois personnes au plus, la direction comprise : la suivante n'est pas ajoutée.
    expect(ajouterUnePersonne(deux, 'p3')).toBe(deux);
  });

  it('se retirent une à une', () => {
    const f = ajouterUnePersonne(ajouterUnePersonne(vue(), 'p1'), 'p2');
    expect(retirerUnePersonne(f, 'p1').autresPersonnes?.map((p) => p.id)).toEqual(['p2']);
    expect(retirerUnePersonne(vue(), 'absente').autresPersonnes ?? []).toEqual([]);
  });

  it('partent chacune avec leur identifiant, leur fonction, leur précision, et leur numéro seulement avec leur accord', () => {
    const f = vue({
      autresPersonnes: [
        {
          ...contactVide(),
          id: 'p1',
          fonction: 'autre',
          precision: ' enseignant ',
          nom: ' M. Okemba ',
          accord: true,
          accordLe: '2026-11-03T08:10:00.000Z',
          whatsapp: '06 222 22 22',
        },
        { ...contactVide(), id: 'p2', fonction: 'secretariat', whatsapp: '06 333 33 33' },
      ],
    });
    expect(versAutresPersonnes(f)).toEqual([
      {
        releveId: 'f1',
        contactId: 'p1',
        fonction: 'autre',
        precisionFonction: 'enseignant',
        nom: 'M. Okemba',
        whatsapp: '242062222222',
        accord: true,
        accordLe: '2026-11-03T08:10:00.000Z',
        note: null,
      },
      {
        releveId: 'f1',
        contactId: 'p2',
        fonction: 'secretariat',
        precisionFonction: null,
        nom: null,
        whatsapp: null,
        accord: false,
        accordLe: null,
        note: null,
      },
    ]);
  });

  it('ne partent pas quand la direction n’a pas été vue', () => {
    const autres = [{ ...contactVide(), id: 'p1', fonction: 'directeur' as const }];
    expect(versAutresPersonnes(vue({ direction: 'absente', autresPersonnes: autres }))).toEqual([]);
    expect(versAutresPersonnes(vue({ direction: 'refus', autresPersonnes: autres }))).toEqual([]);
  });

  it('la fonction « autre » de la direction dit aussi de quoi il s’agit', () => {
    const f = vue({
      contact: { ...contactVide(), fonction: 'autre', precision: 'propriétaire', accord: false },
    });
    expect(versContact(f)?.precisionFonction).toBe('propriétaire');
    expect(versContact(vue())?.precisionFonction).toBeNull();
  });

  it('chacune doit avoir sa fonction et son accord pour un numéro, champ par champ', () => {
    const f = vue({
      autresPersonnes: [
        { ...contactVide(), id: 'p1' },
        { ...contactVide(), id: 'p2', fonction: 'directeur', whatsapp: '06 222 22 22' },
      ],
    });
    const e = erreursEtape3(f);
    expect(e['personne0.fonction']).toBe('Choisissez sa fonction.');
    expect(e['personne1.whatsapp']).toBe('Sans son accord, ne notez pas son numéro.');
    // Les champs de la direction gardent leur nom d'avant.
    expect(e['fonction']).toBeUndefined();
  });

  it('les autres personnes valides ne bloquent rien', () => {
    const f = vue({
      autresPersonnes: [{ ...contactVide(), id: 'p1', fonction: 'secretariat' }],
    });
    expect(erreursEtape3(f)).toEqual({});
  });

  it('une direction absente ou qui refuse ne contrôle pas les autres personnes', () => {
    const autres = [{ ...contactVide(), id: 'p1' }];
    expect(erreursEtape3(vue({ direction: 'absente', autresPersonnes: autres }))).toEqual({});
  });

  it('la fiche n’est entièrement partie que lorsque toutes les personnes le sont', () => {
    const envoyee = vue({
      envoyes: { releve: true, photo: true, contact: true },
      autresPersonnes: [{ ...contactVide(), id: 'p1', fonction: 'directeur' }],
    });
    expect(toutEnvoye(envoyee)).toBe(false);
    expect(toutEnvoye({ ...envoyee, autresPersonnes: [] })).toBe(true);
    // Une fiche d'avant n'a pas de liste.
    const ancienne: Partial<FicheLocale> = { ...envoyee };
    delete ancienne.autresPersonnes;
    expect(toutEnvoye(ancienne as FicheLocale)).toBe(true);
  });
});
