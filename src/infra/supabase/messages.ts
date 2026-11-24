/**
 * Les messages reçus, branchés sur Supabase (refonte publique, lot 3B2) : le seul endroit qui connaît les noms de la base
 * (`public_requests`…) et ses codes. Les écrans ne voient que `PortMessages`.
 *
 * Aucun texte d'une personne ne passe dans une erreur : la base écrit des messages neutres, et seuls ceux-là sont repris.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CHAMPS, type Contenu, type Decision, type Nature, type NomDeChamp } from '../../modele/demandes';
import { listes, type Liste, type Valeur } from '../../modele/listes';
import type {
  EtapeRetrait,
  FileMessages,
  LigneMessage,
  MessageOuvert,
  PortMessages,
  ResumeMessages,
  SuiviRetrait,
} from '../../modele/messages-recus';
import {
  ErreurAcces,
  ErreurConflit,
  ErreurDecision,
  ErreurIntrouvable,
  ErreurSession,
} from '../../modele/ports';
import { avecDelai, traduire, type ErreurApi } from './erreurs';

/** Une lecture ou un geste qui ne répond pas : au-delà, on ne sait pas s'il est enregistré, et l'écran le dit. */
export const DELAI_MS = 15_000;

/** Le nom de chaque champ dans la base. */
const CHAMP: Record<NomDeChamp, string> = {
  origine: 'origin',
  sujet: 'subject',
  message: 'message',
  nomEcole: 'school_name',
  ville: 'town',
  repere: 'landmark',
  autreChose: 'other_details',
  niveaux: 'levels',
  deLEcole: 'is_from_school',
  fiche: 'campus_id',
  information: 'topic',
  correction: 'correction',
  source: 'knowledge',
  aRetirer: 'removal',
  precision: 'removal_details',
  reponse: 'reply',
  coordonnee: 'contact',
  nomPersonne: 'person_name',
};

const FILE: Record<FileMessages, string> = {
  'a-traiter': 'a_traiter',
  'en-attente': 'en_attente',
  clos: 'closes',
  retraits: 'retraits',
  'retraits-clos': 'retraits_clos',
  indesirables: 'indesirables',
  alertes: 'alertes',
};

/**
 * Les refus de la base, dans les termes du port. `PT409` d'abord : un 409 n'est pas ici un « déjà reçu ». Une réponse dont on
 * ne sait rien (réseau, délai, 5xx) n'affirme jamais que rien n'est enregistré.
 */
export function refuser(erreur: ErreurApi | null): void {
  if (erreur === null) return;
  if (erreur.code === 'PT409') throw new ErreurConflit('Ce message a changé entre-temps.');
  if (erreur.code === '42501') throw new ErreurAcces('Réservé à l’administration.');
  // `P0002` reste lu : c'est le code d'une fiche inconnue. Un message effacé arrive en `PT404` (P0002 sort en 500 illisible).
  if (erreur.code === 'PT404' || erreur.code === 'P0002') throw new ErreurIntrouvable(erreur.message ?? 'Message introuvable.');
  if (erreur.code === '22023') throw new ErreurDecision(erreur.message ?? 'Geste refusé.');
  if (erreur.code === 'PGRST301' || erreur.code === 'PGRST303' || erreur.status === 401) {
    throw new ErreurSession('session');
  }
  // Une contrainte (23xxx) capturée par personne : son texte peut porter une ligne de la base, il ne sort pas d'ici.
  if (/^23/.test(erreur.code ?? '')) throw new ErreurDecision('La base refuse ce geste.');
  traduire({ ...erreur, status: erreur.status === 409 ? undefined : erreur.status });
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const nombre = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const texteOuErreur = (v: unknown, quoi: string): string => {
  const t = texte(v);
  if (t === null) throw new Error(`Réponse illisible : ${quoi}`);
  return t;
};
function dans<L extends Liste>(liste: L, v: unknown): Valeur<L> | null {
  return typeof v === 'string' && (listes[liste] as readonly string[]).includes(v)
    ? (v as Valeur<L>)
    : null;
}
function dansOuErreur<L extends Liste>(liste: L, v: unknown): Valeur<L> {
  const lu = dans(liste, v);
  if (lu === null) throw new Error(`Réponse illisible : ${liste}`);
  return lu;
}
const etape = (v: unknown): EtapeRetrait | null =>
  ['verifier', 'retirer', 'mettre_en_ligne', 'constater', 'prevenir', 'clore', 'close'].includes(
    String(v),
  )
    ? (v as EtapeRetrait)
    : null;
const objet = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Ce que la personne a écrit, champ par champ. Un champ que cette version ne connaît pas est laissé de côté. */
export function lireContenu(brut: unknown): Contenu {
  const o = objet(brut);
  const contenu: Contenu = {};
  for (const { nom } of CHAMPS) {
    const v = o[CHAMP[nom]];
    if (typeof v === 'string' || typeof v === 'boolean') contenu[nom] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) contenu[nom] = v as string[];
  }
  return contenu;
}

