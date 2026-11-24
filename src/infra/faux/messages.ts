/**
 * Les messages reçus, dans le faux serveur (refonte publique, lot 3B2) : chaque geste, ses refus et ses conflits, comme la base
 * (`supabase/migrations/20261124140200_…`). Le stockage du navigateur est celui de `index.ts`, qui le passe ici.
 *
 * Réglages d'un parcours, dans le stockage du navigateur :
 * - `ntanova-faux-latence` : le délai de réponse, en ms (celui de tout le faux serveur) ;
 * - `ntanova-faux-messages-panne` : `lecture` (une lecture échoue), `geste` (un geste échoue avant d'écrire), `reponse` (le geste
 *   est écrit, sa réponse se perd), `session` (401), `acces` (403). Retirer la clé répare.
 */
import {
  REGLAGES,
  REORIENTATIONS,
  DECISIONS,
  type Contenu,
  type Decision,
  type Nature,
} from '../../modele/demandes';
import { jourDuCongo } from '../../modele/date-declaration';
import type { Valeur } from '../../modele/listes';
import {
  demandeUnMotif,
  effacementSiClos,
  jourNotable,
  libelleCible,
  type AlerteDuMessage,
  type EtapeRetrait,
  type EtatMessage,
  type EtatReponse,
  type EvenementMessage,
  type FileMessages,
  type LigneMessage,
  type MessageOuvert,
  type PortMessages,
  type SuiviRetrait,
  type VersionRecue,
} from '../../modele/messages-recus';
import {
  ErreurAcces,
  ErreurConflit,
  ErreurDecision,
  ErreurIntrouvable,
  ErreurReseau,
  ErreurSession,
} from '../../modele/ports';

type RetraitFaux = Omit<SuiviRetrait, 'etape'>;

export interface MessageFaux {
  rang: number;
  reference: string;
  nature: Nature;
  etat: EtatMessage;
  version: number;
  recuLe: string;
  ouvertLe: string | null;
  limiteLe: string | null;
  ficheId: string | null;
  decision: Decision | null;
  motif: string | null;
  decideLe: string | null;
  canal: Valeur<'public_request_reply'>;
  reponse: EtatReponse;
  reponduLe: string | null;
  indesirableDepuis: string | null;
  closLe: string | null;
  suiteDe: string | null;
  reorienteDe: string | null;
  versions: VersionRecue[];
  evenements: EvenementMessage[];
  alerte: AlerteDuMessage | null;
  retrait: RetraitFaux | null;
  /** Un message venu d'un formulaire (lot 3C) : la clé de son envoi (la vraie base n'en garde que l'empreinte) et ses bornes. */
  envoi?: { cle: string; ecritures: number; suites: number };
}

export interface EtatDesMessages {
  messages: MessageFaux[];
  dernierPassageAlertesLe: string | null;
  dernierPassagePurgeLe: string | null;
  plafondAtteintLe: string | null;
}

/** Ce que les messages demandent au reste du faux serveur : les fiches, et ce qu'elles montrent au public. */
export interface DependancesMessages {
  reseau(): Promise<void>;
  /** L'état gardé d'un chargement à l'autre, et la panne jouée par un parcours. */
  garde(): string | null;
  garder(etat: string): void;
  panne(): string | null;
  estAdmin(): boolean;
  ecole(id: string): {
    nom: string;
    publication: Valeur<'publication'>;
    contactPublic: boolean;
    numeroEnseigne: boolean;
  } | null;
  /** La photo appartient à cette fiche. */
  photoDeLEcole(ecoleId: string, photoId: string): boolean;
  /** La photo paraît, ou paraîtrait à la prochaine construction. */
  photoPublique(photoId: string): boolean;
  /** L'état de départ, quand un scénario en pose un. */
  depart(): EtatDesMessages | null;
}

export const ETAT_VIDE: EtatDesMessages = {
  messages: [],
  dernierPassageAlertesLe: null,
  dernierPassagePurgeLe: null,
  plafondAtteintLe: null,
};

