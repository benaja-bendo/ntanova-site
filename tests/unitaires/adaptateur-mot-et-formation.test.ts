// 18/11 : deux bogues vus en production en remplissant une université.
// 1. Le mot de la direction s'enregistre au niveau de l'école (`institution_statements`, choix C1 du 13/11), mais
//    l'administration le relisait sur le site (`campus_statements`, vidée à chaque enregistrement) : « pas encore remis ».
// 2. Une formation ne s'ajoutait que depuis un relevé : la fiche d'une école créée sans formation n'en recevait jamais.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortAdministration } from '../../src/infra/supabase/administration';

function fausseApi(rpc: Record<string, unknown> = {}, tables: Record<string, unknown[]> = {}) {
  const appels: { nom: string; arguments: unknown[] }[] = [];
  const lecture = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const geste of ['select', 'eq', 'gte', 'in', 'order', 'range'])
      c[geste] = (...args: unknown[]) => {
        appels.push({ nom: `${geste} ${table}`, arguments: args });
        return c;
      };
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

const ligneCampus = (institution: Record<string, unknown>, campusStatements: unknown = null) => ({
  id: 'c1',
  public_number: null,
  institution_id: 'i1',
  label: null,
  neighbourhood: null,
  landmark: null,
  sign_phone: null,
  public_phone: null,
  public_phone_agreed_on: null,
  position: null,
  division_id: null,
  verified_on: null,
  publication: 'prete',
  origin: 'admin',
  school_declared_on: null,
  curriculum_note: null,
  retired_at: null,
  trashed_at: null,
  retirement_reason: null,
  retirement_note: null,
  replaced_by_campus_id: null,
  same_place_as_campus_id: null,
  institutions: { name: '[Université]', kind: 'privee', ...institution },
  geo_divisions: null,
  missions: [],
  campus_cycles: [],
  campus_fees: [],
  campus_facts: [],
  campus_accreditations: [],
  campus_statements: campusStatements,
  campus_enrollment_deadlines: [],
  campus_openings: [],
  campus_class_sizes: [],
});

describe('le mot de la direction, relu là où la base l’écrit', () => {
  it('demande le mot de l’école avec la ligne du site', async () => {
    const { port, appels } = fausseApi({}, { campuses: [] });
    await port.ecoles();
    const colonnes = String(appels.find((a) => a.nom === 'select campuses')?.arguments[0]);
    expect(colonnes).toMatch(/institutions\([^)]*institution_statements\(body, stated_on\)/);
  });

  it('lit le mot de l’école (C1 du 13/11)', async () => {
    const { port } = fausseApi(
      {},
      {
        campuses: [
          ligneCampus({ institution_statements: { body: '[Le mot.]', stated_on: '2026-11-18' } }),
        ],
      },
    );
    const [ecole] = await port.ecoles();
    expect(ecole?.motDirection).toEqual({ texte: '[Le mot.]', ditLe: '2026-11-18' });
  });

  it('garde un ancien mot posé sur le site quand l’école n’en a pas', async () => {
    const { port } = fausseApi(
      {},
      {
        campuses: [
          ligneCampus(
            { institution_statements: null },
            { body: '[Ancien]', stated_on: '2026-11-01' },
          ),
        ],
      },
    );
    const [ecole] = await port.ecoles();
    expect(ecole?.motDirection).toEqual({ texte: '[Ancien]', ditLe: '2026-11-01' });
  });
});

describe('ajouter une formation depuis la fiche', () => {
  it('appelle add_campus_program avec le site, le cycle et l’intitulé nettoyé, et rend l’identifiant', async () => {
    const { port, appels } = fausseApi({ add_campus_program: 'p9' });
    expect(await port.ajouterFormation('c1', 'superieur', '  Licence en droit ')).toBe('p9');
    expect(appels.find((a) => a.nom === 'add_campus_program')?.arguments[0]).toEqual({
      p_campus: 'c1',
      p_cycle: 'superieur',
      p_title: 'Licence en droit',
    });
  });
});
