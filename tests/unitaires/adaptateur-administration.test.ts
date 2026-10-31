import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ErreurDecision } from '../../src/modele/ports';
import { creerPortAdministration } from '../../src/infra/supabase/administration';

type Reponse = { data: unknown; error: { code?: string; message?: string } | null };

/** Une fausse API : chaque appel de fonction (rpc) répond ce que le test a prévu, et garde ses arguments. */
function fausseApi(rpc: Record<string, Reponse>, tables: Record<string, unknown[]> = {}) {
  const appels: { nom: string; arguments: unknown }[] = [];
  const requete = (lignes: unknown[]) => {
    const constructeur = {
      select: () => constructeur,
      eq: () => constructeur,
      order: () => constructeur,
      limit: () => constructeur,
      returns: () => constructeur,
      then: (suite: (r: unknown) => unknown) =>
        Promise.resolve({ data: lignes, error: null }).then(suite),
    };
    return constructeur;
  };
  const client = {
    rpc: (nom: string, args: unknown) => {
      appels.push({ nom, arguments: args });
      return Promise.resolve(rpc[nom] ?? { data: null, error: null });
    },
    from: (table: string) => requete(tables[table] ?? []),
    storage: {
      from: (seau: string) => ({
        remove: (chemins: string[]) => {
          appels.push({ nom: `stockage ${seau}`, arguments: chemins });
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };
  return { port: creerPortAdministration(() => client as unknown as SupabaseClient), appels };
}

describe('l’adaptateur Supabase de l’administration', () => {
  it('accepte un relevé comme nouvelle école, ou met à jour l’école donnée', async () => {
    const { port, appels } = fausseApi({ accepter_releve: { data: 'ecole-1', error: null } });
    await expect(port.accepter('r1')).resolves.toBe('ecole-1');
    await port.accepter('r2', 'ecole-9');
    expect(appels).toEqual([
      { nom: 'accepter_releve', arguments: { releve: 'r1', ecole: null } },
      { nom: 'accepter_releve', arguments: { releve: 'r2', ecole: 'ecole-9' } },
    ]);
  });

  it('rend le message de la base quand elle refuse une décision', async () => {
    const { port } = fausseApi({
      accepter_releve: {
        data: null,
        error: { code: '22023', message: 'Relevé du lot d’essai : il ne se publie jamais.' },
      },
    });
    const refus = port.accepter('r1');
    await expect(refus).rejects.toBeInstanceOf(ErreurDecision);
    await expect(refus).rejects.toThrow('Relevé du lot d’essai : il ne se publie jamais.');
  });

  it('lit le contact de la direction dans les termes du modèle', async () => {
    const { port } = fausseApi({
      contact_du_releve: {
        data: [
          {
            fonction: 'promoteur',
            nom: '[Nom]',
            whatsapp: '242061234567',
            accord_contact: true,
            accord_le: '2026-11-02T08:00:00Z',
            ce_qui_a_ete_dit: null,
            recu_le: '2026-11-02T09:00:00Z',
          },
        ],
        error: null,
      },
    });
    await expect(port.contactReleve('r1')).resolves.toMatchObject({
      fonction: 'promoteur',
      whatsapp: '242061234567',
      accord: true,
    });
  });

  it('dit « aucun contact » quand la base n’en a pas', async () => {
    const { port } = fausseApi({ contact_du_releve: { data: [], error: null } });
    await expect(port.contactReleve('r1')).resolves.toBeNull();
  });

  it('compte les fiches de chaque relais', async () => {
    const { port } = fausseApi(
      {},
      {
        relais: [
          { id: 'a', prenom: '[A]', statut: 'actif', lot_id: 'l', cree_le: '', active_le: null },
          {
            id: 'b',
            prenom: '[B]',
            statut: 'en_attente',
            lot_id: null,
            cree_le: '',
            active_le: null,
          },
        ],
        releves: [{ relais_id: 'a' }, { relais_id: 'a' }],
      },
    );
    const relais = await port.relais();
    expect(relais.map((r) => [r.prenom, r.fiches])).toEqual([
      ['[A]', 2],
      ['[B]', 0],
    ]);
  });

  it('publie un arrondissement et un lot, et rend le nombre d’écoles publiées', async () => {
    const { port, appels } = fausseApi({
      publier_arrondissement: { data: 3, error: null },
      publier_lot: { data: 2, error: null },
    });
    await expect(port.publierArrondissement(1)).resolves.toBe(3);
    await expect(port.publierLot('lot-1')).resolves.toBe(2);
    expect(appels).toEqual([
      { nom: 'publier_arrondissement', arguments: { arrondissement: 1 } },
      { nom: 'publier_lot', arguments: { lot: 'lot-1' } },
    ]);
  });

  it('retire une école avec son motif', async () => {
    const { port, appels } = fausseApi({});
    await port.retirerEcole('e1', 'demande_ecole', 'La direction l’a demandé');
    expect(appels).toEqual([
      {
        nom: 'retirer_ecole',
        arguments: { ecole: 'e1', motif: 'demande_ecole', note: 'La direction l’a demandé' },
      },
    ]);
  });

  it('efface la photo dans le stockage, puis note l’effacement dans la base', async () => {
    const { port, appels } = fausseApi({});
    await port.effacerPhoto('r1', null);
    expect(appels).toEqual([
      { nom: 'stockage releves', arguments: ['r1/enseigne.jpg'] },
      { nom: 'noter_effacement_photo', arguments: { releve: 'r1', note: null } },
    ]);
  });

  it('rend le refus de la base : un relevé refusé ne s’accepte plus', async () => {
    const { port } = fausseApi({
      accepter_releve: {
        data: null,
        error: { code: '22023', message: 'Relevé refusé : un refus est définitif.' },
      },
    });
    await expect(port.accepter('r1')).rejects.toThrow('un refus est définitif');
  });
});
