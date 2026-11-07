import { describe, expect, it } from 'vitest';
import type { DivisionVue } from '../../src/modele/ports';
import {
  SEUIL_OUVERTURE_LARGE,
  etapesDeLaCarte,
  etatHerite,
  libelleEtat,
  lignesDeLArbre,
  origineDesFiches,
  phraseDesEcoles,
  phraseDuResume,
  resumeDesZones,
  surLaCarte,
  zonesDessous,
} from '../../src/modele/zones-admin';

const zone = (
  o: Pick<DivisionVue, 'id' | 'nom' | 'genre' | 'niveau' | 'chemin'> & Partial<DivisionVue>,
): DivisionVue => ({
  parentId: null,
  slug: o.id,
  ouverte: false,
  deploiement: null,
  ecoles: 0,
  publiees: 0,
  relevees: 0,
  ajoutees: 0,
  importees: 0,
  ...o,
});

/** Un petit pays : une ville qui compte (Loandjili actif, Mongo programmé), et du vide autour. */
const PAYS: DivisionVue[] = [
  zone({
    id: 'cg',
    nom: 'Congo',
    genre: 'country',
    niveau: 0,
    chemin: 'congo',
    ecoles: 3,
    publiees: 2,
  }),
  zone({
    id: 'pn-dep',
    parentId: 'cg',
    nom: 'Pointe-Noire',
    genre: 'department',
    niveau: 1,
    chemin: 'congo.pn',
    ecoles: 3,
    publiees: 2,
  }),
  zone({
    id: 'pn',
    parentId: 'pn-dep',
    nom: 'Pointe-Noire',
    genre: 'city',
    niveau: 2,
    chemin: 'congo.pn.pn',
    ecoles: 3,
    publiees: 2,
  }),
  zone({
    id: 'loa',
    parentId: 'pn',
    nom: 'Loandjili',
    genre: 'arrondissement',
    niveau: 3,
    chemin: 'congo.pn.pn.loa',
    ecoles: 3,
    publiees: 2,
    relevees: 2,
    importees: 1,
    deploiement: 'actif',
    ouverte: true,
  }),
  zone({
    id: 'mon',
    parentId: 'pn',
    nom: 'Mongo-Mpoukou',
    genre: 'arrondissement',
    niveau: 3,
    chemin: 'congo.pn.pn.mon',
    deploiement: 'programme',
  }),
  zone({
    id: 'tie',
    parentId: 'pn',
    nom: 'Tié-Tié',
    genre: 'arrondissement',
    niveau: 3,
    chemin: 'congo.pn.pn.tie',
  }),
  zone({
    id: 'ngo',
    parentId: 'pn',
    nom: 'Ngoyo',
    genre: 'arrondissement',
    niveau: 3,
    chemin: 'congo.pn.pn.ngo',
  }),
  zone({
    id: 'bz-dep',
    parentId: 'cg',
    nom: 'Brazzaville',
    genre: 'department',
    niveau: 1,
    chemin: 'congo.bz',
  }),
  zone({
    id: 'bz',
    parentId: 'bz-dep',
    nom: 'Brazzaville',
    genre: 'city',
    niveau: 2,
    chemin: 'congo.bz.bz',
  }),
  zone({
    id: 'mou',
    parentId: 'bz',
    nom: 'Moungali',
    genre: 'arrondissement',
    niveau: 3,
    chemin: 'congo.bz.bz.mou',
  }),
  zone({
    id: 'ni-dep',
    parentId: 'cg',
    nom: 'Niari',
    genre: 'department',
    niveau: 1,
    chemin: 'congo.ni',
  }),
  zone({
    id: 'dol',
    parentId: 'ni-dep',
    nom: 'Dolisie',
    genre: 'commune',
    niveau: 2,
    chemin: 'congo.ni.dol',
  }),
];

const resume = (l: ReturnType<typeof lignesDeLArbre>) =>
  l.map((x) =>
    x.type === 'zone' ? `${x.zone.id}@${x.indent}` : `${x.id}#${x.nombre}@${x.indent}`,
  );

