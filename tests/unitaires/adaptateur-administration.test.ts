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
  rpc: Record<string, Reponse | ((args: unknown) => Reponse)> = {},
  tables: Record<string, unknown[]> = {},
  erreurs: Record<string, { code?: string; message?: string }> = {},
) {
  const appels: { nom: string; arguments: unknown }[] = [];
  const requete = (lignes: unknown[], table: string) => {
    const erreur = erreurs[table] ?? null;
    const constructeur: Record<string, unknown> = {};
    for (const methode of ['select', 'eq', 'neq', 'is', 'order', 'range', 'limit', 'not', 'in']) {
      constructeur[methode] = (...args: unknown[]) => {
        if (methode === 'eq' || methode === 'not' || methode === 'is' || methode === 'in') {
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
      const reponse = rpc[nom];
      return Promise.resolve(
        typeof reponse === 'function' ? reponse(args) : (reponse ?? { data: null, error: null }),
      );
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
  describe('la file « À valider » et la zone ouverte (ticket n° 67)', () => {
    const ligne = {
      id: 'r1',
      received_at: '2026-11-02T08:00:00Z',
      kind: 'releve',
      sign_name: '[École]',
      relay: '[A]',
      batch: null,
      trial: false,
      outside_batch: null,
      possible_duplicate: false,
      duplicate_answer: null,
      accuracy_m: 12,
      photos: 1,
      signboard_received: true,
      has_programs_hint: false,
      contact_received: false,
    };

    it('dit si la position est en zone ouverte : oui, non, ou inconnue (jamais « non » par défaut)', async () => {
      const { port } = fausseApi(
        {},
        {
          submissions_to_review: [
            { ...ligne, id: 'r1', in_open_zone: true },
            { ...ligne, id: 'r2', in_open_zone: false },
            { ...ligne, id: 'r3', in_open_zone: null },
          ],
        },
      );
      const file = await port.relevesAValider();
      expect(file.map((r) => [r.id, r.enZoneOuverte])).toEqual([
        ['r1', true],
        ['r2', false],
        ['r3', null],
      ]);
    });

    it('donne à la base la division que l’administration a choisie, et seulement elle', async () => {
      const { port, appels } = fausseApi({ accept_submission: { data: 'campus-3', error: null } });
      await port.accepter('r5', { divisionId: 'div-1' });
      await port.accepter('r6');
      expect(appels[0]?.arguments).toMatchObject({ p_submission: 'r5', p_division: 'div-1' });
      expect(appels[1]?.arguments).toMatchObject({ p_submission: 'r6', p_division: null });
    });

    it('active un relais sans lot : la base reçoit un lot nul', async () => {
      const { port, appels } = fausseApi({ activer_relais: { data: null, error: null } });
      await port.activerRelais('relais-1', null);
      expect(appels).toEqual([
        { nom: 'activer_relais', arguments: { relais: 'relais-1', lot: null } },
      ]);
    });
  });

  describe('les lots rendus (ticket n° 67, M5)', () => {
    it('lit la date à laquelle un lot a été rendu, ou rien', async () => {
      const ligne = {
        nom: '[Lot]',
        essai: false,
        a_rendre_le: '2026-11-20',
        geo_division_id: 'd1',
        geo_divisions: { name: '[Zone]', path: 'congo.zone' },
      };
      const { port } = fausseApi(
        {},
        {
          lots: [
            { ...ligne, id: 'l1', rendu_le: '2026-11-18' },
            { ...ligne, id: 'l2', rendu_le: null },
          ],
        },
      );
      const lots = await port.lots();
      expect(lots.map((l) => [l.id, l.renduLe])).toEqual([
        ['l1', '2026-11-18'],
        ['l2', null],
      ]);
    });

    it('marque un lot rendu, ou le remet en cours, par la fonction de la base', async () => {
      const { port, appels } = fausseApi({ mark_batch_returned: { data: null, error: null } });
      await port.marquerLotRendu('l1', true);
      await port.marquerLotRendu('l1', false);
      expect(appels).toEqual([
        { nom: 'mark_batch_returned', arguments: { p_batch: 'l1', p_returned: true } },
        { nom: 'mark_batch_returned', arguments: { p_batch: 'l1', p_returned: false } },
      ]);
    });
  });

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
            p_division: null,
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
        p_division: null,
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
      await expect(port.contactsReleve('r1')).resolves.toMatchObject([
        { fonction: 'promoteur', whatsapp: '242061234567', accord: true },
      ]);
    });

    it('dit « aucun contact » quand la base n’en a pas', async () => {
      const { port } = fausseApi({ contact_of_submission: { data: [], error: null } });
      await expect(port.contactsReleve('r1')).resolves.toEqual([]);
    });

    // Plusieurs personnes par fiche (#96) : toutes, dans l'ordre de la base, chacune avec son identifiant, sa précision et d'où elle vient.
    it('lit toutes les personnes de la fiche, avec leur identifiant, leur précision et leur source', async () => {
      const { port } = fausseApi({
        contact_of_submission: {
          data: [
            { ...contactDeLOrigine, id: 'r1' },
            {
              ...contactDeLOrigine,
              id: 'p2',
              role: 'autre',
              role_detail: 'propriétaire',
              source: 'administration',
            },
          ],
          error: null,
        },
      });
      await expect(port.contactsReleve('r1')).resolves.toMatchObject([
        { id: 'r1', fonction: 'directeur', precisionFonction: null, source: 'relais' },
        {
          id: 'p2',
          fonction: 'autre',
          precisionFonction: 'propriétaire',
          source: 'administration',
          releveId: 'r1',
        },
      ]);
    });

    // Une base pas encore à jour ne rend ni identifiant ni source : la personne d'avant a pour identifiant sa fiche.
    it('lit une base d’avant : l’identifiant est celui de la fiche, la source « relais »', async () => {
      const { port } = fausseApi({
        contact_of_submission: { data: [contactDeLOrigine], error: null },
      });
      await expect(port.contactsReleve('r1')).resolves.toMatchObject([
        { id: 'r1', source: 'relais', precisionFonction: null },
      ]);
    });

    it('ajoute une personne à une fiche, avec son numéro en forme internationale, et rend son identifiant', async () => {
      const { port, appels } = fausseApi({ add_contact: { data: 'p9', error: null } });
      await expect(
        port.ajouterContact('r1', {
          fonction: 'autre',
          precisionFonction: 'propriétaire',
          nom: '[Nom]',
          whatsapp: '242061234567',
          accord: true,
          note: null,
        }),
      ).resolves.toBe('p9');
      expect(appels[0]).toEqual({
        nom: 'add_contact',
        arguments: {
          p_submission: 'r1',
          p_role: 'autre',
          p_role_detail: 'propriétaire',
          p_name: '[Nom]',
          p_whatsapp: '242061234567',
          p_agreement: true,
          p_agreement_at: null,
          p_note: null,
        },
      });
    });

    it('corrige une personne en redonnant tous ses champs', async () => {
      const { port, appels } = fausseApi();
      await port.corrigerContact('p2', {
        fonction: 'directeur',
        precisionFonction: null,
        nom: null,
        whatsapp: null,
        accord: false,
        note: 'Rappeler mardi',
      });
      expect(appels[0]).toEqual({
        nom: 'update_contact',
        arguments: {
          p_contact: 'p2',
          p_role: 'directeur',
          p_role_detail: null,
          p_name: null,
          p_whatsapp: null,
          p_agreement: false,
          p_agreement_at: null,
          p_note: 'Rappeler mardi',
        },
      });
    });

    it('efface une personne, pas toute la fiche', async () => {
      const { port, appels } = fausseApi();
      await port.effacerContact('p2', 'demande de la personne');
      expect(appels[0]).toEqual({
        nom: 'erase_contact_person',
        arguments: { p_contact: 'p2', p_note: 'demande de la personne' },
      });
    });

    it('dit en français pourquoi la base refuse une quatrième personne', async () => {
      const { port } = fausseApi({
        add_contact: {
          data: null,
          error: { code: '22023', message: 'Une fiche a trois personnes à contacter au plus.' },
        },
      });
      await expect(
        port.ajouterContact('r1', {
          fonction: 'directeur',
          precisionFonction: null,
          nom: null,
          whatsapp: null,
          accord: false,
          note: null,
        }),
      ).rejects.toThrow('trois personnes');
    });

    // Le contact reste attaché à la fiche qui l'a reçu : celui d'une fiche qu'on corrige se lit sur sa correction (#94).
    const contactDeLOrigine = {
      role: 'directeur',
      name: '[Nom]',
      whatsapp: '242061234567',
      contact_agreement: true,
      agreement_at: '2026-11-02T08:00:00Z',
      said_note: null,
      received_at: '2026-11-02T09:00:00Z',
    };

    it('une correction sans contact lit celui de la fiche qu’elle corrige, et dit laquelle le porte', async () => {
      const { port } = fausseApi(
        {
          contact_of_submission: (args) =>
            (args as { p_submission: string }).p_submission === 'origine'
              ? { data: [contactDeLOrigine], error: null }
              : { data: [], error: null },
        },
        { field_submissions: [{ corrects_submission_id: 'origine' }] },
      );
      await expect(port.contactsReleve('correction')).resolves.toMatchObject([
        { fonction: 'directeur', whatsapp: '242061234567', releveId: 'origine' },
      ]);
    });

    it('le contact de la fiche elle-même l’emporte, sans chercher plus loin', async () => {
      const { port, appels } = fausseApi(
        { contact_of_submission: { data: [contactDeLOrigine], error: null } },
        { field_submissions: [{ corrects_submission_id: 'origine' }] },
      );
      await expect(port.contactsReleve('r1')).resolves.toMatchObject([{ releveId: 'r1' }]);
      expect(appels.filter((a) => a.nom === 'contact_of_submission')).toHaveLength(1);
    });

    it('aucun contact dans la chaîne, même si elle boucle : rien, et la lecture s’arrête', async () => {
      const { port, appels } = fausseApi(
        { contact_of_submission: { data: [], error: null } },
        { field_submissions: [{ corrects_submission_id: 'r1' }] },
      );
      await expect(port.contactsReleve('r1')).resolves.toEqual([]);
      expect(appels.filter((a) => a.nom === 'contact_of_submission')).toHaveLength(1);
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

  describe('la photo publique d’une école', () => {
    it('ne propose que les enseignes et les vues du bâtiment des relevés acceptés', async () => {
      const { port, appels } = fausseApi(
        {},
        {
          field_submissions: [{ id: 'r1' }],
          field_submission_photos: [
            {
              id: 'p1',
              role: 'signboard',
              storage_path: 'r1/p1.webp',
              bytes: 1000,
              width: null,
              height: null,
              taken_at: null,
              child_free_checked_at: null,
              is_public: false,
            },
            {
              id: 'p2',
              role: 'building',
              storage_path: 'r1/p2.webp',
              bytes: 1000,
              width: null,
              height: null,
              taken_at: '2026-10-01T09:00:00Z',
              child_free_checked_at: '2026-11-02T10:00:00Z',
              is_public: true,
            },
          ],
        },
      );
      const photos = await port.photosEcole('e1');
      expect(photos.map((p) => [p.id, p.role, p.publiable, p.publique])).toEqual([
        ['p1', 'signboard', false, false],
        ['p2', 'building', true, true],
      ]);
      const roles = appels.find(
        (a) =>
          a.nom === 'in field_submission_photos' &&
          Array.isArray(a.arguments) &&
          a.arguments[0] === 'role',
      );
      expect(roles?.arguments).toEqual(['role', ['signboard', 'building']]);
      expect(
        appels.some(
          (a) =>
            a.nom === 'eq field_submissions' &&
            JSON.stringify(a.arguments) === '["status","accepte"]',
        ),
      ).toBe(true);
    });

    it('lit l’état de la photo publique dans la base, sans jamais le déduire', async () => {
      const { port, appels } = fausseApi({
        campus_public_photo_state: {
          data: { mode: 'retire', choice: null, published: true, retained: null },
          error: null,
        },
      });
      expect(await port.etatPhotoPublique('e1')).toEqual({
        mode: 'retire',
        choisieId: null,
        publiee: true,
        retenueId: null,
      });
      expect(appels).toEqual([{ nom: 'campus_public_photo_state', arguments: { p_campus: 'e1' } }]);
    });

    it('retire la photo publique par un choix nul, jamais en retirant seulement le contrôle d’une photo', async () => {
      const { port, appels } = fausseApi({ set_campus_public_photo: { data: null, error: null } });
      await port.choisirPhotoPublique('e1', null, false);
      // Une seule commande, `set_campus_public_photo` avec une photo nulle : la base écrit un retrait explicite qui bloque
      // aussi le repli. Aucune photo n'est modifiée à la main, sinon une autre photo contrôlée paraîtrait.
      expect(appels).toEqual([
        {
          nom: 'set_campus_public_photo',
          arguments: { p_campus: 'e1', p_photo: null, p_confirmed: false },
        },
      ]);
    });

    it('un choix n’est envoyé qu’avec la confirmation du contrôle', async () => {
      const { port, appels } = fausseApi({ set_campus_public_photo: { data: null, error: null } });
      await port.choisirPhotoPublique('e1', 'p2', true);
      expect(appels[0]?.arguments).toEqual({ p_campus: 'e1', p_photo: 'p2', p_confirmed: true });
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

    it('règle l’état public d’une zone sans toucher à son ouverture aux relais', async () => {
      const { port, appels } = fausseApi({
        set_division_public_status: { data: null, error: null },
      });
      await port.etatPublicZone('d-1', 'actif');
      await port.etatPublicZone('d-1', 'programme');
      await port.etatPublicZone('d-1', null);
      expect(appels).toEqual([
        { nom: 'set_division_public_status', arguments: { p_division: 'd-1', p_status: 'actif' } },
        {
          nom: 'set_division_public_status',
          arguments: { p_division: 'd-1', p_status: 'programme' },
        },
        { nom: 'set_division_public_status', arguments: { p_division: 'd-1', p_status: null } },
      ]);
      expect(appels.map((a) => a.nom)).not.toContain('set_division_open');
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

describe('la liste des relais, côté Supabase (ticket n° 78)', () => {
  // L'adresse de chaque relais vient d'une fonction de la base (`relay_identities`). Le code peut arriver avant
  // `supabase db push` : sans la fonction, la liste se lit quand même, sans adresses (comme avant).
  const relais = [
    {
      id: 'r1',
      prenom: 'Marie',
      statut: 'en_attente',
      lot_id: null,
      cree_le: '2026-11-03T08:00:00Z',
      active_le: null,
    },
    {
      id: 'r2',
      prenom: 'Paul',
      statut: 'actif',
      lot_id: null,
      cree_le: '2026-11-02T08:00:00Z',
      active_le: '2026-11-02T09:00:00Z',
    },
  ];

  it('rend l’adresse de chaque relais, quand la base la connaît', async () => {
    const { port } = fausseApi(
      {
        relay_identities: { data: [{ relay_id: 'r1', email: 'marie@exemple.test' }], error: null },
      },
      { relais, relay_counters: [] },
    );
    const liste = await port.relais();
    expect(liste.find((r) => r.id === 'r1')?.email).toBe('marie@exemple.test');
    // Un relais dont la base n'a pas l'adresse (un compte d'avant) : nulle, jamais une chaîne vide.
    expect(liste.find((r) => r.id === 'r2')?.email).toBeNull();
  });

  it('se lit quand même si la base n’a pas encore la fonction : sans adresses, jamais en erreur', async () => {
    const { port } = fausseApi(
      {
        relay_identities: {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.relay_identities',
          },
        },
      },
      { relais, relay_counters: [] },
    );
    const liste = await port.relais();
    expect(liste.map((r) => r.prenom).sort()).toEqual(['Marie', 'Paul']);
    expect(liste.every((r) => r.email === null)).toBe(true);
  });
});

describe('la vue d’ensemble, côté Supabase (ticket n° 76)', () => {
  it('lit les agrégats de la base', async () => {
    const { port } = fausseApi({
      admin_overview: {
        data: { to_review: { count: 2, oldest_received_at: null, over_24h: 0 } },
        error: null,
      },
    });
    expect((await port.vueEnsemble()).aValider.nombre).toBe(2);
  });

  it('demande 14 jours par défaut, et le nombre de jours qu’on lui donne', async () => {
    const { port, appels } = fausseApi({ admin_overview: { data: {}, error: null } });
    await port.vueEnsemble();
    await port.vueEnsemble(30);
    expect(appels.filter((a) => a.nom === 'admin_overview').map((a) => a.arguments)).toEqual([
      { p_days: 14 },
      { p_days: 30 },
    ]);
  });

  it('une base sans la fonction le dit : « supabase db push », pas une erreur muette', async () => {
    const { port } = fausseApi({
      admin_overview: {
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.admin_overview' },
      },
    });
    await expect(port.vueEnsemble()).rejects.toThrow(/supabase db push/);
    await expect(port.vueEnsemble()).rejects.toBeInstanceOf(ErreurDecision);
  });
});

describe('le compteur des écoles prêtes (audit du 06/11/2026)', () => {
  it('compte les écoles prêtes sans charger la liste', async () => {
    const { port, appels } = fausseApi({}, { campuses: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    expect(await port.ecolesPretes()).toBe(3);
    expect(appels).toContainEqual({ nom: 'eq campuses', arguments: ['publication', 'prete'] });
  });

  it('une lecture qui échoue le dit : l’écran garde alors l’ancien nombre', async () => {
    const { port } = fausseApi(
      {},
      {},
      { campuses: { code: '42501', message: 'permission denied' } },
    );
    await expect(port.ecolesPretes()).rejects.toBeTruthy();
  });
});

describe('la corbeille et la suppression d’une école (audit du 06/11/2026)', () => {
  const apercu = (bloque: string | null, chemins: string[] = []) => ({
    data: {
      name: 'Complexe [Étoile]',
      trashed: true,
      blocked: bloque,
      submissions: 2,
      photos: chemins.length,
      contacts: 1,
      paths: chemins,
    },
    error: null,
  });

  it('met à la corbeille avec le motif et la note, et restaure', async () => {
    const { port, appels } = fausseApi({
      trash_campus: { data: null, error: null },
      restore_campus: { data: null, error: null },
    });
    await port.mettreALaCorbeille('e1', 'erreur', 'Fiche de test');
    await port.restaurerEcole('e1');
    expect(appels.filter((a) => /_campus$/.test(a.nom))).toEqual([
      {
        nom: 'trash_campus',
        arguments: { p_campus: 'e1', p_reason: 'erreur', p_note: 'Fiche de test' },
      },
      { nom: 'restore_campus', arguments: { p_campus: 'e1' } },
    ]);
  });

  it('l’aperçu dit ce que la suppression emporterait, sans les chemins des fichiers', async () => {
    const { port } = fausseApi({ campus_purge_preview: apercu(null, ['releves/a.jpg']) });
    expect(await port.apercuSuppression('e1')).toEqual({
      nom: 'Complexe [Étoile]',
      bloque: null,
      fiches: 2,
      photos: 1,
      contacts: 1,
    });
  });

  it('un aperçu incomplet se lit sans casser : les nombres manquants valent zéro', async () => {
    const { port } = fausseApi({ campus_purge_preview: { data: {}, error: null } });
    expect(await port.apercuSuppression('e1')).toEqual({
      nom: '',
      bloque: null,
      fiches: 0,
      photos: 0,
      contacts: 0,
    });
  });

  it('supprime les fichiers du stockage, puis l’école', async () => {
    const { port, appels } = fausseApi({
      campus_purge_preview: apercu(null, ['releves/a.jpg', 'releves/b.jpg']),
      purge_campus: { data: {}, error: null },
    });
    await port.supprimerDefinitivement('e1');
    const ordre = appels
      .filter((a) => a.nom === 'purge_campus' || a.nom.startsWith('stockage'))
      .map((a) => a.nom);
    expect(ordre).toEqual([expect.stringMatching(/^stockage /), 'purge_campus']);
    expect(appels.find((a) => a.nom.startsWith('stockage'))?.arguments).toEqual([
      'releves/a.jpg',
      'releves/b.jpg',
    ]);
  });

  it('ce qui bloque s’arrête avant de toucher à un fichier ou à la base', async () => {
    const { port, appels } = fausseApi({
      campus_purge_preview: apercu('Une fiche de cette école figure dans la paie d’un relais.', [
        'releves/a.jpg',
      ]),
      purge_campus: { data: {}, error: null },
    });
    await expect(port.supprimerDefinitivement('e1')).rejects.toThrow(/paie/);
    expect(appels.some((a) => a.nom.startsWith('stockage') || a.nom === 'purge_campus')).toBe(
      false,
    );
  });

  it('un refus de la base se dit en français', async () => {
    const { port } = fausseApi({
      trash_campus: {
        data: null,
        error: { code: 'P0002', message: 'Cette école est introuvable ou déjà à la corbeille.' },
      },
    });
    await expect(port.mettreALaCorbeille('e1', 'erreur', null)).rejects.toThrow(/corbeille/);
  });
});

describe('les corrections préparées à l’acceptation', () => {
  it('envoie les valeurs explicites dans un seul appel, y compris les effacements', async () => {
    const { port, appels } = fausseApi({
      accept_reviewed_submission: { data: 'campus-revu', error: null },
    });
    await expect(
      port.accepter('releve-revu', {
        mode: 'new_institution',
        corrections: {
          nom: 'École corrigée',
          typeEcole: 'publique',
          niveaux: ['college'],
          programme: null,
          repere: 'Marché',
          numeroEnseigne: null,
        },
      }),
    ).resolves.toBe('campus-revu');
    expect(appels).toEqual([
      {
        nom: 'accept_reviewed_submission',
        arguments: {
          p_submission: 'releve-revu',
          p_mode: 'new_institution',
          p_campus: null,
          p_institution: null,
          p_label: null,
          p_programs: [],
          p_division: null,
          p_changes: {
            sign_name: 'École corrigée',
            school_kind: 'publique',
            levels: ['college'],
            curriculum_note: null,
            landmark: 'Marché',
            sign_phone: null,
          },
        },
      },
    ]);
  });
  it('garde l’appel historique quand aucune information n’a changé', async () => {
    const { port, appels } = fausseApi({ accept_submission: { data: 'campus', error: null } });
    await port.accepter('releve', { corrections: {} });
    expect(appels.map((a) => a.nom)).toEqual(['accept_submission']);
  });
  it('propage un refus de correction sans tenter une acceptation non corrigée', async () => {
    const { port, appels } = fausseApi({
      accept_reviewed_submission: {
        data: null,
        error: { code: '22023', message: 'Nom invalide.' },
      },
    });
    await expect(port.accepter('releve', { corrections: { nom: '' } })).rejects.toThrow(
      'Nom invalide.',
    );
    expect(appels.map((a) => a.nom)).toEqual(['accept_reviewed_submission']);
  });
});
