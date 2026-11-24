import { describe, expect, it } from 'vitest';
import { lireIssue } from '../../src/modele/demandes';
import {
  aReprendre,
  BROUILLON_MS,
  cleDeDemande,
  coordonneeMasquee,
  enAttente,
  lireArrivee,
  lireBrouillon,
  nouveauBrouillon,
  type Brouillon,
  type Enveloppe,
  type FicheConcernee,
} from '../../src/modele/envoi-public';

// Envoyer depuis le site public (refonte, lot 3C) : le brouillon de l'onglet, la clé d'une demande, l'adresse d'arrivée.

const MAINTENANT = Date.UTC(2026, 10, 24, 12);
const FICHE: FicheConcernee = {
  numero: '482913',
  id: '20000000-0000-4000-8000-000000000001',
  nom: '[École]',
  lieu: '[Quartier]',
  lien: '/ecoles/ecole-482913/',
};
const enveloppe = (plus: Partial<Enveloppe> = {}): Enveloppe => ({
  passe: { cle: 'c', emisLe: 1, sceau: 's' },
  fiche: null,
  dernier: null,
  attente: false,
  ...plus,
});
const brouillon = (plus: Partial<Brouillon> = {}): Brouillon => ({
  ...nouveauBrouillon('fiche', 'erreur'),
  ecritLe: MAINTENANT,
  champs: { correction: 'un texte' },
  ...plus,
});
const relu = (b: unknown, maintenant = MAINTENANT) => lireBrouillon(JSON.stringify(b), maintenant);

describe('le brouillon de l’onglet', () => {
  it('se relit tel quel pendant 24 h, pas une minute de plus', () => {
    const b = brouillon({
      fiche: FICHE,
      enveloppes: {
        x: enveloppe({ fiche: FICHE, dernier: { revision: 2, contenu: { message: 'a' } } }),
      },
    });
    expect(relu(b)).toEqual(b);
    expect(relu(b, MAINTENANT + BROUILLON_MS - 1)).toEqual(b);
    expect(relu(b, MAINTENANT + BROUILLON_MS)).toBeNull();
  });

  it('une horloge avancée puis remise à l’heure ne le prolonge pas', () => {
    expect(relu(brouillon({ ecritLe: MAINTENANT + BROUILLON_MS }))).toBeNull();
  });

  it('abîmé, d’une autre forme ou vide : rien, jamais une supposition', () => {
    expect(lireBrouillon(null, MAINTENANT)).toBeNull();
    expect(lireBrouillon('', MAINTENANT)).toBeNull();
    expect(lireBrouillon('{', MAINTENANT)).toBeNull();
    for (const b of [
      [],
      {},
      brouillon({ nature: 'autre' as never }),
      brouillon({ origine: 'ailleurs' as never }),
      brouillon({ fiche: { ...FICHE, id: 3 } as never }),
      brouillon({ champs: null as never }),
      brouillon({ enveloppes: { x: enveloppe({ passe: { cle: 'c' } as never }) } }),
      brouillon({ enveloppes: { x: enveloppe({ dernier: { revision: '1' } as never }) } }),
      brouillon({ enveloppes: { x: enveloppe({ fiche: 'x' as never }) } }),
    ]) {
      expect(relu(b), JSON.stringify(b)).toBeNull();
    }
  });

  it('ne propose de reprendre que s’il y a quelque chose à reprendre', () => {
    expect(aReprendre(brouillon())).toBe(true);
    expect(aReprendre(brouillon({ champs: {} }))).toBe(false);
    expect(aReprendre(brouillon({ champs: { a: '  ', b: false } }))).toBe(false);
    expect(
      aReprendre(
        brouillon({ champs: {}, enveloppes: { 'erreur:': enveloppe({ attente: true }) } }),
      ),
    ).toBe(true);
  });
});

describe('une demande, une clé', () => {
  it('deux natures ou deux fiches sont deux demandes ; un nom écrit à la main n’en fait pas une autre', () => {
    expect(cleDeDemande('erreur', null)).not.toBe(cleDeDemande('retrait', null));
    expect(cleDeDemande('erreur', FICHE)).not.toBe(cleDeDemande('erreur', null));
    expect(cleDeDemande('erreur', FICHE)).toBe(cleDeDemande('erreur', { ...FICHE, nom: 'x' }));
  });

  it('une demande sans confirmation se retrouve, celle de la page d’abord', () => {
    const erreur = cleDeDemande('erreur', null);
    const retrait = cleDeDemande('retrait', null);
    const deux = {
      [erreur]: enveloppe({ attente: true }),
      [retrait]: enveloppe({ attente: true }),
    };
    expect(enAttente(brouillon({ nature: 'retrait', enveloppes: deux }))).toEqual({
      cle: retrait,
      nature: 'retrait',
    });
    expect(enAttente(brouillon({ nature: 'absente', enveloppes: deux }))?.cle).toBe(erreur);
    expect(enAttente(brouillon({ enveloppes: { [erreur]: enveloppe() } }))).toBeNull();
  });
});

describe('l’adresse d’arrivée', () => {
  const lue = (q: string) => lireArrivee(new URLSearchParams(q));
  it('ne dit que des codes et un numéro public', () => {
    expect(lue('type=erreur&ecole=482913&depuis=fiche')).toEqual({
      nature: 'erreur',
      sujet: null,
      ecole: '482913',
      origine: 'fiche',
    });
    expect(lue('type=manque').nature).toBe('absente');
    expect(lue('type=retrait').nature).toBe('retrait');
    expect(lue('sujet=ecole&depuis=pour-les-ecoles')).toMatchObject({
      sujet: 'ecole',
      origine: 'pour-les-ecoles',
    });
  });
  it('une valeur inconnue ou fabriquée est ignorée', () => {
    expect(
      lue('type=contact&sujet=<b>&ecole=../x&depuis=https://ailleurs.test&nom=Marie&tel=06'),
    ).toEqual({ nature: null, sujet: null, ecole: null, origine: 'direct' });
  });
});

describe('ce que la confirmation rappelle', () => {
  it('assez pour se reconnaître, pas assez pour être lu', () => {
    // Insécable : le numéro masqué ne se coupe jamais en fin de ligne (constaté à 360 px, lot 3C).
    expect(coordonneeMasquee('whatsapp', '242061234567')).toBe('06\u00a0•••\u00a0••\u00a067');
    expect(coordonneeMasquee('whatsapp', '33612345678')).toBe('33\u00a0•••\u00a0••\u00a078');
    expect(coordonneeMasquee('email', 'prenom@exemple.com')).toBe('p•••@exemple.com');
  });
});

describe('les champs refusés par le serveur', () => {
  it('des champs connus et des codes connus, rien d’autre', () => {
    expect(
      lireIssue({
        code: 'refusee',
        erreurs: {
          message: 'trop_long',
          coordonnee: 'format',
          demande: 'illisible',
          ville: 'Marie a écrit ceci',
          inconnu: 'requis',
        },
      }),
    ).toEqual({
      genre: 'refuse',
      code: 'refusee',
      dejaEnregistree: null,
      erreurs: { message: 'trop_long', coordonnee: 'format', demande: 'illisible' },
    });
    expect(lireIssue({ code: 'refusee', erreurs: 'texte' })).not.toHaveProperty('erreurs');
  });
});
