import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ErreurDecision } from '../../src/modele/ports';
import { creerPortAdministration } from '../../src/infra/supabase/administration';

type Reponse = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Une fausse API : chaque appel de fonction (rpc) répond ce que le test a prévu, et garde ses arguments ; chaque
 * table répond ses lignes, et garde la suite des appels qu'on lui a faits (select, update…).
 */
function fausseApi(
  rpc: Record<string, Reponse> = {},
  tables: Record<string, unknown[]> = {},
  erreurs: Record<string, { code?: string; message?: string }> = {},
) {
  const appels: { nom: string; arguments: unknown }[] = [];
  const requete = (lignes: unknown[], table: string) => {
    const erreur = erreurs[table] ?? null;
    const constructeur: Record<string, unknown> = {};
    for (const methode of ['select', 'eq', 'neq', 'is', 'order', 'range', 'limit', 'not', 'in']) {
      constructeur[methode] = (...args: unknown[]) => {
        if (methode === 'eq' || methode === 'not' || methode === 'is') {
          appels.push({ nom: `${methode} ${table}`, arguments: args });
        }
        return constructeur;
      };
    }
    for (const methode of ['update', 'insert', 'upsert', 'delete']) {
      constructeur[methode] = (champs?: unknown) => {
        appels.push({ nom: `${methode} ${table}`, arguments: champs });
        return constructeur;
      };
    }
    constructeur['single'] = () => Promise.resolve({ data: lignes[0] ?? null, error: erreur });
    constructeur['maybeSingle'] = () => Promise.resolve({ data: lignes[0] ?? null, error: erreur });
    constructeur['then'] = (suite: (r: unknown) => unknown) =>
      Promise.resolve({ data: erreur ? null : lignes, error: erreur, count: lignes.length }).then(
        suite,
      );
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
        createSignedUrls: (chemins: string[]) =>
          Promise.resolve({
            data: chemins.map((path) => ({
              path,
              signedUrl: `https://signe.exemple/${path}`,
              error: null,
            })),
            error: null,
          }),
      }),
    },
  };
  return { port: creerPortAdministration(() => client as unknown as SupabaseClient), appels };
}

