// L'adaptateur des messages reçus (refonte, lot 3B2) : ce qu'il envoie, ce qu'il lit, et surtout ses refus. Un 409 n'est pas un
// « déjà reçu », un 401 n'est pas une panne, une réponse qui ne vient pas n'affirme rien, et aucun texte de la base qui pourrait
// porter une donnée ne sort.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  creerGestesDesMessages,
  lireContenu,
  lireLigne,
  lireMessage,
  lireResume,
} from '../../src/infra/supabase/messages';
import { CHAMPS } from '../../src/modele/demandes';
import { FILES } from '../../src/modele/messages-recus';
import {
  ErreurAcces,
  ErreurConflit,
  ErreurDecision,
  ErreurIntrouvable,
  ErreurReseau,
  ErreurSession,
} from '../../src/modele/ports';

type Reponse = {
  data: unknown;
  error: { code?: string; message?: string; details?: string } | null;
  status?: number;
};
function api(
  reponse: Reponse | (() => Promise<Reponse>) = { data: null, error: null },
  delaiMs?: number,
) {
  const appels: [string, unknown][] = [];
  const client = {
    rpc: (nom: string, args: unknown) => {
      appels.push([nom, args]);
      return typeof reponse === 'function' ? reponse() : Promise.resolve(reponse);
    },
  };
  return {
    port: creerGestesDesMessages(() => client as unknown as SupabaseClient, delaiMs),
    appels,
  };
}
const REF = 'A-7K4P-2QXM';

/** Une ligne telle que la base la rend. */
const ligne = {
  row_id: 12,
  reference: REF,
  kind: 'absente',
  state: 'recue',
  row_version: 1,
  received_at: '2026-11-24T08:00:00+00:00',
  opened: false,
  subject: null,
  topic: null,
  removal: null,
  school_name: '[École]',
  town: 'Brazzaville',
  campus_name: null,
  versions: 1,
  follows: null,
  redirected_from: null,
  decision: null,
  reply_channel: 'non',
  reply_state: 'non_demandee',
  limit_reached_at: null,
  notice_state: 'a_envoyer',
  notice_error: null,
  removal_step: null,
  removed_at: null,
  closed_at: null,
  purge_on: null,
};
const message = {
  reference: 'R-2XFG-7MPA',
  kind: 'retrait',
  state: 'ouverte',
  row_version: 4,
  received_at: '2026-11-20T08:00:00+00:00',
  opened_at: '2026-11-20T09:00:00+00:00',
  limit_reached_at: null,
  campus: { id: 'c1', name: '[École] — Site 1', publication: 'publiee' },
  decision: null,
  decision_note: null,
  decided_at: null,
  reply_channel: 'email',
  reply_state: 'a_faire',
  replied_on: null,
  spam_since: null,
  closed_at: null,
  purge_on: null,
  follows: 'R-9BHN-2TSE',
  followed_by: ['R-6KDT-4WQZ'],
  redirected_from: null,
  redirected_to: [],
  revision: 2,
  versions: [
    {
      revision: 1,
      content: { origin: 'fiche', removal: 'tel', reply: 'email', contact: 'p@exemple.test' },
      late: false,
      current: false,
      received_at: '2026-11-20T08:00:00+00:00',
    },
    {
      revision: 2,
      content: { origin: 'fiche', removal: 'photo', removal_details: 'x', champ_futur: 1 },
      late: true,
      current: true,
      received_at: '2026-11-20T08:10:00+00:00',
    },
  ],
  events: [{ what: 'recue', detail: null, at: '2026-11-20T08:00:00+00:00' }],
  notice: {
    state: 'abandonnee',
    attempts: 9,
    next_attempt_at: null,
    last_error: 'delai',
    sent_at: null,
  },
  removal: {
    step: 'retirer',
    outcome: 'concernee',
    check_kind: 'autre',
    check_note: 'note',
    checked_at: '2026-11-20T10:00:00+00:00',
    targets: ['contact_public', 'photo', 'cible_future'],
    target_campus_id: 'c1',
    target_photo_id: 'p1',
    removed_at: null,
    publish_requested_at: null,
    publish_run: null,
    production_seen_on: null,
    essai_seen_on: null,
    seen_at: null,
  },
};
const resume = {
  to_handle: 4,
  new: 2,
  waiting: 1,
  closed: 3,
  removals: 2,
  removals_closed: 1,
  oldest_removal_at: '2026-11-21T08:00:00+00:00',
  spam: 1,
  limit_reached: 1,
  notices_waiting: 5,
  notices_failing: 2,
  notices_abandoned: 1,
  notices_last_run_at: null,
  purge_last_run_at: '2026-11-24T01:40:00+00:00',
  overdue: 0,
  daily_cap_reached_at: null,
};