export const retraitVide = (): RetraitFaux => ({
  issue: null,
  verification: null,
  verificationNote: null,
  verifieLe: null,
  cibles: null,
  cibleEcoleId: null,
  ciblePhotoId: null,
  retireLe: null,
  miseEnLigneLe: null,
  execution: null,
  productionLe: null,
  essaiLe: null,
  constateLe: null,
});

/** L'étape d'un retrait, déduite de ce qui est noté (`prive.removal_step`). */
function etapeDe(m: MessageFaux): EtapeRetrait | null {
  const r = m.retrait;
  if (m.nature !== 'retrait' || r === null) return null;
  if (m.etat === 'close') return 'close';
  if (r.issue === null) return 'verifier';
  if (r.issue === 'concernee' && r.retireLe === null) return 'retirer';
  if (r.issue === 'concernee' && r.miseEnLigneLe === null) return 'mettre_en_ligne';
  if (r.issue === 'concernee' && r.constateLe === null) return 'constater';
  return m.reponse === 'a_faire' ? 'prevenir' : 'clore';
}

function effaceLe(m: MessageFaux): string | null {
  if (m.etat === 'close' && m.closLe) return effacementSiClos(jourDuCongo(new Date(m.closLe)));
  if (m.etat === 'indesirable' && m.indesirableDepuis) {
    return jourDuCongo(
      new Date(Date.parse(m.indesirableDepuis) + REGLAGES.indesirableJours * 86_400_000),
    );
  }
  return null;
}

const dansLaFile: Record<FileMessages, (m: MessageFaux) => boolean> = {
  'a-traiter': (m) => m.nature !== 'retrait' && (m.etat === 'recue' || m.etat === 'ouverte'),
  'en-attente': (m) => m.nature !== 'retrait' && m.etat === 'en_attente',
  clos: (m) => m.nature !== 'retrait' && m.etat === 'close',
  indesirables: (m) => m.etat === 'indesirable',
  retraits: (m) => m.nature === 'retrait' && ['recue', 'ouverte', 'en_attente'].includes(m.etat),
  'retraits-clos': (m) => m.nature === 'retrait' && m.etat === 'close',
  alertes: (m) =>
    m.alerte !== null &&
    (m.alerte.etat === 'abandonnee' || (m.alerte.etat !== 'envoyee' && m.alerte.erreur !== null)),
};

const SIGNES = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function nouvelleReference(nature: Nature): string {
  const signes = Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (o) => SIGNES[o & 31] as string,
  ).join('');
  const lettre = nature === 'contact' ? 'C' : nature === 'retrait' ? 'R' : 'A';
  return `${lettre}-${signes.slice(0, 4)}-${signes.slice(4)}`;
}