describe('les zones que la carte dessine', () => {
  it('une ville, une commune, un district et un arrondissement ; ni le pays, ni un département, ni un quartier', () => {
    expect(
      (['city', 'commune', 'district', 'arrondissement'] as const).every((genre) =>
        surLaCarte({ genre }),
      ),
    ).toBe(true);
    expect(
      (['country', 'department', 'region', 'quarter', 'zone'] as const).some((genre) =>
        surLaCarte({ genre }),
      ),
    ).toBe(false);
  });

  it('dit les trois états avec les mots du site', () => {
    expect(libelleEtat(null)).toBe('Pas encore couverte');
    expect(libelleEtat('programme')).toBe('Déploiement programmé');
    expect(libelleEtat('actif')).toBe('Relevé en cours');
  });

  it('un geste large touche au moins cinq autres zones', () => {
    expect(SEUIL_OUVERTURE_LARGE).toBe(5);
    expect(zonesDessous(PAYS[0]!, PAYS)).toHaveLength(11);
    expect(zonesDessous(PAYS[2]!, PAYS).map((z) => z.id)).toEqual(['loa', 'mon', 'tie', 'ngo']);
    expect(zonesDessous(PAYS[3]!, PAYS)).toEqual([]);
  });
});

describe('ce que les familles lisent d’une zone sans état à elle', () => {
  const ville = PAYS[2]!;

  it('la ville prend « relevé en cours » dès qu’un arrondissement l’est', () => {
    expect(etatHerite(ville, PAYS)).toBe('actif');
  });

  it('sinon « déploiement programmé » dès qu’un arrondissement l’est', () => {
    const sansActif = PAYS.map((z) => (z.id === 'loa' ? { ...z, deploiement: null } : z));
    expect(etatHerite(ville, sansActif)).toBe('programme');
  });

  it('rien en dessous, rien d’hérité ; un état à soi ne se double pas d’un état hérité', () => {
    expect(etatHerite(PAYS[8]!, PAYS)).toBeNull();
    expect(etatHerite({ ...ville, deploiement: 'programme' }, PAYS)).toBeNull();
  });
});

describe('l’arbre des zones', () => {
  it('garde les zones qui comptent et replie les autres en une ligne sous leur parent', () => {
    expect(resume(lignesDeLArbre(PAYS))).toEqual([
      'cg@0',
      'pn-dep@1',
      'pn@2',
      'loa@3',
      'mon@3',
      'groupe:pn#2@3',
      'groupe:cg#5@1',
    ]);
  });

  it('une zone dont on connaît l’état, ou qui a une école, ou ouverte, compte', () => {
    const tout = PAYS.map((z) => (z.id === 'tie' ? { ...z, ouverte: true } : z));
    expect(resume(lignesDeLArbre(tout))).toContain('tie@3');
    expect(resume(lignesDeLArbre(tout))).toContain('groupe:pn#1@3');
  });

  it('un groupe ouvert montre ses zones, un cran plus bas que lui, et chaque niveau garde son retrait', () => {
    const lignes = lignesDeLArbre(PAYS, { groupesOuverts: new Set(['groupe:pn', 'groupe:cg']) });
    expect(resume(lignes)).toEqual([
      'cg@0',
      'pn-dep@1',
      'pn@2',
      'loa@3',
      'mon@3',
      'groupe:pn#2@3',
      'tie@4',
      'ngo@4',
      'groupe:cg#5@1',
      'bz-dep@2',
      'bz@3',
      'mou@4',
      'ni-dep@2',
      'dol@3',
    ]);
    expect(
      lignes.filter((l) => l.type === 'groupe').map((l) => l.type === 'groupe' && l.ouvert),
    ).toEqual([true, true]);
  });

  it('la zone choisie n’est jamais cachée dans un groupe fermé', () => {
    const lignes = lignesDeLArbre(PAYS, { choisie: 'mou' });
    expect(resume(lignes)).toContain('mou@4');
    expect(resume(lignes)).not.toContain('tie@4');
  });

  it('une recherche remet à plat les zones dont le nom correspond, sans accent ni majuscule', () => {
    expect(resume(lignesDeLArbre(PAYS, { requete: '  TIE ' }))).toEqual(['tie@0']);
    expect(resume(lignesDeLArbre(PAYS, { requete: 'brazza' }))).toEqual(['bz-dep@0', 'bz@0']);
    expect(lignesDeLArbre(PAYS, { requete: 'zzz' })).toEqual([]);
  });

  it('une liste vide ne donne rien, et une zone sans parent connu est une racine', () => {
    expect(lignesDeLArbre([])).toEqual([]);
    const orpheline = zone({
      id: 'o',
      parentId: 'inconnu',
      nom: 'Orpheline',
      genre: 'city',
      niveau: 2,
      chemin: 'o',
      ecoles: 1,
    });
    expect(resume(lignesDeLArbre([orpheline]))).toEqual(['o@0']);
  });
});