describe('lire', () => {
  it('une ligne : ni texte ni coordonnée ; dates et versions telles quelles', () => {
    const l = lireLigne(ligne);
    expect(l).toMatchObject({
      rang: 12,
      reference: REF,
      nature: 'absente',
      version: 1,
      recuLe: '2026-11-24T08:00:00+00:00',
      ouvert: false,
      alerte: 'a_envoyer',
      effaceLe: null,
    });
    expect(Object.keys(l)).not.toContain('message');
    expect(Object.keys(l)).not.toContain('coordonnee');
  });
  it('un message entier : versions, suites, alerte, retrait ; une valeur future est laissée de côté', () => {
    const m = lireMessage(message);
    expect(m.versions.map((v) => [v.revision, v.courante, v.tardive])).toEqual([
      [1, false, false],
      [2, true, true],
    ]);
    expect(m.versions[1]!.contenu).toEqual({ origine: 'fiche', aRetirer: 'photo', precision: 'x' });
    expect(m).toMatchObject({
      version: 4,
      suiteDe: 'R-9BHN-2TSE',
      suites: ['R-6KDT-4WQZ'],
      fiche: { id: 'c1', nom: '[École] — Site 1', publication: 'publiee' },
      alerte: { etat: 'abandonnee', essais: 9, erreur: 'delai' },
      retrait: {
        etape: 'retirer',
        issue: 'concernee',
        cibles: ['contact_public', 'photo'],
        ciblePhotoId: 'p1',
      },
    });
  });
  it('le contenu : un nom de champ de la base pour chaque champ du modèle', () => {
    const brut = {
      origin: 'a',
      subject: 'b',
      message: 'c',
      school_name: 'd',
      town: 'e',
      landmark: 'f',
      other_details: 'g',
      levels: ['M'],
      is_from_school: true,
      campus_id: 'h',
      topic: 'i',
      correction: 'j',
      knowledge: 'k',
      removal: 'l',
      removal_details: 'm',
      reply: 'n',
      contact: 'o',
      person_name: 'p',
    };
    expect(Object.keys(lireContenu(brut)).sort()).toEqual(CHAMPS.map((c) => c.nom).sort());
    expect(Object.keys(brut).length).toBe(CHAMPS.length);
  });
  it('le résumé ; une réponse illisible n’est pas « rien n’attend »', () => {
    expect(lireResume(resume)).toMatchObject({
      aTraiter: 4,
      retraits: 2,
      alertesEnAttente: 5,
      alertesAbandonnees: 1,
      dernierPassageAlertesLe: null,
    });
    for (const illisible of [null, {}, [], 'x']) expect(() => lireResume(illisible)).toThrow();
    expect(() => lireLigne({ ...ligne, state: 'etat_futur' })).toThrow();
    expect(() =>
      lireMessage({ ...message, removal: { ...message.removal, step: 'etape_future' } }),
    ).toThrow();
  });
  it('une liste qui n’en est pas une est une panne, jamais une file vide', async () => {
    await expect(api({ data: null, error: null }).port.messages('a-traiter')).rejects.toThrow();
    expect(await api({ data: [], error: null }).port.messages('a-traiter')).toEqual([]);
  });
});

describe('demander', () => {
  it('la file, la nature, la page : tout se lit dans la base, rien ne se trie dans le navigateur', async () => {
    const a = api({ data: [ligne], error: null });
    await a.port.messages('alertes', { nature: 'retrait', avant: 12, nombre: 30 });
    await a.port.messages('clos');
    expect(a.appels).toEqual([
      ['list_public_requests', { p_tab: 'alertes', p_limit: 30, p_before: 12, p_kind: 'retrait' }],
      ['list_public_requests', { p_tab: 'closes', p_limit: 30, p_before: null, p_kind: null }],
    ]);
    const files = new Set<unknown>();
    for (const f of FILES) {
      const b = api({ data: [], error: null });
      await b.port.messages(f);
      files.add((b.appels[0]![1] as { p_tab: string }).p_tab);
    }
    expect(files.size).toBe(FILES.length);
  });

  it('chaque geste porte la version lue', async () => {
    const a = api({ data: 'A-9HZE-4NBV', error: null });
    const p = a.port;
    await p.rattacherMessage(REF, 7, 'c1');
    await p.rattacherMessage(REF, 7, null);
    await p.deciderMessage(REF, 7, 'introuvable', '  motif  ');
    await p.reorienterMessage(REF, 7, 'retrait');
    await p.restaurerMessage(REF, 7);
    await p.mettreEnAttente(REF, 7, true);
    await p.noterReponse(REF, 7, 'faite', '2026-11-24');
    await p.noterReponse(REF, 7, 'impossible', '2026-11-24');
    await p.cloreMessage(REF, 7);
    await p.rouvrirMessage(REF, 7);
    await p.verifierRetrait(REF, 7, 'autre', ' note ');
    await p.verifierRetrait(REF, 7, 'numero', 'ignorée');
    await p.retraitImpossible(REF, 7);
    await p.ciblerRetrait(REF, 7, ['photo'], 'c1', 'p1');
    await p.ciblerRetrait(REF, 7, ['texte'], null, 'p1');
    await p.noterRetire(REF, 7);
    await p.noterMiseEnLigne(REF, 7, ' 42 ');
    await p.noterConstat(REF, 7, '2026-11-23', '2026-11-24');
    for (const [nom, args] of a.appels) {
      expect(args, nom).toMatchObject({ p_reference: REF, p_version: 7 });
    }
    const reste = a.appels.map(([nom, args]) => {
      const { p_reference, p_version, ...autres } = args as Record<string, unknown>;
      void p_reference;
      void p_version;
      return [nom, autres];
    });
    expect(reste).toEqual([
      ['attach_public_request', { p_campus: 'c1' }],
      ['attach_public_request', { p_campus: null }],
      ['decide_public_request', { p_decision: 'introuvable', p_note: 'motif' }],
      ['redirect_public_request', { p_kind: 'retrait' }],
      ['restore_public_request', {}],
      ['set_public_request_waiting', { p_waiting: true }],
      ['record_public_request_reply', { p_outcome: 'faite', p_replied_on: '2026-11-24' }],
      ['record_public_request_reply', { p_outcome: 'impossible', p_replied_on: null }],
      ['close_public_request', {}],
      ['reopen_public_request', {}],
      ['verify_removal', { p_check: 'autre', p_note: 'note' }],
      ['verify_removal', { p_check: 'numero', p_note: null }],
      ['fail_removal', {}],
      ['target_removal', { p_targets: ['photo'], p_campus: 'c1', p_photo: 'p1' }],
      ['target_removal', { p_targets: ['texte'], p_campus: null, p_photo: null }],
      ['record_removal', {}],
      ['record_removal_publication', { p_run: '42' }],
      ['record_removal_seen', { p_production_on: '2026-11-23', p_essai_on: '2026-11-24' }],
    ]);
  });

  it('relancer une alerte n’ouvre pas le message', async () => {
    const a = api();
    await a.port.relancerAlerte(REF);
    expect(a.appels).toEqual([['retry_public_request_notice', { p_reference: REF }]]);
  });
});