export function creerMessagesFaux(d: DependancesMessages): PortMessages {
  const lire = (): EtatDesMessages => {
    const garde = d.garde();
    if (garde) return { ...ETAT_VIDE, ...(JSON.parse(garde) as Partial<EtatDesMessages>) };
    const depart = d.depart();
    if (depart) d.garder(JSON.stringify(depart));
    return depart ?? ETAT_VIDE;
  };
  const ecrire = (e: EtatDesMessages) => d.garder(JSON.stringify(e));
  const panne = () => d.panne();

  const entrer = async () => {
    await d.reseau();
    if (panne() === 'session') throw new ErreurSession('session');
    // Comme la base : l'accès se vérifie à chaque appel, pas seulement à l'arrivée.
    if (panne() === 'acces' || !d.estAdmin()) throw new ErreurAcces('Réservé à l’administration.');
  };
  const lecture = async (): Promise<EtatDesMessages> => {
    await entrer();
    if (panne() === 'lecture') throw new Error('503 : service indisponible');
    return lire();
  };
  const noter = (m: MessageFaux, quoi: string, detail: string | null = null) =>
    m.evenements.push({ quoi, detail, le: new Date().toISOString() });

  /** Un geste : la version lue, un état attendu, puis l'écriture en une fois. Un refus n'écrit rien. */
  async function geste<T>(
    reference: string,
    version: number,
    etats: EtatMessage[],
    agir: (m: MessageFaux, e: EtatDesMessages) => T,
  ): Promise<T> {
    await entrer();
    if (panne() === 'geste') throw new ErreurReseau('hors ligne');
    const e = lire();
    const m = e.messages.find((x) => x.reference === reference.trim().toUpperCase());
    if (!m) throw new ErreurIntrouvable('Message introuvable : il a peut-être été effacé.');
    if (m.version !== version) throw new ErreurConflit('Ce message a changé entre-temps.');
    if (!etats.includes(m.etat)) {
      throw new ErreurDecision('Ce geste n’est pas possible dans cet état.');
    }
    const rendu = agir(m, e);
    m.version += 1;
    ecrire(e);
    // La réponse se perd après l'écriture : l'écran ne sait pas, et ne doit rien affirmer.
    if (panne() === 'reponse') throw new ErreurReseau('délai dépassé');
    return rendu;
  }
  const etape = (m: MessageFaux, attendue: EtapeRetrait): RetraitFaux => {
    if (m.nature !== 'retrait' || m.retrait === null) {
      throw new ErreurDecision('Ce n’est pas une demande de retrait.');
    }
    if (etapeDe(m) !== attendue) throw new ErreurDecision('Cette étape n’est pas la prochaine.');
    return m.retrait;
  };
  const courante = (m: MessageFaux): Contenu => m.versions.find((v) => v.courante)?.contenu ?? {};

  const ligne = (m: MessageFaux): LigneMessage => {
    const c = courante(m);
    const mot = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      rang: m.rang,
      reference: m.reference,
      nature: m.nature,
      etat: m.etat,
      version: m.version,
      recuLe: m.recuLe,
      ouvert: m.ouvertLe !== null,
      sujet: mot(c.sujet) as LigneMessage['sujet'],
      information: mot(c.information) as LigneMessage['information'],
      aRetirer: mot(c.aRetirer) as LigneMessage['aRetirer'],
      nomEcole: mot(c.nomEcole),
      ville: mot(c.ville),
      fiche: m.ficheId ? (d.ecole(m.ficheId)?.nom ?? null) : null,
      versions: m.versions.length,
      suiteDe: m.suiteDe,
      reorienteDe: m.reorienteDe,
      decision: m.decision,
      canal: m.canal,
      reponse: m.reponse,
      limiteLe: m.limiteLe,
      alerte: m.alerte?.etat ?? null,
      erreurAlerte: m.alerte?.erreur ?? null,
      etapeRetrait: etapeDe(m),
      retireLe: m.retrait?.retireLe ?? null,
      closLe: m.closLe,
      effaceLe: effaceLe(m),
    };
  };
  const ouvert = (m: MessageFaux, e: EtatDesMessages): MessageOuvert => {
    const ecole = m.ficheId ? d.ecole(m.ficheId) : null;
    const pas = etapeDe(m);
    return {
      reference: m.reference,
      nature: m.nature,
      etat: m.etat,
      version: m.version,
      recuLe: m.recuLe,
      ouvertLe: m.ouvertLe,
      limiteLe: m.limiteLe,
      fiche:
        m.ficheId && ecole
          ? { id: m.ficheId, nom: ecole.nom, publication: ecole.publication }
          : null,
      decision: m.decision,
      motif: m.motif,
      decideLe: m.decideLe,
      canal: m.canal,
      reponse: m.reponse,
      reponduLe: m.reponduLe,
      indesirableDepuis: m.indesirableDepuis,
      closLe: m.closLe,
      effaceLe: effaceLe(m),
      suiteDe: m.suiteDe,
      suites: e.messages.filter((x) => x.suiteDe === m.reference).map((x) => x.reference),
      reorienteDe: m.reorienteDe,
      reorienteVers: e.messages
        .filter((x) => x.reorienteDe === m.reference)
        .map((x) => x.reference),
      versions: [...m.versions].sort((a, b) => a.revision - b.revision),
      evenements: m.evenements,
      alerte: m.alerte,
      retrait: m.retrait && pas ? { ...m.retrait, etape: pas } : null,
    };
  };

  /** Ce que les cibles montrent encore au public, dans les mots de la base. */
  const encorePublic = (r: RetraitFaux): string[] => {
    const ecole = r.cibleEcoleId ? d.ecole(r.cibleEcoleId) : null;
    const publiee = ecole?.publication === 'publiee';
    const cibles = r.cibles ?? [];
    return [
      cibles.includes('contact_public') && publiee && ecole.contactPublic && 'le contact public',
      cibles.includes('fiche') && publiee && 'la fiche',
      cibles.includes('photo') && r.ciblePhotoId && d.photoPublique(r.ciblePhotoId) && 'la photo',
      cibles.includes('numero_enseigne') &&
        publiee &&
        ecole.numeroEnseigne &&
        'le numéro de l’enseigne',
    ].filter((x): x is string => typeof x === 'string');
  };

  return {
    async resumeMessages() {
      const e = await lecture();
      const compter = (f: FileMessages) => e.messages.filter(dansLaFile[f]).length;
      const alertes = e.messages.flatMap((m) => (m.alerte ? [m.alerte] : []));
      const attendent = alertes.filter((a) => a.etat === 'a_envoyer' || a.etat === 'en_cours');
      const retraitsAFaire = e.messages
        .filter((m) => dansLaFile.retraits(m) && m.retrait?.retireLe === null)
        .filter((m) => m.retrait?.issue !== 'impossible' && m.retrait?.issue !== 'reorientee')
        .map((m) => m.recuLe)
        .sort();
      const maintenant = Date.now();
      return {
        aTraiter: compter('a-traiter'),
        nouveaux: e.messages.filter((m) => m.etat === 'recue').length,
        enAttente: compter('en-attente'),
        clos: compter('clos'),
        retraits: compter('retraits'),
        retraitsClos: compter('retraits-clos'),
        indesirables: compter('indesirables'),
        limiteAtteinte: e.messages.filter(
          (m) => m.limiteLe !== null && ['recue', 'ouverte', 'en_attente'].includes(m.etat),
        ).length,
        plusAncienRetraitLe: retraitsAFaire[0] ?? null,
        alertesEnAttente: attendent.length,
        alertesEnEchec: attendent.filter((a) => a.erreur !== null).length,
        alertesAbandonnees: alertes.filter((a) => a.etat === 'abandonnee').length,
        dernierPassageAlertesLe: e.dernierPassageAlertesLe,
        dernierPassagePurgeLe: e.dernierPassagePurgeLe,
        enRetardDEffacement: e.messages.filter((m) => {
          const le = effaceLe(m);
          return le !== null && le <= jourDuCongo(new Date(maintenant));
        }).length,
        plafondAtteintLe: e.plafondAtteintLe,
      };
    },
    async messages(file, options = {}) {
      const e = await lecture();
      return e.messages
        .filter(dansLaFile[file])
        .filter((m) => !options.nature || m.nature === options.nature)
        .filter((m) => options.avant == null || m.rang < options.avant)
        .sort((a, b) => b.rang - a.rang)
        .slice(0, options.nombre ?? 30)
        .map(ligne);
    },
    async ouvrirMessage(reference) {
      const e = await lecture();
      const m = e.messages.find((x) => x.reference === reference.trim().toUpperCase());
      if (!m) throw new ErreurIntrouvable('Message introuvable : il a peut-être été effacé.');
      if (m.ouvertLe === null || m.etat === 'recue') {
        m.ouvertLe ??= new Date().toISOString();
        if (m.etat === 'recue') m.etat = 'ouverte';
        m.version += 1;
        noter(m, 'ouverte');
        ecrire(e);
      }
      return ouvert(m, e);
    },
    async rattacherMessage(reference, version, ecoleId) {
      await geste(reference, version, ['recue', 'ouverte', 'en_attente'], (m) => {
        if (m.ouvertLe === null) throw new ErreurDecision('Ouvre d’abord cette demande.');
        if (m.nature === 'contact') {
          throw new ErreurDecision(
            'Un message ne se rattache pas à une fiche : passe-le d’abord dans la bonne file.',
          );
        }
        if (ecoleId !== null && !d.ecole(ecoleId)) {
          throw new ErreurIntrouvable('Cette fiche n’existe pas.');
        }
        m.ficheId = ecoleId;
        noter(m, ecoleId === null ? 'detachee' : 'rattachee');
      });
    },
    async deciderMessage(reference, version, decision, motif) {
      await geste(reference, version, ['ouverte'], (m) => {
        if (!DECISIONS[m.nature].includes(decision)) {
          throw new ErreurDecision('Cette décision n’existe pas pour cette demande.');
        }
        if (m.decision === 'a_l_annuaire' || m.decision === 'au_retrait') {
          throw new ErreurDecision('Ce message est déjà passé dans une autre file.');
        }
        const note = motif?.trim() || null;
        if (note !== null && (!demandeUnMotif(decision) || [...note].length > 300)) {
          throw new ErreurDecision(
            'Un motif va avec « non retenue » ou « introuvable », en 300 caractères au plus.',
          );
        }
        m.decision = decision;
        m.motif = note;
        m.decideLe = new Date().toISOString();
        if (decision === 'indesirable') {
          m.etat = 'indesirable';
          m.indesirableDepuis = new Date().toISOString();
        }
        noter(m, decision === 'indesirable' ? 'indesirable' : 'decidee', decision);
      });
    },
    async reorienterMessage(reference, version, vers) {
      return geste(reference, version, ['ouverte'], (m, e) => {
        if (!REORIENTATIONS[m.nature].includes(vers)) {
          throw new ErreurDecision('Cette demande ne passe pas dans cette file.');
        }
        if (m.decision !== null) throw new ErreurDecision('Cette demande est déjà décidée.');
        if (vers === 'retrait' && m.canal === 'non') {
          throw new ErreurDecision(
            'Un retrait demande de pouvoir répondre : cette personne n’a laissé aucune coordonnée.',
          );
        }
        if (m.retrait && m.retrait.issue !== null) {
          throw new ErreurDecision('Ce retrait est déjà commencé.');
        }
        const maintenant = new Date().toISOString();
        const contenu: Contenu = { ...courante(m) };
        delete contenu.fiche;
        delete contenu.aRetirer;
        delete contenu.sujet;
        if (m.ficheId) contenu.fiche = m.ficheId;
        const nouvelle: MessageFaux = {
          rang: Math.max(0, ...e.messages.map((x) => x.rang)) + 1,
          reference: nouvelleReference(vers),
          nature: vers,
          etat: 'ouverte',
          version: 1,
          recuLe: maintenant,
          ouvertLe: maintenant,
          limiteLe: null,
          ficheId: m.ficheId,
          decision: null,
          motif: null,
          decideLe: null,
          canal: m.canal,
          reponse: m.canal === 'non' ? 'non_demandee' : 'a_faire',
          reponduLe: null,
          indesirableDepuis: null,
          closLe: null,
          suiteDe: null,
          reorienteDe: m.reference,
          versions: [{ revision: 1, contenu, tardive: false, courante: true, recueLe: maintenant }],
          evenements: [{ quoi: 'recue', detail: null, le: maintenant }],
          alerte: null,
          retrait: vers === 'retrait' ? retraitVide() : null,
        };
        e.messages.push(nouvelle);
        m.decision =
          m.nature === 'retrait'
            ? 'reorientee'
            : vers === 'retrait'
              ? 'au_retrait'
              : 'a_l_annuaire';
        m.decideLe = maintenant;
        if (m.retrait) {
          m.retrait.issue = 'reorientee';
          m.retrait.verifieLe = maintenant;
        }
        noter(m, 'reorientee', nouvelle.reference);
        return nouvelle.reference;
      });
    },
    async restaurerMessage(reference, version) {
      await geste(reference, version, ['indesirable'], (m) => {
        m.etat = 'recue';
        m.indesirableDepuis = null;
        m.decision = null;
        m.motif = null;
        m.decideLe = null;
        noter(m, 'pas_indesirable');
      });
    },
    async mettreEnAttente(reference, version, enAttente) {
      await geste(reference, version, [enAttente ? 'ouverte' : 'en_attente'], (m) => {
        m.etat = enAttente ? 'en_attente' : 'ouverte';
        noter(m, enAttente ? 'en_attente' : 'reprise');
      });
    },
    async noterReponse(reference, version, issue, le) {
      await geste(reference, version, ['ouverte', 'en_attente'], (m) => {
        if (m.reponse === 'non_demandee') {
          throw new ErreurDecision('Cette personne n’a pas demandé de réponse.');
        }
        if (m.decision === null) {
          throw new ErreurDecision('Décide d’abord : la réponse vient après.');
        }
        if (issue === 'faite' && (le === null || !jourNotable(le, jourDuCongo()))) {
          throw new ErreurDecision('Donne le jour réel où la réponse est partie.');
        }
        m.reponse = issue;
        m.reponduLe = issue === 'faite' ? le : null;
        noter(m, `reponse_${issue}`, m.canal);
      });
    },
    async cloreMessage(reference, version) {
      return geste(reference, version, ['ouverte'], (m) => {
        if (m.decision === null) throw new ErreurDecision('Cette demande n’est pas décidée.');
        if (m.reponse === 'a_faire') throw new ErreurDecision('La réponse est encore à faire.');
        m.etat = 'close';
        m.closLe = new Date().toISOString();
        noter(m, 'close');
        return effaceLe(m) ?? '';
      });
    },
    async rouvrirMessage(reference, version) {
      await geste(reference, version, ['close'], (m) => {
        m.etat = 'ouverte';
        m.closLe = null;
        if (m.nature === 'retrait' && m.retrait) {
          const concernee = m.retrait.issue === 'concernee';
          m.retrait = {
            ...m.retrait,
            ...(concernee
              ? {}
              : { issue: null, verification: null, verificationNote: null, verifieLe: null }),
            retireLe: null,
            miseEnLigneLe: null,
            execution: null,
            productionLe: null,
            essaiLe: null,
            constateLe: null,
          };
          m.decision = null;
          m.decideLe = null;
          m.reponse = 'a_faire';
          m.reponduLe = null;
        }
        noter(m, 'rouverte');
      });
    },
    async relancerAlerte(reference) {
      await entrer();
      if (panne() === 'geste') throw new ErreurReseau('hors ligne');
      const e = lire();
      const m = e.messages.find((x) => x.reference === reference);
      const relancable =
        m?.alerte &&
        (m.alerte.etat === 'abandonnee' ||
          (m.alerte.etat === 'a_envoyer' && m.alerte.erreur !== null));
      if (!m?.alerte || !relancable) {
        throw new ErreurDecision('Aucune annonce en échec pour ce message.');
      }
      m.alerte.etat = 'a_envoyer';
      m.alerte.prochainEssaiLe = new Date().toISOString();
      noter(m, 'annonce_relancee');
      ecrire(e);
    },
    async verifierRetrait(reference, version, comment, note) {
      await geste(reference, version, ['ouverte'], (m) => {
        const r = etape(m, 'verifier');
        const propre = note?.trim() || null;
        if ((comment === 'autre') !== (propre !== null) || [...(propre ?? '')].length > 160) {
          throw new ErreurDecision(
            'Une autre vérification se note en une ligne (160 caractères) ; les deux premières n’en ont pas besoin.',
          );
        }
        if (comment === 'numero' && courante(m).aRetirer === 'fiche') {
          throw new ErreurDecision(
            'Pour la fiche entière, un numéro ne suffit pas : la direction confirme.',
          );
        }
        r.issue = 'concernee';
        r.verification = comment;
        r.verificationNote = propre;
        r.verifieLe = new Date().toISOString();
        noter(m, 'retrait_verifie', comment);
      });
    },
    async retraitImpossible(reference, version) {
      await geste(reference, version, ['ouverte'], (m) => {
        const r = etape(m, 'verifier');
        r.issue = 'impossible';
        r.verifieLe = new Date().toISOString();
        m.decision = 'impossible_a_verifier';
        m.decideLe = r.verifieLe;
        noter(m, 'retrait_impossible');
      });
    },
    async ciblerRetrait(reference, version, cibles, ecoleId, photoId) {
      await geste(reference, version, ['ouverte'], (m) => {
        const r = etape(m, 'retirer');
        if (cibles.length === 0 || cibles.some((c) => !(c in libelleCible))) {
          throw new ErreurDecision('Désigne ce qui est à retirer.');
        }
        if (cibles.some((c) => c !== 'texte') && (ecoleId === null || !d.ecole(ecoleId))) {
          throw new ErreurDecision('Désigne la fiche concernée.');
        }
        if (
          cibles.includes('photo') !== (photoId !== null) ||
          (photoId !== null && (ecoleId === null || !d.photoDeLEcole(ecoleId, photoId)))
        ) {
          throw new ErreurDecision('Désigne la photo de cette fiche.');
        }
        r.cibles = [...new Set(cibles)].sort();
        r.cibleEcoleId = ecoleId;
        r.ciblePhotoId = photoId;
        m.ficheId ??= ecoleId;
        noter(m, 'retrait_cible', r.cibles.join(','));
      });
    },
    async noterRetire(reference, version) {
      await geste(reference, version, ['ouverte'], (m) => {
        const r = etape(m, 'retirer');
        if (r.cibles === null) throw new ErreurDecision('Désigne d’abord ce qui est à retirer.');
        const reste = encorePublic(r);
        if (reste.length > 0) {
          throw new ErreurDecision(
            `Encore publié : ${reste.join(', ')}. Retire-le dans Écoles, puis reviens.`,
          );
        }
        r.retireLe = new Date().toISOString();
        noter(m, 'retrait_base');
      });
    },
    async noterMiseEnLigne(reference, version, execution) {
      await geste(reference, version, ['ouverte'], (m) => {
        const r = etape(m, 'mettre_en_ligne');
        const numero = execution?.trim() || null;
        if (numero !== null && !/^\d{1,20}$/.test(numero)) {
          throw new ErreurDecision('Le numéro d’exécution est une suite de chiffres.');
        }
        r.miseEnLigneLe = new Date().toISOString();
        r.execution = numero;
        noter(m, 'retrait_mise_en_ligne');
      });
    },
    async noterConstat(reference, version, productionLe, essaiLe) {
      await geste(reference, version, ['ouverte'], (m) => {
        const r = etape(m, 'constater');
        const depuis = jourDuCongo(new Date(r.miseEnLigneLe ?? Date.now()));
        const bon = (j: string) => jourNotable(j, jourDuCongo(), depuis);
        if (!bon(productionLe) || !bon(essaiLe)) {
          throw new ErreurDecision(
            'Donne le jour du constat sur ntanova.com ET sur essai.ntanova.com, depuis la mise en ligne demandée.',
          );
        }
        r.productionLe = productionLe;
        r.essaiLe = essaiLe;
        r.constateLe = new Date().toISOString();
        m.decision = 'retiree';
        m.decideLe = r.constateLe;
        noter(m, 'retrait_constate');
      });
    },
  };
}
