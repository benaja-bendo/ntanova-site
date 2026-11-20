// Ticket 201 : ce que l'adaptateur de l'administration lit et envoie pour les doublons (une école connue sans position, sa
// mission ouverte) et la source d'une position (relais, école, carte en ligne).
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

describe('doublons et positions : l’adaptateur de l’administration', () => {
  it('lit d’une école semblable si elle est située et si une mission est ouverte', async () => {
    const { port } = fausseApi({
      similar_schools: [
        {
          kind: 'campus',
          id: 'c1',
          institution_id: 'i1',
          name: '[Institut Kalala]',
          acronym: null,
          state: 'brouillon',
          distance_m: null,
          similarity: 0.9,
          verdict: 'deja_la',
          located: false,
          open_mission: true,
        },
      ],
    });
    const [s] = await port.ecolesSimilaires('Institut Kalala', null, 'r1');
    expect(s).toMatchObject({ verdict: 'deja_la', situe: false, missionOuverte: true });
  });

  it('envoie d’où vient la position avec « Situer » ; rien quand ce n’est pas dit', async () => {
    const { port, appels } = fausseApi({ locate_campus: 'Mpita' });
    await port.situerEcole('c1', { latitude: -4.8, longitude: 11.85 }, null, 'carte_en_ligne');
    await port.situerEcole('c1', { latitude: -4.8, longitude: 11.85 });
    const envois = appels
      .filter((a) => a.nom === 'locate_campus')
      .map((a) => a.arguments[0] as Record<string, unknown>);
    expect(envois[0]!['p_source']).toBe('carte_en_ligne');
    expect(envois[1]!['p_source']).toBeNull();
  });
});
