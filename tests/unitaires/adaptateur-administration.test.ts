import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ErreurDecision } from '../../src/modele/ports';
import { creerPortAdministration } from '../../src/infra/supabase/administration';

type Reponse = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Une fausse API : chaque appel de fonction (rpc) répond ce que le test a prévu, et garde ses
 * arguments ; une table peut répondre par une erreur.
 */
function fausseApi(
  rpc: Record<string, Reponse>,
  tables: Record<string, unknown[]> = {},
  erreurs: Record<string, { code?: string; message?: string }> = {},
) {
  const appels: { nom: string; arguments: unknown }[] = [];
  const requete = (lignes: unknown[], table: string) => {
    const erreur = erreurs[table] ?? null;
    const constructeur = {
      select: () => constructeur,
      eq: () => constructeur,
      order: () => constructeur,
      limit: () => constructeur,
      returns: () => constructeur,
      update: (champs: unknown) => {
        appels.push({ nom: `modifier ${table}`, arguments: champs });
        return constructeur;
      },
      single: () => Promise.resolve({ data: lignes[0] ?? null, error: erreur }),
      maybeSingle: () => Promise.resolve({ data: lignes[0] ?? null, error: erreur }),
      then: (suite: (r: unknown) => unknown) =>
        Promise.resolve({ data: erreur ? null : lignes, error: erreur }).then(suite),
    };
    return constructeur;
  };
  const client = {
    rpc: (nom: string, args: unknown) => {
      appels.push({ nom, arguments: args });
      return Promise.resolve(rpc[nom] ?? { data: null, error: null });
    },
    from: (table: string) => requete(tables[table] ?? [], table),
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

  describe('le détail d’un relevé (ticket 12)', () => {
    const relevé = (champs: Record<string, unknown>) => ({
      id: 'r1',
      recu_le: '2026-11-02T09:00:00Z',
      pris_le: '2026-11-02T08:00:00Z',
      type: 'releve',
      nom_enseigne: '[École]',
      position: null,
      precision_m: null,
      niveaux: ['primaire'],
      type_ecole: 'privee',
      repere: null,
      numero_enseigne: null,
      direction: null,
      repasser: null,
      reponse_doublon: null,
      corrige_releve_id: null,
      hors_lot: null,
      doublon_possible: false,
      contact_confirme_le: null,
      contact_fonction: null,
      relais: { prenom: '[A]' },
      lots: { nom: 'Tié-Tié', essai: false },
      doublon: null,
      ...champs,
    });

    it('lit le programme, ou rien tant que la colonne n’existe pas dans la base', async () => {
      const avec = fausseApi(
        {},
        { releves: [relevé({ programme: 'Programme français-congolais' })] },
      );
      await expect(avec.port.detailReleve('r1')).resolves.toMatchObject({
        programme: 'Programme français-congolais',
      });
      const sans = fausseApi({}, { releves: [relevé({})] });
      await expect(sans.port.detailReleve('r1')).resolves.toMatchObject({ programme: null });
    });

    it('ne casse pas devant un type ou un niveau que cette version ne connaît pas encore', async () => {
      const { port } = fausseApi(
        {},
        {
          releves: [
            relevé({ type_ecole: 'type_de_demain', niveaux: ['creche', 'niveau_de_demain'] }),
          ],
        },
      );
      await expect(port.detailReleve('r1')).resolves.toMatchObject({
        typeEcole: 'non_indique',
        niveaux: ['creche'],
      });
    });
  });

  describe('corriger une fiche à la main (ticket 12)', () => {
    it('n’écrit que les champs donnés, avec les noms de la base', async () => {
      const { port, appels } = fausseApi({}, { ecoles: [{ id: 'e1' }] });
      await port.modifierEcole('e1', {
        typeEcole: 'publique',
        niveaux: ['creche'],
        programme: 'Bilingue',
        numeroEnseigne: null,
      });
      expect(appels).toEqual([
        {
          nom: 'modifier ecoles',
          arguments: {
            type_ecole: 'publique',
            niveaux: ['creche'],
            programme: 'Bilingue',
            numero_enseigne: null,
          },
        },
      ]);
    });

    it('ne fait aucun appel quand rien ne change', async () => {
      const { port, appels } = fausseApi({}, { ecoles: [{ id: 'e1' }] });
      await port.modifierEcole('e1', {});
      expect(appels).toEqual([]);
    });

    it('dit « introuvable » quand la base ne change aucune ligne (école inconnue, ou droit refusé)', async () => {
      const { port } = fausseApi({}, { ecoles: [] });
      await expect(port.modifierEcole('e9', { nom: '[École]' })).rejects.toBeInstanceOf(
        ErreurDecision,
      );
    });

    it('dit en français qu’une valeur est refusée par la base', async () => {
      const { port } = fausseApi(
        {},
        {},
        {
          ecoles: {
            code: '23514',
            message: 'new row for relation "ecoles" violates check constraint "ecoles_nom_check"',
          },
        },
      );
      const refus = port.modifierEcole('e1', { nom: '[École]' });
      await expect(refus).rejects.toBeInstanceOf(ErreurDecision);
      await expect(refus).rejects.not.toThrow(/violates|relation/);
    });

    it('lit le type, les niveaux, le programme, le repère et le numéro de chaque école', async () => {
      const ligne = (champs: Record<string, unknown>) => ({
        id: 'e1',
        nom: '[École]',
        quartier: null,
        publication: 'prete',
        position: {},
        arrondissement_id: 1,
        retiree_le: null,
        motif_retrait: null,
        note_retrait: null,
        remplacee_par: null,
        arrondissements: { nom: 'Tié-Tié' },
        ecoles_confiees: null,
        type_ecole: 'communautaire',
        niveaux: ['creche', 'autre_formation'],
        programme: 'Bilingue',
        repere: '[Repère]',
        numero_enseigne: '242060000001',
        ...champs,
      });
      const { port } = fausseApi(
        {},
        { ecoles: [ligne({}), ligne({ id: 'e2', type_ecole: 'type_de_demain', niveaux: ['x'] })] },
      );
      const [une, autre] = await port.ecoles();
      expect(une).toMatchObject({
        typeEcole: 'communautaire',
        niveaux: ['creche', 'autre_formation'],
        programme: 'Bilingue',
        repere: '[Repère]',
        numeroEnseigne: '242060000001',
      });
      // Une valeur que cette version ne connaît pas encore ne casse rien.
      expect(autre).toMatchObject({ typeEcole: 'non_indique', niveaux: [] });
    });
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

  describe('situer et ajouter une école (ticket 15)', () => {
    it('situe une école par la fonction de la base, et rend son arrondissement', async () => {
      const { port, appels } = fausseApi({ situer_ecole: { data: 'Tié-Tié', error: null } });
      await expect(
        port.situerEcole('ecole-1', { latitude: -4.79105, longitude: 11.925 }),
      ).resolves.toBe('Tié-Tié');
      expect(appels).toEqual([
        {
          nom: 'situer_ecole',
          arguments: { ecole: 'ecole-1', latitude: -4.79105, longitude: 11.925 },
        },
      ]);
    });

    it('rend le message de la base quand la position est hors des arrondissements ouverts', async () => {
      const { port } = fausseApi({
        situer_ecole: {
          data: null,
          error: {
            code: '22023',
            message: 'Cette position n’est dans aucun arrondissement ouvert.',
          },
        },
      });
      await expect(
        port.situerEcole('ecole-1', { latitude: 48.85, longitude: 2.35 }),
      ).rejects.toThrow(
        new ErreurDecision('Cette position n’est dans aucun arrondissement ouvert.'),
      );
    });

    it('ajoute une école avec les noms de la base, sans position si elle est à situer', async () => {
      const { port, appels } = fausseApi({ ajouter_ecole: { data: 'nouvelle', error: null } });
      await expect(
        port.ajouterEcole({
          nom: '[École Exemple]',
          position: null,
          typeEcole: 'privee',
          niveaux: ['primaire'],
          programme: null,
          repere: '[face au marché]',
          numeroEnseigne: null,
          quartier: '[Quartier]',
        }),
      ).resolves.toBe('nouvelle');
      expect(appels).toEqual([
        {
          nom: 'ajouter_ecole',
          arguments: {
            nom: '[École Exemple]',
            latitude: null,
            longitude: null,
            type_ecole: 'privee',
            niveaux: ['primaire'],
            programme: null,
            repere: '[face au marché]',
            numero_enseigne: null,
            quartier: '[Quartier]',
          },
        },
      ]);
    });

    it('lit la position GeoJSON d’une école, et « pas de position » pour une forme inattendue', async () => {
      const ligne = (position: unknown) => ({
        id: 'e1',
        nom: '[École]',
        quartier: null,
        publication: 'prete',
        position,
        arrondissement_id: 1,
        retiree_le: null,
        motif_retrait: null,
        note_retrait: null,
        remplacee_par: null,
        type_ecole: 'privee',
        niveaux: [],
        programme: null,
        repere: null,
        numero_enseigne: null,
        arrondissements: { nom: 'Tié-Tié' },
        ecoles_confiees: null,
      });
      const { port } = fausseApi(
        {},
        {
          ecoles: [
            ligne({ type: 'Point', coordinates: [11.925, -4.79105] }),
            ligne('0101000020E6100000'),
          ],
        },
      );
      const [geojson, autre] = await port.ecoles();
      expect(geojson?.position).toEqual({ latitude: -4.79105, longitude: 11.925 });
      expect(autre?.position).toBeNull();
      expect(autre?.aSituer).toBe(false);
    });
  });
});