describe('les refus', () => {
  const refus = (r: Partial<Reponse['error'] & object> & { code?: string }, status?: number) =>
    api({ data: null, error: r, ...(status === undefined ? {} : { status }) }).port.deciderMessage(
      REF,
      1,
      'existe',
      null,
    );

  it('409 : la ligne a changé, ce n’est jamais un « déjà reçu »', async () => {
    await expect(
      refus({ code: 'PT409', message: 'Cette demande a changé entre-temps.' }, 409),
    ).rejects.toBeInstanceOf(ErreurConflit);
    // Un 409 sans notre code ne vaut pas succès non plus.
    await expect(refus({ code: '23505', message: 'duplicate' }, 409)).rejects.toBeInstanceOf(
      ErreurDecision,
    );
    await expect(refus({ message: 'conflit' }, 409)).rejects.toThrow();
  });
  it('403 : le compte n’est pas, ou plus, administrateur', async () => {
    await expect(
      refus({ code: '42501', message: 'Réservé à l’administration.' }, 403),
    ).rejects.toBeInstanceOf(ErreurAcces);
  });
  it('401 : la session est finie, ce n’est pas une panne', async () => {
    await expect(refus({ code: 'PGRST301', message: 'JWT expired' }, 401)).rejects.toBeInstanceOf(
      ErreurSession,
    );
    await expect(refus({ message: 'No API key' }, 401)).rejects.toBeInstanceOf(ErreurSession);
  });
  it('un refus écrit par la base garde sa phrase ; un message effacé se dit', async () => {
    await expect(
      refus({ code: '22023', message: 'Encore publié : le contact public.' }),
    ).rejects.toThrow('Encore publié : le contact public.');
    await expect(
      refus({ code: 'PT404', message: 'Message introuvable : il a peut-être été effacé.' }),
    ).rejects.toBeInstanceOf(ErreurIntrouvable);
  });
  it('une contrainte violée ne recopie ni son texte ni sa ligne', async () => {
    const e = await refus({
      code: '23514',
      message: 'new row violates check constraint',
      details: 'Failing row contains (TEXTE PRIVÉ)',
    }).catch((x: unknown) => x as Error);
    expect(e).toBeInstanceOf(ErreurDecision);
    expect(String((e as Error).message)).not.toMatch(/PRIVÉ|constraint/);
  });
  it('réseau, délai, 5xx : rien n’est affirmé', async () => {
    await expect(refus({ message: 'TypeError: Failed to fetch' }, 0)).rejects.toBeInstanceOf(
      ErreurReseau,
    );
    const muet = api(() => new Promise<Reponse>(() => undefined), 20);
    await expect(muet.port.cloreMessage(REF, 1)).rejects.toBeInstanceOf(ErreurReseau);
    const cinq = await refus({ code: '57014', message: 'canceling statement' }, 500).catch(
      (x: unknown) => x,
    );
    expect(cinq).toBeInstanceOf(Error);
    for (const C of [ErreurDecision, ErreurConflit, ErreurAcces, ErreurSession])
      expect(cinq).not.toBeInstanceOf(C);
  });
  it('une fonction absente (base pas encore à jour) est une panne, pas une boîte vide', async () => {
    const a = api({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
      status: 404,
    });
    await expect(a.port.resumeMessages()).rejects.toThrow();
    await expect(a.port.messages('a-traiter')).rejects.toThrow();
  });
});
