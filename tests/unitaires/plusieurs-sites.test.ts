// Ticket 203, plusieurs sites : le nom du site et le sigle dans « En bref » (A4), le titre court de la fiche (A13), et la copie
// des formations d'un site à un autre site de la même école (A3, A24).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortAdministration } from '../../src/infra/supabase/administration';
import {
  erreursIdentite,
  identiteDe,
  versCorrectionIdentite,
} from '../../src/modele/correction-ecole';
import { formationsACopier, titreDeFiche } from '../../src/modele/fiche-admin';
import { libellesDesSites } from '../../src/modele/sites-ecole';

function fausseApi(rpc: Record<string, unknown> = {}, tables: Record<string, unknown[]> = {}) {
  const appels: { nom: string; arguments: unknown[] }[] = [];
  const lecture = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const geste of ['select', 'eq', 'gte', 'in', 'order', 'range', 'update'])
      c[geste] = (...args: unknown[]) => {
        appels.push({ nom: `${geste} ${table}`, arguments: args });
        return c;
      };
    c['maybeSingle'] = () =>
      Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
    c['then'] = (suite: (r: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(suite);
    return c;
  };
  const client = {
    rpc: (nom: string, args: unknown) => {
      appels.push({ nom, arguments: [args] });
      return Promise.resolve({ data: rpc[nom] ?? null, error: null });
    },
    from: lecture,
  };
  return { port: creerPortAdministration(() => client as unknown as SupabaseClient), appels };
}

describe('A4 : le nom du site et le sigle', () => {
  it('le formulaire part de ce que la fiche dit', () => {
    // Ticket 205 : « En bref » porte aussi l'année, le site web et la page Facebook.
    expect(identiteDe({ sigle: 'ESTAM', etiquette: 'Site 2 · Mpita' })).toMatchObject({
      sigle: 'ESTAM',
      etiquette: 'Site 2 · Mpita',
    });
    expect(identiteDe({ etiquette: null })).toMatchObject({ sigle: '', etiquette: '' });
  });

  it('ne part que ce qui a changé ; un champ vidé efface la valeur', () => {
    const avant = { sigle: 'ESTAM', etiquette: null };
    expect(versCorrectionIdentite(avant, { sigle: ' ESTAM ', etiquette: '' })).toEqual({});
    expect(versCorrectionIdentite(avant, { sigle: '', etiquette: ' Site 1 · Avenue ' })).toEqual({
      sigle: null,
      etiquette: 'Site 1 · Avenue',
    });
  });

  it('dit le champ trop long, avec sa limite', () => {
    expect(erreursIdentite({ sigle: 'S'.repeat(21), etiquette: 'x'.repeat(121) })).toEqual({
      sigle: 'Le sigle tient en 20 caractères.',
      etiquette: 'Le nom du site tient en 120 caractères.',
    });
    expect(erreursIdentite({ sigle: 'ISGI', etiquette: '' })).toEqual({});
  });
});

describe('A13 : le titre court de la fiche', () => {
  it('le sigle en titre, le nom complet en dessous', () => {
    expect(
      titreDeFiche({ nom: 'ESTAM – École supérieure des technologies avancées', sigle: 'ESTAM' }),
    ).toEqual({ titre: 'ESTAM', nomComplet: 'ESTAM – École supérieure des technologies avancées' });
  });

  it('sans sigle, ou quand le sigle est le nom, le nom seul', () => {
    expect(titreDeFiche({ nom: '[École A]', sigle: null })).toEqual({
      titre: '[École A]',
      nomComplet: null,
    });
    expect(titreDeFiche({ nom: 'ISGI', sigle: 'ISGI' })).toEqual({
      titre: 'ISGI',
      nomComplet: null,
    });
  });
});

describe('A3 : les formations à copier', () => {
  it('montre déjà là une formation du même intitulé et du même cycle, quelle que soit la casse ou les accents', () => {
    const source = [
      { id: 'p1', titre: 'Licence en Gestion', cycle: 'superieur' as const },
      { id: 'p2', titre: 'BTS Transit', cycle: 'superieur' as const },
      { id: 'p3', titre: 'Électricité', cycle: 'technique' as const },
    ];
    const cible = [
      { titre: ' licence en  gestion ', cycle: 'superieur' as const },
      { titre: 'Electricite', cycle: 'superieur' as const },
    ];
    expect(formationsACopier(source, cible).map((f) => [f.id, f.dejaLa])).toEqual([
      ['p1', true],
      ['p2', false],
      ['p3', false],
    ]);
  });
});

describe('plusieurs sites : l’adaptateur de l’administration', () => {
  it('envoie le sigle à l’école et le nom du site au site', async () => {
    const { port, appels } = fausseApi({}, { campuses: [{ institution_id: 'inst-1' }] });
    await port.modifierEcole('c1', { sigle: 'ISGI', etiquette: 'Site 2 · Songolo' });
    expect(appels.find((a) => a.nom === 'update campuses')?.arguments[0]).toEqual({
      label: 'Site 2 · Songolo',
    });
    expect(appels.find((a) => a.nom === 'update institutions')?.arguments[0]).toEqual({
      acronym: 'ISGI',
    });
  });

  it('copie les formations cochées et rend le nombre copié', async () => {
    const { port, appels } = fausseApi({ copy_campus_programs: 2 });
    const copiees = await port.copierFormations('c1', 'c2', ['p1', 'p2']);
    expect(copiees).toBe(2);
    expect(appels[0]).toEqual({
      nom: 'copy_campus_programs',
      arguments: [{ p_from: 'c1', p_to: 'c2', p_programs: ['p1', 'p2'] }],
    });
  });
});

describe('deux sites sans nom se distinguent (ticket 236)', () => {
  const site = (id: string, champs: Record<string, string | null> = {}) => ({
    id,
    etiquette: null,
    quartier: null,
    repere: null,
    division: null,
    ...champs,
  });

  it('le nom, sinon le quartier, sinon le repère, sinon la division, sinon le rang', () => {
    const libelles = libellesDesSites([
      site('a', { etiquette: 'Annexe', quartier: '[Quartier 1]' }),
      site('b', { quartier: '[Quartier 1]', repere: 'En face du marché' }),
      site('c', { quartier: '[Quartier 2]' }),
      site('d'),
    ]);
    expect([...libelles.values()]).toEqual([
      'Annexe',
      'Site · [Quartier 1]',
      'Site · [Quartier 2]',
      'Site 4',
    ]);
  });

  it('un même quartier : le repère, coupé entre deux mots ; rien qui sépare : le rang', () => {
    const libelles = libellesDesSites([
      site('a', {
        quartier: '[Quartier]',
        repere: 'Derrière la grande station-service, au bout de la deuxième avenue',
      }),
      site('b', { quartier: '[Quartier]', repere: 'En face du marché' }),
      site('c', { division: '[Ville]' }),
      site('d', { division: '[Ville]' }),
    ]);
    expect(libelles.get('a')).toBe('Site · Derrière la grande station-service, au…');
    expect(libelles.get('b')).toBe('Site · En face du marché');
    expect(libelles.get('c')).toBe('Site 3 · [Ville]');
    expect(libelles.get('d')).toBe('Site 4 · [Ville]');
  });
});
