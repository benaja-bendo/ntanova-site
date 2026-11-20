// Ticket 199, sûreté des frais : ce que l'adaptateur de l'administration lit et envoie. Les lignes de frais gardent l'ordre de
// leur saisie (A14) ; une ligne « à partir de » n'a pas de maximum (A23) ; le frais de dossier d'une formation et son OUI sont
// lus avec l'école, pour « Noter le OUI de l'école » (A1).
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

const ligne = (
  id: string,
  classe: string,
  minimum: number,
  maximum: number | null,
  creee: string,
) => ({
  id,
  campus_id: 'c1',
  cycle: 'superieur',
  minimum,
  maximum,
  period: 'mois',
  period_detail: null,
  registration: null,
  school_year: null,
  declared_on: '2026-11-18',
  note: null,
  level_label: classe,
  billed_months: null,
  confirmed_on: null,
  created_at: creee,
});

describe('sûreté des frais : l’adaptateur de l’administration', () => {
  it('lit les lignes dans l’ordre de leur saisie, « à partir de » sans maximum, et les frais de dossier', async () => {
    const { port } = fausseApi(
      {},
      {
        campuses: [
          {
            id: 'c1',
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
            publication: 'publiee',
            origin: 'field',
            school_declared_on: null,
            curriculum_note: null,
            retired_at: null,
            trashed_at: null,
            retirement_reason: null,
            retirement_note: null,
            replaced_by_campus_id: null,
            institutions: { name: '[École A]', kind: 'privee' },
            geo_divisions: null,
            missions: [],
            campus_cycles: [
              {
                cycle: 'superieur',
                campus_programs: [
                  {
                    id: 'p1',
                    title: 'Licence Exemple',
                    application_fee_xaf: 20000,
                    application_fee_confirmed_on: null,
                    details_declared_on: '2026-11-18',
                  },
                  {
                    id: 'p2',
                    title: 'Master Exemple',
                    application_fee_xaf: null,
                    application_fee_confirmed_on: null,
                    details_declared_on: null,
                  },
                ],
              },
            ],
            campus_facts: [],
            campus_fees: [
              ligne('f3', 'Licence 3', 60000, 60000, '2026-11-20T10:00:03Z'),
              ligne('f1', 'Licence 1', 40000, null, '2026-11-20T10:00:01Z'),
              ligne('f2', 'Licence 2', 50000, 50000, '2026-11-20T10:00:02Z'),
            ],
            campus_openings: [
              {
                id: 'o1',
                cycle: 'primaire',
                level_label: 'CP1',
                state: 'disponibles',
                detail: null,
                said_on: '2026-11-10',
                expires_on: '2026-12-10',
              },
            ],
            campus_class_sizes: [
              {
                id: 't1',
                cycle: 'primaire',
                level_label: null,
                band: '20_a_34',
                detail: null,
                said_on: '2026-11-10',
              },
            ],
          },
        ],
      },
    );
    const [e] = await port.ecoles();
    expect(e!.frais!.map((f) => f.classe)).toEqual(['Licence 1', 'Licence 2', 'Licence 3']);
    expect(e!.frais![0]!.maximum).toBeNull();
    expect(e!.fraisDeDossier).toEqual([
      {
        formationId: 'p1',
        titre: 'Licence Exemple',
        montant: 20000,
        ditLe: '2026-11-18',
        confirmeLe: null,
      },
    ]);
  });

  it('envoie un maximum vide pour une ligne « à partir de »', async () => {
    const { port, appels } = fausseApi({ set_school_fee: 'f9' });
    await port.enregistrerFraisEcole(
      'c1',
      {
        cycle: 'superieur',
        minimum: 40000,
        maximum: null,
        periode: 'mois',
        precisionPeriode: null,
        inscription: 70000,
        anneeScolaire: null,
        declaresLe: '2026-11-18',
        note: null,
      },
      null,
    );
    const args = appels.find((a) => a.nom === 'set_school_fee')!.arguments[0] as Record<
      string,
      unknown
    >;
    expect(args['p_minimum']).toBe(40000);
    expect(args['p_maximum']).toBeNull();
  });
});