export function lireLigne(brut: unknown): LigneMessage {
  const l = objet(brut);
  return {
    rang: nombre(l.row_id),
    reference: texteOuErreur(l.reference, 'référence'),
    nature: dansOuErreur('public_request_kind', l.kind),
    etat: dansOuErreur('public_request_state', l.state),
    version: nombre(l.row_version),
    recuLe: texteOuErreur(l.received_at, 'date'),
    ouvert: l.opened === true,
    sujet: dans('public_request_subject', l.subject),
    information: dans('public_request_topic', l.topic),
    aRetirer: dans('public_request_removal', l.removal),
    nomEcole: texte(l.school_name),
    ville: texte(l.town),
    fiche: texte(l.campus_name),
    versions: nombre(l.versions),
    suiteDe: texte(l.follows),
    reorienteDe: texte(l.redirected_from),
    decision: dans('public_request_decision', l.decision),
    canal: dansOuErreur('public_request_reply', l.reply_channel),
    reponse: dansOuErreur('public_request_reply_state', l.reply_state),
    limiteLe: texte(l.limit_reached_at),
    alerte: dans('public_notice_state', l.notice_state),
    erreurAlerte: dans('public_notice_error', l.notice_error),
    etapeRetrait: etape(l.removal_step),
    retireLe: texte(l.removed_at),
    closLe: texte(l.closed_at),
    effaceLe: texte(l.purge_on),
  };
}

function lireRetrait(brut: unknown): SuiviRetrait | null {
  if (brut === null || brut === undefined) return null;
  const r = objet(brut);
  const issue = texte(r.outcome);
  const pas = etape(r.step);
  if (pas === null) throw new Error('Réponse illisible : étape');
  return {
    etape: pas,
    issue: issue === 'concernee' || issue === 'impossible' || issue === 'reorientee' ? issue : null,
    verification: dans('public_removal_check', r.check_kind),
    verificationNote: texte(r.check_note),
    verifieLe: texte(r.checked_at),
    cibles: Array.isArray(r.targets)
      ? r.targets.flatMap((c) => dans('public_removal_target', c) ?? [])
      : null,
    cibleEcoleId: texte(r.target_campus_id),
    ciblePhotoId: texte(r.target_photo_id),
    retireLe: texte(r.removed_at),
    miseEnLigneLe: texte(r.publish_requested_at),
    execution: texte(r.publish_run),
    productionLe: texte(r.production_seen_on),
    essaiLe: texte(r.essai_seen_on),
    constateLe: texte(r.seen_at),
  };
}

