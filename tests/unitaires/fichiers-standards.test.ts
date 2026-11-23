// `/llms.txt` et `/.well-known/security.txt` (23/11/2026) : le pays nommé sans confusion avec la RDC, ce que vaut une fiche,
// les mêmes lieux que le plan du site (jamais un lieu sans fiche), et un `security.txt` conforme à la RFC 9116.
import { describe, expect, it } from 'vitest';
import { llmsTxt, securityTxt } from '../../src/modele/fichiers-standards';
import type { PageDivision } from '../../src/modele/geo-divisions';
import type { EcolePubliee } from '../../src/modele/ports';

const ecole = (nom: string, numero: string, etiquette: string | null = null) =>
  ({
    nom,
    etiquette,
    slug: 'ecole-exemple',
    numero,
    divisionNoms: ['Congo', 'Pointe-Noire', 'Ngoyo'],
  }) as unknown as EcolePubliee;
const lieu = (
  chemin: string[],
  noms: string[],
  ecoles: EcolePubliee[],
  enfants: PageDivision[] = [],
) => ({ chemin, noms, ecoles, enfants }) as unknown as PageDivision;

const a = ecole('Complexe [Exemple] B', '482913', 'Campus 2');
const b = ecole('Complexe Exemple A', '111111');
const ngoyo = lieu(['pointe-noire', 'ngoyo'], ['Congo', 'Pointe-Noire', 'Ngoyo'], [a, b]);
const vide = lieu(['pointe-noire', 'tie-tie'], ['Congo', 'Pointe-Noire', 'Tié-Tié'], []);
const ville = lieu(['pointe-noire'], ['Congo', 'Pointe-Noire'], [], [ngoyo, vide]);
const pays = lieu([], ['Congo'], [], [ville]);

describe('llms.txt', () => {
  const texte = llmsTxt('https://ntanova.com', [pays, ville, ngoyo, vide, ngoyo], [a, b, a]);

  it('commence par le titre et un résumé qui nomme le Congo-Brazzaville, pas la RDC', () => {
    expect(texte.startsWith('# NTanova\n\n> ')).toBe(true);
    expect(texte).toContain('Congo-Brazzaville, pas la République démocratique du Congo');
  });

  it('dit ce que vaut une fiche, sans prétendre à une couverture complète ni à la gratuité', () => {
    expect(texte).toContain('accord daté de la direction');
    expect(texte).toContain('ne prétend pas recenser toutes les écoles');
    expect(texte.toLowerCase()).not.toContain('gratuit');
  });

  it('liste les pages fixes, aux adresses absolues', () => {
    for (const page of [
      '/',
      '/ecoles/',
      '/a-propos/',
      '/methode/',
      '/donnees/',
      '/mentions-legales/',
    ])
      expect(texte).toContain(`(https://ntanova.com${page})`);
  });

  it('liste les lieux qui ont une fiche, une fois chacun, jamais un lieu vide ni le pays seul', () => {
    expect(texte).toContain('- [Pointe-Noire](https://ntanova.com/ecoles/pointe-noire/)');
    expect(texte).toContain(
      '- [Pointe-Noire › Ngoyo](https://ntanova.com/ecoles/pointe-noire/ngoyo/)',
    );
    expect(texte).not.toContain('tie-tie');
    expect(texte.split('/ecoles/pointe-noire/ngoyo/)').length).toBe(2);
  });

  it('liste chaque fiche une fois, par ordre alphabétique, avec son lieu, sans casser un lien Markdown', () => {
    const i = texte.indexOf('Complexe Exemple A');
    const j = texte.indexOf('Complexe Exemple B, Campus 2');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(texte).toContain(
      '- [Complexe Exemple B, Campus 2](https://ntanova.com/ecoles/ecole-exemple-482913/) : Pointe-Noire, Ngoyo',
    );
    expect(texte.split('ecole-exemple-482913/)').length).toBe(2);
  });
});

describe('security.txt', () => {
  const maintenant = new Date('2026-11-23T10:00:00Z');

  it('a un contact, une expiration à moins d’un an et son adresse canonique (RFC 9116)', () => {
    const texte = securityTxt('https://ntanova.com', 'contact@exemple.cg', maintenant);
    expect(texte).toContain('Contact: mailto:contact@exemple.cg\n');
    expect(texte).toContain('Canonical: https://ntanova.com/.well-known/security.txt\n');
    const expire = new Date(/Expires: (.+)\n/.exec(texte)?.[1] ?? '');
    const jours = (expire.getTime() - maintenant.getTime()) / 86_400_000;
    expect(jours).toBeGreaterThan(300);
    expect(jours).toBeLessThan(365);
  });

  it('renvoie aux mentions légales quand aucune adresse n’est configurée', () => {
    expect(securityTxt('https://ntanova.com', undefined, maintenant)).toContain(
      'Contact: https://ntanova.com/mentions-legales/\n',
    );
  });
});