describe('les zones par étape', () => {
  const etapes = etapesDeLaCarte(PAYS);

  it('trois étapes, dans l’ordre, sans les départements ni le pays', () => {
    expect(etapes.map((e) => e.etat)).toEqual([null, 'programme', 'actif']);
    const toutes = etapes.flatMap((e) => [...e.zones, ...e.autres]).map((z) => z.id);
    expect(toutes).not.toContain('cg');
    expect(toutes).not.toContain('pn-dep');
    expect(toutes.sort()).toEqual(['bz', 'dol', 'loa', 'mon', 'mou', 'ngo', 'pn', 'tie']);
  });

  it('une zone suivie va dans sa colonne ; « pas encore couverte » sépare celles qui ont des écoles des autres', () => {
    expect(etapes[1]!.zones.map((z) => z.id)).toEqual(['mon']);
    expect(etapes[2]!.zones.map((z) => z.id)).toEqual(['loa']);
    expect(etapes[0]!.zones.map((z) => z.id)).toEqual(['pn']);
    expect(etapes[0]!.autres.map((z) => z.nom)).toEqual([
      'Brazzaville',
      'Dolisie',
      'Moungali',
      'Ngoyo',
      'Tié-Tié',
    ]);
  });

  it('une zone ouverte aux relais reste visible même sans école', () => {
    const avecOuverte = PAYS.map((z) => (z.id === 'tie' ? { ...z, ouverte: true } : z));
    expect(etapesDeLaCarte(avecOuverte)[0]!.zones.map((z) => z.id)).toEqual(['pn', 'tie']);
  });
});

describe('le résumé de la page', () => {
  it('compte les zones, celles qui ont des écoles et celles que la carte suit', () => {
    expect(resumeDesZones(PAYS)).toEqual({ total: 12, avecEcoles: 1, suivies: 2 });
    expect(phraseDuResume(resumeDesZones(PAYS))).toBe(
      '12 zones · 1 avec des écoles · 2 suivies sur la carte',
    );
  });

  it('accorde « zone » et « suivie » au singulier', () => {
    expect(phraseDuResume({ total: 1, avecEcoles: 0, suivies: 1 })).toBe(
      '1 zone · 0 avec des écoles · 1 suivie sur la carte',
    );
  });
});

describe('d’où viennent les fiches', () => {
  it('des parts entières qui font toujours 100', () => {
    expect(origineDesFiches({ relevees: 2, ajoutees: 0, importees: 1 })).toEqual({
      relevees: 67,
      ajoutees: 0,
      importees: 33,
    });
    const tiers = origineDesFiches({ relevees: 1, ajoutees: 1, importees: 1 });
    expect(tiers.relevees + tiers.ajoutees + tiers.importees).toBe(100);
    const sept = origineDesFiches({ relevees: 3, ajoutees: 3, importees: 1 });
    expect(sept.relevees + sept.ajoutees + sept.importees).toBe(100);
  });

  it('aucune fiche : zéro partout, jamais une division par zéro', () => {
    expect(origineDesFiches({ relevees: 0, ajoutees: 0, importees: 0 })).toEqual({
      relevees: 0,
      ajoutees: 0,
      importees: 0,
    });
  });
});

describe('les écoles d’une zone, en une phrase', () => {
  it('dit les écoles et les publiées, au singulier quand il le faut', () => {
    expect(phraseDesEcoles({ ecoles: 10, publiees: 10 })).toBe('10 écoles · 10 publiées');
    expect(phraseDesEcoles({ ecoles: 1, publiees: 0 })).toBe('1 école · 0 publiée');
    expect(phraseDesEcoles({ ecoles: 3, publiees: 1 })).toBe('3 écoles · 1 publiée');
    expect(phraseDesEcoles({ ecoles: 0, publiees: 0 })).toBe('Aucune école');
  });
});