export function lireMessage(brut: unknown): MessageOuvert {
  const d = objet(brut);
  const fiche = d.campus ? objet(d.campus) : null;
  const alerte = d.notice ? objet(d.notice) : null;
  return {
    reference: texteOuErreur(d.reference, 'référence'),
    nature: dansOuErreur('public_request_kind', d.kind),
    etat: dansOuErreur('public_request_state', d.state),
    version: nombre(d.row_version),
    recuLe: texteOuErreur(d.received_at, 'date'),
    ouvertLe: texte(d.opened_at),
    limiteLe: texte(d.limit_reached_at),
    fiche: fiche
      ? {
          id: texteOuErreur(fiche.id, 'fiche'),
          nom: texte(fiche.name) ?? 'École sans nom',
          publication: dans('publication', fiche.publication) ?? 'brouillon',
        }
      : null,
    decision: dans('public_request_decision', d.decision),
    motif: texte(d.decision_note),
    decideLe: texte(d.decided_at),
    canal: dansOuErreur('public_request_reply', d.reply_channel),
    reponse: dansOuErreur('public_request_reply_state', d.reply_state),
    reponduLe: texte(d.replied_on),
    indesirableDepuis: texte(d.spam_since),
    closLe: texte(d.closed_at),
    effaceLe: texte(d.purge_on),
    suiteDe: texte(d.follows),
    suites: tableau(d.followed_by).flatMap((r) => texte(r) ?? []),
    reorienteDe: texte(d.redirected_from),
    reorienteVers: tableau(d.redirected_to).flatMap((r) => texte(r) ?? []),
    versions: tableau(d.versions).map((v) => {
      const o = objet(v);
      return {
        revision: nombre(o.revision),
        contenu: lireContenu(o.content),
        tardive: o.late === true,
        courante: o.current === true,
        recueLe: texteOuErreur(o.received_at, 'date'),
      };
    }),
    evenements: tableau(d.events).map((e) => {
      const o = objet(e);
      return {
        quoi: texteOuErreur(o.what, 'événement'),
        detail: texte(o.detail),
        le: texteOuErreur(o.at, 'date'),
      };
    }),
    alerte: alerte
      ? {
          etat: dansOuErreur('public_notice_state', alerte.state),
          essais: nombre(alerte.attempts),
          prochainEssaiLe: texte(alerte.next_attempt_at),
          erreur: dans('public_notice_error', alerte.last_error),
          envoyeeLe: texte(alerte.sent_at),
        }
      : null,
    retrait: lireRetrait(d.removal),
  };
}

export function lireResume(brut: unknown): ResumeMessages {
  const r = objet(brut);
  // Une réponse vide n'est pas « rien n'attend » : on refuse de la lire.
  if (typeof r.to_handle !== 'number') throw new Error('Réponse illisible : résumé');
  return {
    aTraiter: nombre(r.to_handle),
    nouveaux: nombre(r.new),
    enAttente: nombre(r.waiting),
    clos: nombre(r.closed),
    retraits: nombre(r.removals),
    retraitsClos: nombre(r.removals_closed),
    indesirables: nombre(r.spam),
    limiteAtteinte: nombre(r.limit_reached),
    plusAncienRetraitLe: texte(r.oldest_removal_at),
    alertesEnAttente: nombre(r.notices_waiting),
    alertesEnEchec: nombre(r.notices_failing),
    alertesAbandonnees: nombre(r.notices_abandoned),
    dernierPassageAlertesLe: texte(r.notices_last_run_at),
    dernierPassagePurgeLe: texte(r.purge_last_run_at),
    enRetardDEffacement: nombre(r.overdue),
    plafondAtteintLe: texte(r.daily_cap_reached_at),
  };
}