describe('l’adaptateur Supabase de l’administration', () => {
  describe('la décision sur un relevé', () => {
    it('accepte comme nouvelle école, par défaut', async () => {
      const { port, appels } = fausseApi({ accept_submission: { data: 'campus-1', error: null } });
      await expect(port.accepter('r1')).resolves.toBe('campus-1');
      expect(appels).toEqual([
        {
          nom: 'accept_submission',
          arguments: {
            p_submission: 'r1',
            p_mode: null,
            p_campus: null,
            p_institution: null,
            p_label: null,
            p_programs: [],
          },
        },
      ]);
    });

    it('dit en anglais à la base ce que les ports disent en français, formations comprises', async () => {
      const { port, appels } = fausseApi({ accept_submission: { data: 'campus-2', error: null } });
      await port.accepter('r2', {
        mode: 'new_campus',
        institutionId: 'inst-1',
        etiquette: 'Campus de Loandjili',
        formations: [
          {
            cycle: 'lycee',
            titre: 'Série C',
            domaine: 'sciences-technologies',
            serie: 'c',
            diplome: 'bac',
            rythmes: ['jour', 'soir'],
          },
        ],
      });
      await port.accepter('r3', { mode: 'update_campus', campusId: 'campus-9' });
      await port.accepter('r4', { mode: 'add_cycle', campusId: 'campus-9' });
      expect(appels[0]?.arguments).toEqual({
        p_submission: 'r2',
        p_mode: 'new_campus',
        p_campus: null,
        p_institution: 'inst-1',
        p_label: 'Campus de Loandjili',
        p_programs: [
          {
            cycle: 'lycee',
            title: 'Série C',
            domain: 'sciences-technologies',
            bac_track: 'c',
            diploma: 'bac',
            rhythms: ['jour', 'soir'],
          },
        ],
      });
      expect(appels[1]?.arguments).toMatchObject({ p_mode: 'update_campus', p_campus: 'campus-9' });
      expect(appels[2]?.arguments).toMatchObject({ p_mode: 'add_cycle', p_campus: 'campus-9' });
    });

    it('rend le message de la base quand elle refuse une décision', async () => {
      const { port } = fausseApi({
        accept_submission: {
          data: null,
          error: { code: '22023', message: 'Relevé du lot d’essai : il ne se publie jamais.' },
        },
      });
      const refus = port.accepter('r1');
      await expect(refus).rejects.toBeInstanceOf(ErreurDecision);
      await expect(refus).rejects.toThrow('Relevé du lot d’essai : il ne se publie jamais.');
    });

    it('lit « existe déjà » comme une décision refusée, pas comme une panne', async () => {
      const { port } = fausseApi({
        create_lot: { data: null, error: { code: '23505', message: 'duplicate key value' } },
      });
      await expect(port.creerLot('[Lot]', 'd1', null, false)).rejects.toThrow(
        'Cet enregistrement existe déjà.',
      );
    });

    it('demande une correction, refuse, confirme la fonction, valide l’essai', async () => {
      const { port, appels } = fausseApi();
      await port.demanderCorrection('r1', 'photo_floue', 'Reprenez la photo.');
      await port.refuser('r2', 'autre', null);
      await port.confirmerContact('r3', 'directeur');
      await port.validerEssai('r4');
      expect(appels.map((a) => a.nom)).toEqual([
        'request_correction',
        'refuse_submission',
        'confirm_contact',
        'validate_trial_submission',
      ]);
      expect(appels[0]?.arguments).toEqual({
        p_submission: 'r1',
        p_reason: 'photo_floue',
        p_message: 'Reprenez la photo.',
      });
      expect(appels[2]?.arguments).toEqual({ p_submission: 'r3', p_role: 'directeur' });
    });
  });

  describe('le contact et les photos', () => {
    it('lit le contact de la direction dans les termes du modèle', async () => {
      const { port } = fausseApi({
        contact_of_submission: {
          data: [
            {
              role: 'promoteur',
              name: '[Nom]',
              whatsapp: '242061234567',
              contact_agreement: true,
              agreement_at: '2026-11-02T08:00:00Z',
              said_note: null,
              received_at: '2026-11-02T09:00:00Z',
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
      const { port } = fausseApi({ contact_of_submission: { data: [], error: null } });
      await expect(port.contactReleve('r1')).resolves.toBeNull();
    });

    it('rend les photos d’un relevé avec une adresse temporaire, sans jamais exposer le chemin', async () => {
      const { port } = fausseApi(
        {},
        {
          field_submission_photos: [
            {
              id: 'p1',
              role: 'signboard',
              storage_path: 'r1/p1.webp',
              bytes: 90_000,
              width: 1280,
              height: 960,
              taken_at: null,
              child_free_checked_at: null,
            },
            {
              id: 'p2',
              role: 'programs_board',
              storage_path: 'r1/p2.webp',
              bytes: 80_000,
              width: null,
              height: null,
              taken_at: null,
              child_free_checked_at: '2026-11-02T10:00:00Z',
            },
          ],
        },
      );
      const photos = await port.photosReleve('r1');
      expect(photos.map((p) => [p.id, p.role, p.publiable])).toEqual([
        ['p1', 'signboard', false],
        ['p2', 'programs_board', true],
      ]);
      expect(photos[0]?.adresse).toBe('https://signe.exemple/r1/p1.webp');
      expect(JSON.stringify(photos)).not.toContain('storage_path');
    });

    it('efface le fichier avant la ligne : un effacement qui échoue se rejoue, il ne laisse pas de fichier sans trace', async () => {
      const { port, appels } = fausseApi(
        { erase_photo: { data: 'r1/p1.webp', error: null } },
        { field_submission_photos: [{ storage_path: 'r1/p1.webp' }] },
      );
      await port.effacerPhoto('p1', 'demande de l’école');
      const ordre = appels
        .map((a) => a.nom)
        .filter((n) => n === 'stockage releves' || n === 'erase_photo');
      expect(ordre).toEqual(['stockage releves', 'erase_photo']);
      expect(appels.find((a) => a.nom === 'stockage releves')?.arguments).toEqual(['r1/p1.webp']);
    });

    it('marque une photo publiable sans jamais la mettre en ligne', async () => {
      const { port, appels } = fausseApi({}, { field_submission_photos: [{ id: 'p1' }] });
      await port.marquerPhotoPubliable('p1', true);
      const maj = appels.find((a) => a.nom === 'update field_submission_photos')
        ?.arguments as Record<string, unknown>;
      expect(maj['is_public']).toBe(false);
      expect(typeof maj['child_free_checked_at']).toBe('string');
      await port.marquerPhotoPubliable('p1', false);
      const retrait = appels.filter((a) => a.nom === 'update field_submission_photos')[1]
        ?.arguments as Record<string, unknown>;
      expect(retrait['child_free_checked_at']).toBeNull();
    });
  });

  describe('les relais, les lots et les zones', () => {
    it('lit les compteurs de chaque relais dans la vue de la base', async () => {
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
          relay_counters: [
            {
              relay_id: 'a',
              sent: 5,
              to_review: 1,
              to_correct: 1,
              accepted: 2,
              refused: 1,
              contacts_confirmed: 2,
            },
          ],
        },
      );
      const relais = await port.relais();
      expect(relais.map((r) => [r.prenom, r.fiches])).toEqual([
        ['[A]', 5],
        ['[B]', 0],
      ]);
      expect(relais[0]?.compteurs).toEqual({
        envoyees: 5,
        aValider: 1,
        aCorriger: 1,
        acceptees: 2,
        refusees: 1,
        contactsConfirmes: 2,
      });
    });

    it('crée un lot sur une zone, ouvre une zone, publie une zone et un lot', async () => {
      const { port, appels } = fausseApi({
        create_lot: { data: 'lot-1', error: null },
        publish_division: { data: 3, error: null },
        publish_batch: { data: 2, error: null },
      });
      await expect(port.creerLot('[Lot]', 'd-1', '2026-12-01', false)).resolves.toBe('lot-1');
      await port.ouvrirZone('d-1', true);
      await expect(port.publierDivision('d-1')).resolves.toBe(3);
      await expect(port.publierLot('lot-1')).resolves.toBe(2);
      expect(appels).toEqual([
        {
          nom: 'create_lot',
          arguments: { p_name: '[Lot]', p_division: 'd-1', p_due: '2026-12-01', p_trial: false },
        },
        { nom: 'set_division_open', arguments: { p_division: 'd-1', p_open: true } },
        { nom: 'publish_division', arguments: { p_division: 'd-1' } },
        { nom: 'publish_batch', arguments: { p_batch: 'lot-1' } },
      ]);
    });

    it('compte une zone avec tout ce qu’elle contient', async () => {
      const { port } = fausseApi(
        {},
        {
          geo_divisions: [
            {
              id: 'pays',
              parent_id: null,
              level: 0,
              kind: 'country',
              name: 'Congo',
              slug: 'congo',
              path: 'congo',
              open_for_fieldwork: false,
            },
            {
              id: 'ville',
              parent_id: 'pays',
              level: 2,
              kind: 'city',
              name: 'Ville',
              slug: 'ville',
              path: 'congo.ville',
              open_for_fieldwork: true,
            },
            {
              id: 'quartier',
              parent_id: 'ville',
              level: 4,
              kind: 'quarter',
              name: 'Quartier',
              slug: 'quartier',
              path: 'congo.ville.quartier',
              open_for_fieldwork: false,
            },
            {
              id: 'autre',
              parent_id: 'pays',
              level: 2,
              kind: 'city',
              name: 'Autre',
              slug: 'autre',
              path: 'congo.autre',
              open_for_fieldwork: false,
            },
          ],
          division_stats: [
            {
              division_id: 'ville',
              path: 'congo.ville',
              campuses: 2,
              published: 1,
              from_field: 1,
              from_admin: 1,
              from_import: 0,
            },
            {
              division_id: 'quartier',
              path: 'congo.ville.quartier',
              campuses: 3,
              published: 3,
              from_field: 0,
              from_admin: 0,
              from_import: 3,
            },
            {
              division_id: 'autre',
              path: 'congo.autre',
              campuses: 4,
              published: 0,
              from_field: 4,
              from_admin: 0,
              from_import: 0,
            },
          ],
        },
      );
      const zones = await port.divisions();
      const parNom = Object.fromEntries(zones.map((z) => [z.nom, z]));
      expect(parNom['Congo']).toMatchObject({
        ecoles: 9,
        publiees: 4,
        relevees: 5,
        ajoutees: 1,
        importees: 3,
      });
      expect(parNom['Ville']).toMatchObject({ ecoles: 5, publiees: 4, ouverte: true });
      expect(parNom['Quartier']).toMatchObject({ ecoles: 3, importees: 3, ouverte: false });
    });
  });

  describe('les écoles', () => {
    it('crée une école d’un coup en traduisant les clés en anglais, et n’invente aucune position', async () => {
      const { port, appels } = fausseApi({
        create_catalog_entry: {
          data: { status: 'created', institution_id: 'i1', campus_ids: ['c1'] },
          error: null,
        },
      });
      const resultat = await port.creerEcole({
        reference: null,
        nom: '[École]',
        genre: 'privee',
        campus: [
          {
            etiquette: null,
            division: null,
            quartier: null,
            repere: '[face au marché]',
            numeroEnseigne: null,
            position: null,
            programme: null,
            cycles: [
              { cycle: 'maternelle', formations: [] },
              {
                cycle: 'lycee',
                formations: [
                  { titre: 'Série D', domaine: null, serie: 'd', diplome: 'bac', rythmes: [] },
                ],
              },
            ],
          },
        ],
      });
      expect(resultat).toEqual({
        statut: 'creee',
        institutionId: 'i1',
        campusIds: ['c1'],
        message: null,
      });
      const entree = (appels[0]?.arguments as { p_entry: { campuses: Record<string, unknown>[] } })
        .p_entry;
      expect(entree.campuses[0]).toMatchObject({
        landmark: '[face au marché]',
        latitude: null,
        longitude: null,
      });
      expect(entree.campuses[0]?.['cycles']).toEqual([
        'maternelle',
        {
          cycle: 'lycee',
          programs: [
            { title: 'Série D', domain: null, bac_track: 'd', diploma: 'bac', rhythms: [] },
          ],
        },
      ]);
    });

    it('rapporte une importation en simulation, avec les lignes en erreur', async () => {
      const { port, appels } = fausseApi({
        import_catalog: {
          data: {
            dry_run: true,
            total: 3,
            created: 1,
            exists: 1,
            errors: [{ line: 3, name: '[C]', message: 'Division inconnue' }],
          },
          error: null,
        },
      });
      const rapport = await port.importerEcoles(
        [{ reference: 'ETB-001', nom: '[A]', genre: 'publique', campus: [] }],
        true,
      );
      expect(rapport).toEqual({
        simulation: true,
        total: 3,
        creees: 1,
        existantes: 1,
        erreurs: [{ ligne: 3, nom: '[C]', message: 'Division inconnue' }],
      });
      expect(appels[0]?.arguments).toMatchObject({ p_dry_run: true, p_origin: 'import' });
    });

    it('confie un campus avec le genre de mission, et reprend', async () => {
      const { port, appels } = fausseApi();
      await port.confierEcole('c1', 'rel-1', 'verify', 'Le nom sur l’enseigne.');
      await port.reprendreEcole('c1');
      expect(appels).toEqual([
        {
          nom: 'assign_mission',
          arguments: {
            p_campus: 'c1',
            p_relay: 'rel-1',
            p_kind: 'verify',
            p_note: 'Le nom sur l’enseigne.',
          },
        },
        { nom: 'cancel_mission', arguments: { p_campus: 'c1' } },
      ]);
    });

    it('situe un campus : la position, et la division quand l’administration la choisit', async () => {
      const { port, appels } = fausseApi({ locate_campus: { data: 'Tié-Tié', error: null } });
      await expect(
        port.situerEcole('c1', { latitude: -4.79, longitude: 11.92 }, 'd-9'),
      ).resolves.toBe('Tié-Tié');
      expect(appels[0]?.arguments).toEqual({
        p_campus: 'c1',
        p_latitude: -4.79,
        p_longitude: 11.92,
        p_division: 'd-9',
      });
    });

    it('corrige une fiche : le nom et le type vont à l’institution, le reste au campus', async () => {
      const { port, appels } = fausseApi({}, { campuses: [{ institution_id: 'inst-1' }] });
      await port.modifierEcole('c1', {
        nom: '[Nouveau nom]',
        repere: null,
        numeroEnseigne: '242060000009',
      });
      expect(appels.find((a) => a.nom === 'update campuses')?.arguments).toEqual({
        landmark: null,
        sign_phone: '242060000009',
      });
      expect(appels.find((a) => a.nom === 'update institutions')?.arguments).toEqual({
        name: '[Nouveau nom]',
      });
    });

    it('ne touche à rien quand rien n’a changé', async () => {
      const { port, appels } = fausseApi();
      await port.modifierEcole('c1', {});
      expect(appels).toEqual([]);
    });

    it('note l’accord de la direction avec une date, jamais le message', async () => {
      const { port, appels } = fausseApi();
      await port.enregistrerVerification(
        'c1',
        '2026-11-04T12:00:00Z',
        'promoteur',
        'whatsapp',
        null,
      );
      expect(appels[0]).toEqual({
        nom: 'record_verification',
        arguments: {
          p_campus: 'c1',
          p_agreed_on: '2026-11-04',
          p_role: 'promoteur',
          p_channel: 'whatsapp',
          p_note: null,
        },
      });
    });
  });

  describe('la paie', () => {
    it('lit ce qui est dû dans les termes du modèle', async () => {
      const { port, appels } = fausseApi({
        payout_preview: {
          data: [
            {
              relay_id: 'a',
              first_name: '[A]',
              submissions: 4,
              contacts: 1,
              trial_bundles: 0,
              total_xaf: 2300,
              has_payment_details: true,
            },
          ],
          error: null,
        },
      });
      await expect(port.apercuPaie('2026-11-06')).resolves.toEqual([
        {
          relaisId: 'a',
          prenom: '[A]',
          fiches: 4,
          contacts: 1,
          essais: 0,
          totalXaf: 2300,
          numeroConnu: true,
        },
      ]);
      expect(appels[0]).toEqual({ nom: 'payout_preview', arguments: { p_friday: '2026-11-06' } });
    });

    it('clôture la semaine, note un paiement, enregistre un numéro Mobile Money', async () => {
      const { port, appels } = fausseApi({ close_payout_week: { data: 'semaine-1', error: null } });
      await expect(port.cloturerPaie('2026-11-06')).resolves.toBe('semaine-1');
      await port.noterPaye('semaine-1', 'a', 'MP-123');
      await port.enregistrerMobileMoney('a', 'mtn', '242061234567');
      expect(appels.map((a) => a.nom)).toEqual([
        'close_payout_week',
        'mark_statement_paid',
        'set_relay_payment_details',
      ]);
      expect(appels[1]?.arguments).toEqual({
        p_batch: 'semaine-1',
        p_relay: 'a',
        p_reference: 'MP-123',
      });
      expect(appels[2]?.arguments).toEqual({
        p_relay: 'a',
        p_operator: 'mtn',
        p_msisdn: '242061234567',
      });
    });
  });
});
