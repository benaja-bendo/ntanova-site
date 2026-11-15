// Lot 2 du site public (15/11) : ce que l'adaptateur Supabase de l'administration envoie et lit pour les champs du lot 1
// de la base (mois facturés, OUI de l'école, séries admises, places, effectifs, demandes des familles). Le contrat avec la
// base (`contrat-schema.test.ts`) garde les noms ; ce test garde les valeurs.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortAdministration } from '../../src/infra/supabase/administration';
import type { FraisASaisir } from '../../src/modele/frais-ecole';
import type { FicheFormation } from '../../src/modele/fiche-admin';

/** Une fausse API qui garde chaque appel : les fonctions (rpc) et les gestes d'une lecture de table. */
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

const argumentsDe = (appels: { nom: string; arguments: unknown[] }[], nom: string) =>
  appels.find((a) => a.nom === nom)?.arguments[0] as Record<string, unknown> | undefined;

const frais: FraisASaisir = {
  cycle: 'primaire',
  minimum: 20000,
  maximum: 20000,
  periode: 'mois',
  precisionPeriode: null,
  inscription: 10000,
  anneeScolaire: '2026-2027',
  declaresLe: '2026-11-10',
  note: null,
  classe: 'CP1',
  photoPreuve: null,
  formationId: 'p1',
  moisFactures: 10,
};