export function creerGestesDesMessages(
  supabase: () => SupabaseClient,
  delaiMs: number = DELAI_MS,
): PortMessages {
  /** Un appel borné, ses refus traduits. Un geste sans réponse lève `ErreurReseau` : ni « enregistré », ni « pas enregistré ». */
  const appeler = async (
    operation: PromiseLike<{ data: unknown; error: ErreurApi | null; status?: number }>,
  ): Promise<unknown> => {
    const { data, error, status } = await avecDelai(operation, delaiMs);
    // PostgREST rend le code HTTP à côté de l'erreur : sans lui, un 401 du portail passerait pour une panne.
    refuser(error ? { ...error, status: error.status ?? status } : null);
    return data;
  };
  const verifie = (reference: unknown): string => texteOuErreur(reference, 'référence');

  return {
    async resumeMessages() {
      return lireResume(await appeler(supabase().rpc('public_request_overview')));
    },
    async messages(file, options = {}) {
      const data = await appeler(
        supabase().rpc('list_public_requests', {
          p_tab: FILE[file],
          p_limit: options.nombre ?? 30,
          p_before: options.avant ?? null,
          p_kind: options.nature ?? null,
        }),
      );
      if (!Array.isArray(data)) throw new Error('Réponse illisible : liste');
      return data.map(lireLigne);
    },
    async ouvrirMessage(reference) {
      return lireMessage(
        await appeler(supabase().rpc('open_public_request', { p_reference: reference })),
      );
    },
    async rattacherMessage(reference, version, ecoleId) {
      await appeler(
        supabase().rpc('attach_public_request', {
          p_reference: reference,
          p_version: version,
          p_campus: ecoleId,
        }),
      );
    },
    async deciderMessage(reference, version, decision: Decision, motif) {
      await appeler(
        supabase().rpc('decide_public_request', {
          p_reference: reference,
          p_version: version,
          p_decision: decision,
          p_note: motif?.trim() || null,
        }),
      );
    },
    async reorienterMessage(reference, version, vers: Nature) {
      return verifie(
        await appeler(
          supabase().rpc('redirect_public_request', {
            p_reference: reference,
            p_version: version,
            p_kind: vers,
          }),
        ),
      );
    },
    async restaurerMessage(reference, version) {
      await appeler(
        supabase().rpc('restore_public_request', { p_reference: reference, p_version: version }),
      );
    },
    async mettreEnAttente(reference, version, enAttente) {
      await appeler(
        supabase().rpc('set_public_request_waiting', {
          p_reference: reference,
          p_version: version,
          p_waiting: enAttente,
        }),
      );
    },
    async noterReponse(reference, version, issue, le) {
      await appeler(
        supabase().rpc('record_public_request_reply', {
          p_reference: reference,
          p_version: version,
          p_outcome: issue,
          p_replied_on: issue === 'faite' ? le : null,
        }),
      );
    },
    async cloreMessage(reference, version) {
      return verifie(
        await appeler(
          supabase().rpc('close_public_request', { p_reference: reference, p_version: version }),
        ),
      );
    },
    async rouvrirMessage(reference, version) {
      await appeler(
        supabase().rpc('reopen_public_request', { p_reference: reference, p_version: version }),
      );
    },
    async relancerAlerte(reference) {
      await appeler(supabase().rpc('retry_public_request_notice', { p_reference: reference }));
    },
    async verifierRetrait(reference, version, comment, note) {
      await appeler(
        supabase().rpc('verify_removal', {
          p_reference: reference,
          p_version: version,
          p_check: comment,
          p_note: comment === 'autre' ? note?.trim() || null : null,
        }),
      );
    },
    async retraitImpossible(reference, version) {
      await appeler(
        supabase().rpc('fail_removal', { p_reference: reference, p_version: version }),
      );
    },
    async ciblerRetrait(reference, version, cibles, ecoleId, photoId) {
      await appeler(
        supabase().rpc('target_removal', {
          p_reference: reference,
          p_version: version,
          p_targets: cibles,
          p_campus: ecoleId,
          p_photo: cibles.includes('photo') ? photoId : null,
        }),
      );
    },
    async noterRetire(reference, version) {
      await appeler(
        supabase().rpc('record_removal', { p_reference: reference, p_version: version }),
      );
    },
    async noterMiseEnLigne(reference, version, execution) {
      await appeler(
        supabase().rpc('record_removal_publication', {
          p_reference: reference,
          p_version: version,
          p_run: execution?.trim() || null,
        }),
      );
    },
    async noterConstat(reference, version, productionLe, essaiLe) {
      await appeler(
        supabase().rpc('record_removal_seen', {
          p_reference: reference,
          p_version: version,
          p_production_on: productionLe,
          p_essai_on: essaiLe,
        }),
      );
    },
  };
}