describe('l’adaptateur de l’administration et les champs du site public (lot 2)', () => {
  it('envoie les mois facturés à chaque enregistrement d’une ligne au mois (sinon une modification les effacerait)', async () => {
    const { port, appels } = fausseApi({ set_school_fee: 'f1' });
    expect(await port.enregistrerFraisEcole('c1', frais, 'f1')).toBe('f1');
    expect(argumentsDe(appels, 'set_school_fee')).toMatchObject({
      p_campus: 'c1',
      p_fee: 'f1',
      p_billed_months: 10,
      p_program: 'p1',
      p_evidence: 'declaration',
    });
  });

  it('n’envoie aucun mois facturé pour une autre période : la base les refuse', async () => {
    const { port, appels } = fausseApi({ set_school_fee: 'f2' });
    await port.enregistrerFraisEcole('c1', { ...frais, periode: 'annee', moisFactures: 10 }, null);
    expect(argumentsDe(appels, 'set_school_fee')).toMatchObject({ p_billed_months: null });
  });

  it('note le OUI de l’école au jour donné, et rend le nombre de lignes confirmées', async () => {
    const { port, appels } = fausseApi({ confirm_school_fees: 3 });
    expect(await port.confirmerFraisEcole('c1', '2026-11-12')).toBe(3);
    expect(argumentsDe(appels, 'confirm_school_fees')).toEqual({
      p_campus: 'c1',
      p_confirmed_on: '2026-11-12',
    });
  });

  it('annonce et retire des places, dit et retire un effectif, par les fonctions de la base', async () => {
    const { port, appels } = fausseApi({ set_campus_opening: 'o1', set_campus_class_size: 't1' });
    const classe = {
      cycle: 'primaire' as const,
      classe: 'CP1',
      precision: null,
      ditLe: '2026-11-12',
    };
    expect(await port.enregistrerPlaces('c1', { ...classe, etat: 'peu' }, null)).toBe('o1');
    await port.retirerPlaces('c1', 'o1');
    expect(await port.enregistrerEffectif('c1', { ...classe, tranche: '35_a_49' }, 't0')).toBe(
      't1',
    );
    await port.retirerEffectif('c1', 't1');
    expect(argumentsDe(appels, 'set_campus_opening')).toEqual({
      p_campus: 'c1',
      p_opening: null,
      p_cycle: 'primaire',
      p_level_label: 'CP1',
      p_state: 'peu',
      p_detail: null,
      p_said_on: '2026-11-12',
    });
    expect(argumentsDe(appels, 'withdraw_campus_opening')).toEqual({
      p_campus: 'c1',
      p_opening: 'o1',
    });
    expect(argumentsDe(appels, 'set_campus_class_size')).toMatchObject({
      p_size: 't0',
      p_band: '35_a_49',
    });
    expect(argumentsDe(appels, 'withdraw_campus_class_size')).toEqual({
      p_campus: 'c1',
      p_size: 't1',
    });
  });

  it('enregistre les séries admises d’une formation : une liste, nulle quand vide, absente quand le tiroir n’y touche pas', async () => {
    const fiche: FicheFormation = {
      titre: 'BTS Gestion',
      diplome: 'bts',
      domaine: null,
      rythmes: [],
      dureeAnnees: null,
      niveauDemande: null,
      selection: null,
      fraisDossier: null,
      delivrePar: null,
      ditLe: null,
      fraisParAn: null,
      autorisation: null,
    };
    const feuille = async (f: FicheFormation) => {
      const { port, appels } = fausseApi();
      await port.enregistrerFormation('p1', f);
      return argumentsDe(appels, 'save_program_sheet')!['p_sheet'] as Record<string, unknown>;
    };
    expect((await feuille({ ...fiche, seriesAdmises: ['c', 'd'] }))['accepted_bac_tracks']).toEqual(
      ['c', 'd'],
    );
    expect((await feuille({ ...fiche, seriesAdmises: [] }))['accepted_bac_tracks']).toBeNull();
    expect(await feuille(fiche)).not.toHaveProperty('accepted_bac_tracks');
  });

  it('lit les demandes des familles depuis un jour, sans jamais la clé du téléphone', async () => {
    const { port, appels } = fausseApi(
      {},
      {
        family_demands: [
          {
            kind: 'verification',
            demand_day: '2026-11-12',
            campus_id: 'c1',
            profile: null,
            rhythm: null,
            bac_track: null,
            campuses: { label: 'Site 1', institutions: { name: '[École A]' } },
            education_domains: null,
            geo_divisions: null,
          },
          {
            kind: 'orientation',
            demand_day: '2026-11-11',
            campus_id: null,
            profile: 'bac',
            rhythm: 'soir',
            bac_track: 'd',
            campuses: null,
            education_domains: { name: 'Informatique' },
            geo_divisions: { name: 'Pointe-Noire' },
          },
        ],
      },
    );
    expect(await port.demandesDesFamilles('2026-10-16')).toEqual([
      {
        genre: 'verification',
        jour: '2026-11-12',
        ecole: { id: 'c1', nom: '[École A] · Site 1' },
        profil: null,
        domaine: null,
        lieu: null,
        rythme: null,
        serie: null,
      },
      {
        genre: 'orientation',
        jour: '2026-11-11',
        ecole: null,
        profil: 'bac',
        domaine: 'Informatique',
        lieu: 'Pointe-Noire',
        rythme: 'soir',
        serie: 'd',
      },
    ]);
    const colonnes = appels.find((a) => a.nom === 'select family_demands')!.arguments[0] as string;
    expect(colonnes).not.toContain('device_day_key');
    expect(appels).toContainEqual({
      nom: 'gte family_demands',
      arguments: ['demand_day', '2026-10-16'],
    });
  });

  it('lit avec chaque école ses mois facturés, son OUI, ses places (et leur fin) et ses effectifs', async () => {
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
            campus_cycles: [{ cycle: 'primaire', campus_programs: [] }],
            campus_facts: [],
            campus_fees: [
              {
                id: 'f1',
                campus_id: 'c1',
                cycle: 'primaire',
                minimum: 20000,
                maximum: 20000,
                period: 'mois',
                period_detail: null,
                registration: null,
                school_year: null,
                declared_on: '2026-11-10',
                note: null,
                billed_months: 9,
                confirmed_on: null,
              },
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
    expect(e!.frais![0]).toMatchObject({ moisFactures: 9, confirmeLe: null });
    expect(e!.places).toEqual([
      {
        id: 'o1',
        cycle: 'primaire',
        classe: 'CP1',
        etat: 'disponibles',
        precision: null,
        ditLe: '2026-11-10',
        finLe: '2026-12-10',
      },
    ]);
    expect(e!.effectifs).toEqual([
      {
        id: 't1',
        cycle: 'primaire',
        classe: null,
        tranche: '20_a_34',
        precision: null,
        ditLe: '2026-11-10',
      },
    ]);
  });
});
