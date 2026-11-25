/**
 * Les messages reçus par Contact et l'annuaire, vus de l'administration (refonte publique, lot 3B2) : ce que l'écran lit, ce
 * qu'il a le droit de proposer, et les mots qu'il emploie. Ce qu'une personne peut écrire est dans `demandes.ts`.
 *
 * Pur : ni réseau, ni écran. La base tranche tout de nouveau ; ces règles servent à ne pas proposer un geste qu'elle refuserait,
 * et à ne jamais dire plus que ce qui a été constaté.
 */
import {
  DECISIONS,
  REGLAGES,
  REORIENTATIONS,
  type Contenu,
  type Decision,
  type Nature,
} from './demandes';
import { listes, type Valeur } from './listes';
import { DELAI_DROITS_JOURS } from './pages-de-confiance';
import { afficherTelephone } from './telephone';
import { lienWhatsApp } from './whatsapp';

// Ce que l'écran lit -------------------------------------------------------------------------------

export type EtatMessage = Valeur<'public_request_state'>;
export type CanalReponse = Valeur<'public_request_reply'>;
export type EtatReponse = Valeur<'public_request_reply_state'>;
export type EtatAlerte = Valeur<'public_notice_state'>;
export type ErreurAlerte = Valeur<'public_notice_error'>;
export type CibleRetrait = Valeur<'public_removal_target'>;
export type VerificationRetrait = Valeur<'public_removal_check'>;

/** Les files, dans les mots de l'adresse (`#demandes/en-attente`). Les deux premiers groupes ont leurs onglets. */
export const FILES = [
  'a-traiter',
  'en-attente',
  'clos',
  'retraits',
  'retraits-clos',
  'indesirables',
  'alertes',
] as const;
export type FileMessages = (typeof FILES)[number];

export const ETAPES_RETRAIT = [
  'verifier',
  'retirer',
  'mettre_en_ligne',
  'constater',
  'prevenir',
  'clore',
] as const;
export type EtapeRetrait = (typeof ETAPES_RETRAIT)[number] | 'close';

/** Les nombres et les dates de toute la boîte : rien d'un message. */
export interface ResumeMessages {
  aTraiter: number;
  nouveaux: number;
  enAttente: number;
  clos: number;
  retraits: number;
  retraitsClos: number;
  indesirables: number;
  limiteAtteinte: number;
  /** Le plus ancien retrait pas encore fait dans la base. */
  plusAncienRetraitLe: string | null;
  alertesEnAttente: number;
  alertesEnEchec: number;
  alertesAbandonnees: number;
  /** Nul : le service n'est jamais passé. Jamais « en marche » sans un passage constaté. */
  dernierPassageAlertesLe: string | null;
  dernierPassagePurgeLe: string | null;
  enRetardDEffacement: number;
  plafondAtteintLe: string | null;
}

/** Une ligne d'une file : ni texte, ni coordonnée. */
export interface LigneMessage {
  /** Pour lire la page suivante. */
  rang: number;
  reference: string;
  nature: Nature;
  etat: EtatMessage;
  version: number;
  recuLe: string;
  ouvert: boolean;
  sujet: Valeur<'public_request_subject'> | null;
  information: Valeur<'public_request_topic'> | null;
  aRetirer: Valeur<'public_request_removal'> | null;
  nomEcole: string | null;
  ville: string | null;
  fiche: string | null;
  versions: number;
  suiteDe: string | null;
  reorienteDe: string | null;
  decision: Decision | null;
  canal: CanalReponse;
  reponse: EtatReponse;
  limiteLe: string | null;
  alerte: EtatAlerte | null;
  erreurAlerte: ErreurAlerte | null;
  etapeRetrait: EtapeRetrait | null;
  retireLe: string | null;
  closLe: string | null;
  effaceLe: string | null;
}

export interface VersionRecue {
  revision: number;
  contenu: Contenu;
  /** Arrivée après une plus récente : gardée, jamais courante. */
  tardive: boolean;
  courante: boolean;
  recueLe: string;
}

export interface EvenementMessage {
  quoi: string;
  detail: string | null;
  le: string;
}

export interface AlerteDuMessage {
  etat: EtatAlerte;
  essais: number;
  prochainEssaiLe: string | null;
  erreur: ErreurAlerte | null;
  envoyeeLe: string | null;
}

export interface SuiviRetrait {
  etape: EtapeRetrait;
  issue: 'concernee' | 'impossible' | 'reorientee' | null;
  verification: VerificationRetrait | null;
  verificationNote: string | null;
  verifieLe: string | null;
  cibles: CibleRetrait[] | null;
  cibleEcoleId: string | null;
  ciblePhotoId: string | null;
  retireLe: string | null;
  miseEnLigneLe: string | null;
  execution: string | null;
  productionLe: string | null;
  essaiLe: string | null;
  constateLe: string | null;
}

/** Un message ouvert : son texte est figé, ce qui arrive ensuite est une suite. */
export interface MessageOuvert {
  reference: string;
  nature: Nature;
  etat: EtatMessage;
  version: number;
  recuLe: string;
  ouvertLe: string | null;
  limiteLe: string | null;
  fiche: { id: string; nom: string; publication: Valeur<'publication'> } | null;
  decision: Decision | null;
  motif: string | null;
  decideLe: string | null;
  canal: CanalReponse;
  reponse: EtatReponse;
  reponduLe: string | null;
  indesirableDepuis: string | null;
  closLe: string | null;
  effaceLe: string | null;
  suiteDe: string | null;
  suites: string[];
  reorienteDe: string | null;
  reorienteVers: string[];
  versions: VersionRecue[];
  evenements: EvenementMessage[];
  alerte: AlerteDuMessage | null;
  retrait: SuiviRetrait | null;
}

/** Ce que l'administration lit et fait d'un message. Chaque geste porte la version lue : si elle a changé, `ErreurConflit`. */
export interface PortMessages {
  /** Les nombres de la boîte. `GET /admin/messages/resume` */
  resumeMessages(): Promise<ResumeMessages>;
  /** Une page d'une file, la plus récente d'abord ; lister n'ouvre rien. `GET /admin/messages?file=…&nature=…&avant=…` */
  messages(
    file: FileMessages,
    options?: { nature?: Nature | null; avant?: number | null; nombre?: number },
  ): Promise<LigneMessage[]>;
  /** Ouvre et fige. `POST /admin/messages/:reference/ouvrir` */
  ouvrirMessage(reference: string): Promise<MessageOuvert>;
  /** Rattache à une fiche, en change ou s'en détache (`null`). Ne décide rien. `PUT /admin/messages/:reference/fiche` */
  rattacherMessage(reference: string, version: number, ecoleId: string | null): Promise<void>;
  /** `POST /admin/messages/:reference/decision` : ne crée, ne corrige et ne publie rien. */
  deciderMessage(
    reference: string,
    version: number,
    decision: Decision,
    motif: string | null,
  ): Promise<void>;
  /** Passe dans une autre file ; rend la référence de la demande reliée. `POST /admin/messages/:reference/reorientation` */
  reorienterMessage(reference: string, version: number, vers: Nature): Promise<string>;
  /** `POST /admin/messages/:reference/indesirable` (annulation) */
  restaurerMessage(reference: string, version: number): Promise<void>;
  /** `PUT /admin/messages/:reference/attente` */
  mettreEnAttente(reference: string, version: number, enAttente: boolean): Promise<void>;
  /** Le jour réel où la réponse est partie, ou qu'elle est impossible. Jamais les échanges. `POST …/reponse` */
  noterReponse(
    reference: string,
    version: number,
    issue: 'faite' | 'impossible',
    le: string | null,
  ): Promise<void>;
  /** `POST /admin/messages/:reference/cloture` ; rend le jour de l'effacement. */
  cloreMessage(reference: string, version: number): Promise<string>;
  /** `DELETE /admin/messages/:reference/cloture` : l'échéance est annulée. */
  rouvrirMessage(reference: string, version: number): Promise<void>;
  /** Avance le prochain essai de l'alerte ; n'envoie rien d'ici et n'ouvre pas le message. `POST …/alerte` */
  relancerAlerte(reference: string): Promise<void>;
  /** Les étapes d'un retrait. `POST /admin/retraits/:reference/…` */
  verifierRetrait(
    reference: string,
    version: number,
    comment: VerificationRetrait,
    note: string | null,
  ): Promise<void>;
  retraitImpossible(reference: string, version: number): Promise<void>;
  ciblerRetrait(
    reference: string,
    version: number,
    cibles: CibleRetrait[],
    ecoleId: string | null,
    photoId: string | null,
  ): Promise<void>;
  /** Refusé tant que la base publie encore la cible, et elle la nomme. */
  noterRetire(reference: string, version: number): Promise<void>;
  /** La mise en ligne a été demandée, à la main. Rien n'est lancé d'ici. */
  noterMiseEnLigne(reference: string, version: number, execution: string | null): Promise<void>;
  /** Constaté sur les deux adresses, chacune à son jour. */
  noterConstat(
    reference: string,
    version: number,
    productionLe: string,
    essaiLe: string,
  ): Promise<void>;
}

// L'adresse : `#demandes`, `#demandes/<file>`, `#demandes/<référence>[/<file>]` --------------------------

const REFERENCE = /^[CAR]-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
export const CHEMIN = 'demandes';

/** Une référence telle qu'un e-mail la donne, ou `null` : jamais autre chose ne part à la base. */
export function lireReference(brut: string | undefined): string | null {
  const texte = (brut ?? '').trim().toUpperCase();
  return REFERENCE.test(texte) ? texte : null;
}

export function lireFile(brut: string | undefined): FileMessages | null {
  return (FILES as readonly string[]).includes(brut ?? '') ? (brut as FileMessages) : null;
}

/** Où l'adresse mène : une file, et le message ouvert s'il y en a un. Un lien d'e-mail n'a que la référence. */
export function lireAdresse(segments: readonly string[]): {
  file: FileMessages;
  reference: string | null;
} {
  const reference = lireReference(segments[0]);
  const file = lireFile(segments[reference ? 1 : 0]);
  return { reference, file: file ?? (reference?.startsWith('R-') ? 'retraits' : 'a-traiter') };
}

export function adresseFile(file: FileMessages): string {
  return file === 'a-traiter' ? CHEMIN : `${CHEMIN}/${file}`;
}
export function adresseMessage(reference: string, file?: FileMessages): string {
  return file ? `${CHEMIN}/${reference}/${file}` : `${CHEMIN}/${reference}`;
}

export const estFileDeRetraits = (file: FileMessages): boolean =>
  file === 'retraits' || file === 'retraits-clos';

/** Une file n'a de filtre par nature que si elle en mélange plusieurs. */
export function naturesDeLaFile(file: FileMessages): readonly Nature[] {
  if (estFileDeRetraits(file)) return [];
  return file === 'alertes' || file === 'indesirables'
    ? listes.public_request_kind
    : ['contact', 'absente', 'erreur'];
}

/** La file où se trouve un message maintenant : pour y revenir après un geste. */
export function fileDuMessage(m: Pick<MessageOuvert, 'nature' | 'etat'>): FileMessages {
  if (m.etat === 'indesirable') return 'indesirables';
  if (m.nature === 'retrait') return m.etat === 'close' ? 'retraits-clos' : 'retraits';
  return m.etat === 'close' ? 'clos' : m.etat === 'en_attente' ? 'en-attente' : 'a-traiter';
}

// Les mots ------------------------------------------------------------------------------------------

export const libelleNature: Record<Nature, string> = {
  contact: 'Contact',
  absente: 'École absente',
  erreur: 'Erreur sur une fiche',
  retrait: 'Retrait',
};
// Les mots des formulaires publics (lot 3C) sont ceux de l'administration : elle lit exactement ce que la personne a choisi.
export const libelleSujet: Record<Valeur<'public_request_subject'>, string> = {
  trouver: 'Trouver une école ou une formation',
  ecole: 'Mon école sur NTanova',
  outils: 'Les outils pour les écoles',
  donnees: 'Mes données personnelles',
  site: 'Une remarque sur le site',
  autre: 'Autre chose',
};
export const libelleInformation: Record<Valeur<'public_request_topic'>, string> = {
  nom: 'Nom',
  adresse: 'Adresse ou position',
  niveaux: 'Niveaux ou formations',
  frais: 'Frais',
  contact: 'Téléphone ou contact',
  photo: 'Photo',
  ferme: 'Fermée ou déménagée',
  autre: 'Autre',
};
export const libelleARetirer: Record<Valeur<'public_request_removal'>, string> = {
  tel: 'Un numéro de téléphone',
  photo: 'Une photo',
  personne: 'Le nom d’une personne',
  fiche: 'La fiche entière',
  autre: 'Une autre information personnelle',
};
export const libelleSource: Record<Valeur<'public_request_knowledge'>, string> = {
  passage: 'J’y suis passé récemment',
  document: 'C’est écrit sur l’enseigne ou un document de l’école',
  ecole: 'Je travaille dans cette école ou je la dirige',
  autre: 'Autre',
};
export const libelleOrigineMessage: Record<Valeur<'public_request_origin'>, string> = {
  accueil: 'l’accueil',
  ecoles: '« Les écoles »',
  fiche: 'la fiche d’une école',
  pied: 'le bas de page',
  'pour-les-ecoles': '« Pour les écoles »',
  fiabilite: '« Fiabilité des informations »',
  villes: 'les villes',
  outils: 'les outils',
  contact: 'Contact',
  confidentialite: 'Confidentialité',
  direct: 'un accès direct',
};
export const libelleNiveauMessage: Record<Valeur<'public_request_level'>, string> = {
  M: 'Maternelle',
  P: 'Primaire',
  C: 'Collège',
  L: 'Lycée',
  T: 'Technique',
  S: 'Supérieur',
};
export const libelleDecision: Record<Decision, string> = {
  existe: 'Elle existe : une fiche est à préparer',
  deja_presente: 'Elle est déjà dans l’annuaire',
  introuvable: 'Introuvable pour l’instant',
  non_retenue: 'Non retenue',
  retenue: 'Correction retenue',
  fiche_juste: 'La fiche était juste',
  traitee: 'Traité',
  a_l_annuaire: 'Passé à l’annuaire',
  au_retrait: 'Passé aux retraits',
  indesirable: 'Indésirable',
  retiree: 'Retirée, constatée en ligne',
  impossible_a_verifier: 'Impossible à vérifier',
  reorientee: 'Passée en correction',
};
export const libelleReorientation: Record<Nature, string> = {
  contact: 'En faire un message',
  absente: 'Le passer en « École absente »',
  erreur: 'Le passer en « Erreur sur une fiche »',
  retrait: 'Le passer en « Retrait »',
};
export const libelleVerification: Record<VerificationRetrait, string> = {
  numero: 'Elle écrit depuis le numéro à retirer',
  direction: 'La direction de l’école, déjà connue, confirme',
  autre: 'Autre vérification, notée en une ligne',
};
export const libelleCible: Record<CibleRetrait, string> = {
  contact_public: 'Le contact public',
  numero_enseigne: 'Le numéro de l’enseigne',
  photo: 'Une photo',
  fiche: 'La fiche entière',
  texte: 'Un texte de la fiche',
};
export const libelleErreurAlerte: Record<ErreurAlerte, string> = {
  connexion: 'serveur de courrier injoignable',
  authentification: 'mot de passe de la boîte refusé',
  refus_temporaire: 'refus provisoire du serveur de courrier',
  refus_definitif: 'refus du serveur de courrier',
  delai: 'délai dépassé',
  configuration: 'réglage du service à revoir',
};
export const libelleCanal: Record<Exclude<CanalReponse, 'non'>, string> = {
  whatsapp: 'WhatsApp',
  email: 'e-mail',
};
export const titreEtape: Record<(typeof ETAPES_RETRAIT)[number], string> = {
  verifier: 'Vérifier que la personne est concernée',
  retirer: 'Retirer dans la base',
  mettre_en_ligne: 'Demander la mise en ligne',
  constater: 'Constater en ligne',
  prevenir: 'Prévenir la personne',
  clore: 'Clore',
};

/** Une décision à choisir, dans l'ordre de l'écran. Un retrait n'en a pas : ses étapes la posent. */
export function decisionsProposees(
  m: Pick<MessageOuvert, 'nature' | 'decision'>,
): readonly Decision[] {
  return m.decision === 'a_l_annuaire' || m.decision === 'au_retrait' || m.decision === 'reorientee'
    ? []
    : DECISIONS[m.nature];
}

/** Vers où ce message peut passer. Déjà décidé, plus rien ; un retrait demande de pouvoir répondre. */
export function reorientationsPossibles(
  m: Pick<MessageOuvert, 'nature' | 'etat' | 'decision' | 'canal' | 'retrait'>,
): readonly Nature[] {
  if (m.etat !== 'ouverte' || m.decision !== null) return [];
  if (m.retrait && m.retrait.issue !== null) return [];
  return REORIENTATIONS[m.nature].filter((n) => n !== 'retrait' || m.canal !== 'non');
}

/** Un motif ne va qu'avec ces décisions, en 300 signes au plus. */
export const demandeUnMotif = (d: Decision | null): boolean =>
  d === 'non_retenue' || d === 'introuvable';
export const MOTIF_AU_PLUS = 300;
export const NOTE_AU_PLUS = 160;

/** Ce que décider ne fait pas, dit avant le geste. */
export function consequenceDeLaDecision(nature: Nature, d: Decision | null): string {
  if (d === 'indesirable') {
    return `Rangé avec les indésirables, sans réponse ; effacé ${REGLAGES.indesirableJours} jours après ce geste.`;
  }
  if (nature === 'absente') {
    return 'Décider ne crée ni ne publie aucune fiche. Ajouter l’école, puis la publier, restent deux gestes à part, dans Écoles.';
  }
  if (nature === 'erreur') {
    return 'Décider ne change pas la fiche : elle se corrige dans Écoles, et la correction paraît à la prochaine mise à jour du site.';
  }
  return 'La décision se note ; elle ne publie rien.';
}

// Ce qui se fait ensuite ------------------------------------------------------------------------------

export type GesteSuivant = 'decider' | 'repondre' | 'clore' | 'rouvrir' | 'reprendre' | 'restaurer';

/** Le geste à mettre en avant, un seul à la fois. */
export function gesteSuivant(
  m: Pick<MessageOuvert, 'etat' | 'decision' | 'reponse'>,
): GesteSuivant {
  if (m.etat === 'close') return 'rouvrir';
  if (m.etat === 'indesirable') return 'restaurer';
  if (m.decision === null) return m.etat === 'en_attente' ? 'reprendre' : 'decider';
  if (m.reponse === 'a_faire') return 'repondre';
  return m.etat === 'en_attente' ? 'reprendre' : 'clore';
}

export const peutDecider = (m: Pick<MessageOuvert, 'etat' | 'nature' | 'decision'>): boolean =>
  m.etat === 'ouverte' && decisionsProposees(m).length > 0;

/** Répondre vient après la décision, et seulement si la personne l'a demandé. */
export const peutRepondre = (m: Pick<MessageOuvert, 'etat' | 'decision' | 'reponse'>): boolean =>
  (m.etat === 'ouverte' || m.etat === 'en_attente') &&
  m.decision !== null &&
  m.reponse !== 'non_demandee';

export const peutClore = (m: Pick<MessageOuvert, 'etat' | 'decision' | 'reponse'>): boolean =>
  m.etat === 'ouverte' && m.decision !== null && m.reponse !== 'a_faire';

/** Un message se passe d'abord dans la bonne file ; il ne se rattache pas. */
export const peutRattacher = (m: Pick<MessageOuvert, 'etat' | 'nature'>): boolean =>
  m.nature !== 'contact' && (m.etat === 'ouverte' || m.etat === 'en_attente');

/** Pourquoi le geste suivant n'est pas disponible, ou ce qu'il entraîne : une ligne, près des boutons. */
export function ligneDeGeste(m: MessageOuvert): string {
  switch (gesteSuivant(m)) {
    case 'rouvrir':
      return 'Rouvrir remet le message dans « À traiter » et annule la date d’effacement.';
    case 'restaurer':
      return 'Rien à faire : sans geste, il s’efface seul.';
    case 'reprendre':
      return m.decision === null
        ? 'En attente : remets-le à traiter pour décider.'
        : 'En attente : remets-le à traiter pour clore.';
    case 'decider':
      return 'Décider d’abord. Répondre et clore viennent après.';
    case 'repondre':
      return m.canal === 'whatsapp'
        ? 'Ouvrir WhatsApp n’envoie rien : note l’envoi une fois parti.'
        : 'Ouvrir le courrier n’envoie rien : note l’envoi une fois parti.';
    case 'clore':
      return 'Tout est noté : tu peux clore.';
  }
}

/** Le jour de l'effacement si l'on clôt maintenant, au calendrier de Brazzaville : 12 mois après, comme la base. */
export function effacementSiClos(aujourdHui: string): string {
  const [a, m, j] = aujourdHui.split('-').map(Number) as [number, number, number];
  const mois = m - 1 + REGLAGES.closeMois;
  const annee = a + Math.floor(mois / 12);
  const moisDeLAnnee = mois % 12;
  // Le 29 février d'une année ordinaire tombe le 28, comme `date + interval '12 months'` de PostgreSQL.
  const dernier = new Date(Date.UTC(annee, moisDeLAnnee + 1, 0)).getUTCDate();
  return new Date(Date.UTC(annee, moisDeLAnnee, Math.min(j, dernier))).toISOString().slice(0, 10);
}

/** Un jour noté : réel, jamais futur, jamais avant `depuis`. */
export function jourNotable(
  jour: string,
  aujourdHui: string,
  depuis: string | null = null,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false;
  const d = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== jour) return false;
  return jour <= aujourdHui && (depuis === null || jour >= depuis);
}

// Répondre : ouvrir n'envoie rien, et ne recopie jamais le message ------------------------------------------

/** La coordonnée laissée pour répondre, dans la version courante. */
export function coordonneeDe(m: Pick<MessageOuvert, 'versions' | 'canal'>): string | null {
  if (m.canal === 'non') return null;
  const c = m.versions.find((v) => v.courante)?.contenu.coordonnee;
  return typeof c === 'string' && c !== '' ? c : null;
}

export function coordonneeLisible(m: Pick<MessageOuvert, 'versions' | 'canal'>): string {
  const c = coordonneeDe(m);
  if (c === null) return 'Aucune coordonnée laissée';
  return m.canal === 'whatsapp' ? afficherTelephone(c) : c;
}

/** Un lien `wa.me` ou `mailto:` avec la référence et une phrase neutre ; jamais ce que la personne a écrit. */
export function lienDeReponse(
  m: Pick<MessageOuvert, 'reference' | 'versions' | 'canal'>,
): string | null {
  const c = coordonneeDe(m);
  if (c === null) return null;
  const phrase = `Bonjour, ici NTanova, au sujet de votre message ${m.reference} :`;
  if (m.canal === 'whatsapp') return lienWhatsApp(c, phrase);
  // L'adresse a été contrôlée par la base ; un signe qui ajouterait un destinataire ou un en-tête ne passe pas.
  if (!/^[^\s@<>()",;:?&]+@[^\s@<>()",;:?&]+$/u.test(c)) return null;
  const sujet = encodeURIComponent(`NTanova · votre message ${m.reference}`);
  return `mailto:${encodeURIComponent(c).replace('%40', '@')}?subject=${sujet}&body=${encodeURIComponent(phrase)}`;
}

// Les lignes et les pastilles ----------------------------------------------------------------------------

export type Ton = 'succes' | 'attention' | 'danger' | 'neutre';
export interface Pastille {
  ton: Ton;
  texte: string;
}

export function titreDeLigne(l: LigneMessage): string {
  if (l.nature === 'contact') return l.sujet ? libelleSujet[l.sujet] : 'Message sans sujet';
  return l.nomEcole ?? l.fiche ?? 'École non désignée';
}

export function precisionDeLigne(l: LigneMessage): string | null {
  if (l.nature === 'absente') return l.ville;
  if (l.nature === 'erreur') return l.information ? libelleInformation[l.information] : null;
  if (l.nature === 'retrait') return l.aRetirer ? libelleARetirer[l.aRetirer] : null;
  return null;
}

/** L'état de l'alerte e-mail, quand il demande un regard. */
export function pastilleAlerte(
  etat: EtatAlerte | null,
  erreur: ErreurAlerte | null,
): Pastille | null {
  if (etat === 'abandonnee') return { ton: 'danger', texte: 'Alerte abandonnée' };
  if (etat === null || etat === 'envoyee') return null;
  return erreur === null
    ? { ton: 'attention', texte: 'Pas encore annoncé' }
    : { ton: 'attention', texte: 'Alerte en échec' };
}

function pastilleReponse(canal: CanalReponse, reponse: EtatReponse): Pastille | null {
  if (canal === 'non') return null;
  if (reponse === 'faite') return { ton: 'neutre', texte: 'Réponse notée' };
  if (reponse === 'impossible') return { ton: 'danger', texte: 'Réponse impossible' };
  return { ton: 'neutre', texte: `Réponse : ${libelleCanal[canal]}` };
}

const presentes = (p: (Pastille | null | false)[]): Pastille[] =>
  p.filter((x): x is Pastille => Boolean(x));

/** Ce qui demande un regard d'abord ; le reste se lit dans le message. */
export function pastillesDeLigne(l: LigneMessage, maintenant: Date): Pastille[] {
  if (l.nature === 'retrait') {
    return presentes([
      !l.ouvert && { ton: 'succes', texte: 'Nouveau' },
      l.etat === 'en_attente' && { ton: 'neutre', texte: 'En attente' },
      l.etat !== 'close' && pastilleDelai(l, maintenant),
      l.etat !== 'close' && pastilleAlerte(l.alerte, l.erreurAlerte),
      l.suiteDe !== null && { ton: 'neutre', texte: 'Suite' },
      l.etat === 'close' &&
        l.decision !== null && { ton: 'neutre', texte: libelleDecision[l.decision] },
    ]);
  }
  return presentes([
    !l.ouvert && l.etat !== 'indesirable' && { ton: 'succes', texte: 'Nouveau' },
    pastilleAlerte(l.alerte, l.erreurAlerte),
    l.limiteLe !== null && { ton: 'attention', texte: 'Limite d’envois' },
    l.suiteDe !== null && { ton: 'neutre', texte: 'Suite' },
    l.reorienteDe !== null && { ton: 'neutre', texte: 'Réorienté' },
    l.versions > 1 && { ton: 'neutre', texte: `${l.versions} versions` },
    l.decision !== null && l.etat !== 'indesirable' && { ton: 'neutre', texte: 'Décidé' },
    pastilleReponse(l.canal, l.reponse),
  ]);
}

export function pastillesDuMessage(m: MessageOuvert): Pastille[] {
  return presentes([
    m.etat === 'en_attente' && { ton: 'neutre', texte: 'En attente' },
    m.etat === 'close' && { ton: 'neutre', texte: 'Clos' },
    m.etat === 'indesirable' && { ton: 'neutre', texte: 'Indésirable' },
    m.alerte !== null && pastilleAlerte(m.alerte.etat, m.alerte.erreur),
    m.limiteLe !== null && { ton: 'attention', texte: 'Limite d’envois' },
    m.nature !== 'retrait' &&
      m.decision !== null &&
      m.etat !== 'indesirable' && { ton: 'neutre', texte: 'Décidé' },
    pastilleReponse(m.canal, m.reponse),
  ]);
}

// Le délai d'un retrait : la base sous 7 jours, rien de plus ------------------------------------------------

/** Ce que promet déjà la page Confidentialité : le retrait dans la base, en jours à partir de la réception. */
export const DELAI_RETRAIT_JOURS = DELAI_DROITS_JOURS;

/** Le jour en cours (le jour de la réception compte pour 1), ou `null` quand le compte est arrêté. */
export function jourDuRetrait(
  r: Pick<LigneMessage, 'recuLe' | 'retireLe' | 'etapeRetrait'>,
  maintenant: Date,
): number | null {
  // Retiré dans la base, ou rien à retirer (impossible à vérifier, réorienté) : le délai ne court plus.
  if (r.retireLe !== null) return null;
  if (r.etapeRetrait !== 'verifier' && r.etapeRetrait !== 'retirer') return null;
  return Math.max(1, Math.floor((maintenant.getTime() - Date.parse(r.recuLe)) / 86_400_000) + 1);
}

export function texteDuDelai(jour: number): string {
  return jour > DELAI_RETRAIT_JOURS
    ? `Délai de ${DELAI_RETRAIT_JOURS} jours dépassé : jour ${jour}`
    : `Jour ${jour} sur ${DELAI_RETRAIT_JOURS}`;
}

function pastilleDelai(l: LigneMessage, maintenant: Date): Pastille | null {
  const jour = jourDuRetrait(l, maintenant);
  if (jour !== null)
    return { ton: jour > DELAI_RETRAIT_JOURS ? 'danger' : 'attention', texte: texteDuDelai(jour) };
  if (l.retireLe === null) return null;
  return l.etapeRetrait === 'mettre_en_ligne' || l.etapeRetrait === 'constater'
    ? { ton: 'attention', texte: 'Pas encore constaté en ligne' }
    : { ton: 'succes', texte: 'Constaté en ligne' };
}

/** Où en est chaque étape, sans en inventer une : sans objet, faite, à faire, à venir. */
export function etapesDuRetrait(
  m: Pick<MessageOuvert, 'etat' | 'reponse' | 'decision'> & { retrait: SuiviRetrait },
): {
  etape: (typeof ETAPES_RETRAIT)[number];
  etat: 'faite' | 'courante' | 'a_venir' | 'sans_objet';
  mot: string;
}[] {
  const r = m.retrait;
  const sansRetrait = r.issue === 'impossible' || r.issue === 'reorientee';
  const rang = r.etape === 'close' ? ETAPES_RETRAIT.length : ETAPES_RETRAIT.indexOf(r.etape);
  return ETAPES_RETRAIT.map((etape, i) => {
    if (
      sansRetrait &&
      (etape === 'retirer' || etape === 'mettre_en_ligne' || etape === 'constater')
    ) {
      return { etape, etat: 'sans_objet' as const, mot: 'Sans objet' };
    }
    if (i === rang) return { etape, etat: 'courante' as const, mot: 'À faire maintenant' };
    if (i > rang) return { etape, etat: 'a_venir' as const, mot: 'À venir' };
    let mot = 'Fait';
    if (etape === 'verifier') {
      mot =
        r.issue === 'impossible'
          ? 'Impossible à vérifier'
          : r.issue === 'reorientee'
            ? 'Passée en correction'
            : 'Fait';
    } else if (etape === 'prevenir') {
      mot =
        m.reponse === 'faite'
          ? 'Personne prévenue'
          : m.reponse === 'impossible'
            ? 'Impossible de répondre'
            : 'Fait';
    } else if (etape === 'mettre_en_ligne') mot = 'Demandée';
    return { etape, etat: 'faite' as const, mot };
  });
}

/** Pour la fiche entière, un numéro ne suffit pas : la direction confirme. */
export function verificationsPossibles(
  aRetirer: Valeur<'public_request_removal'> | null,
): readonly VerificationRetrait[] {
  return aRetirer === 'fiche' ? ['direction', 'autre'] : ['numero', 'direction', 'autre'];
}

/** Les cibles, celles que la demande désigne d'abord. Aucune n'est cochée d'avance. */
export function ciblesDansLOrdre(
  aRetirer: Valeur<'public_request_removal'> | null,
): readonly CibleRetrait[] {
  const d: Partial<Record<Valeur<'public_request_removal'>, CibleRetrait[]>> = {
    tel: ['contact_public', 'numero_enseigne'],
    photo: ['photo'],
    personne: ['texte'],
    fiche: ['fiche'],
  };
  const devant = aRetirer ? (d[aRetirer] ?? []) : [];
  return [...devant, ...listes.public_removal_target.filter((c) => !devant.includes(c))];
}

/** Ce qui manque pour désigner les cibles, ou `null`. Seul un texte libre se passe de fiche. */
export function manquePourCibler(
  cibles: readonly CibleRetrait[],
  ecoleId: string | null,
  photoId: string | null,
): string | null {
  if (cibles.length === 0) return 'Coche ce que tu retires.';
  if (cibles.some((c) => c !== 'texte') && ecoleId === null)
    return 'Rattache d’abord la fiche concernée.';
  if (cibles.includes('photo') && photoId === null) return 'Désigne la photo.';
  return null;
}

// Ce qui est écrit, lisible ----------------------------------------------------------------------------------

export interface LigneEcrite {
  libelle: string;
  valeur: string;
}

/** Les champs d'une version, dans l'ordre du formulaire ; un champ vide ne s'affiche pas. Coordonnée et origine à part. */
export function lignesEcrites(nature: Nature, c: Contenu): LigneEcrite[] {
  const texte = (cle: keyof Contenu): string | null => {
    const v = c[cle];
    return typeof v === 'string' && v !== '' ? v : null;
  };
  const dans = <T extends string>(
    libelles: Record<T, string>,
    cle: keyof Contenu,
  ): string | null => {
    const v = texte(cle);
    return v === null ? null : (libelles[v as T] ?? 'Autre');
  };
  const niveaux = Array.isArray(c.niveaux)
    ? (c.niveaux as readonly string[])
        .map((n) => libelleNiveauMessage[n as Valeur<'public_request_level'>] ?? n)
        .join(', ')
    : null;
  const lignes: [string, string | null][] = [
    ['Sujet', dans(libelleSujet, 'sujet')],
    ['Message', texte('message')],
    ['Nom de l’école', texte('nomEcole')],
    ['Ville ou localité', texte('ville')],
    ['Quartier, rue ou repère', texte('repere')],
    ['Niveaux', niveaux],
    ['Autre chose', texte('autreChose')],
    [
      'Dirige cette école ou y travaille',
      c.deLEcole === true ? 'Oui' : c.deLEcole === false ? 'Non' : null,
    ],
    ['Information concernée', dans(libelleInformation, 'information')],
    ['Ce qui est faux, ce qui est juste', texte('correction')],
    ['Comment la personne le sait', dans(libelleSource, 'source')],
    ['À retirer', dans(libelleARetirer, 'aRetirer')],
    ['Précision de la personne', texte('precision')],
    ['Nom (facultatif)', texte('nomPersonne')],
  ];
  // Un message passé dans une autre file garde tout ce qui a été écrit : on montre ce qui est là, quelle que soit sa nature.
  void nature;
  return lignes.flatMap(([libelle, valeur]) => (valeur === null ? [] : [{ libelle, valeur }]));
}

/** Une phrase de l'historique : un mot d'une liste, jamais ce que la personne a écrit. Un mot inconnu se lit tel quel. */
export function phraseEvenement(e: EvenementMessage): string {
  const d = e.detail;
  const decision = d !== null && d in libelleDecision ? libelleDecision[d as Decision] : d;
  switch (e.quoi) {
    case 'recue':
      return 'Reçu';
    case 'mise_a_jour':
      return 'Corrigé par la personne, avant ouverture';
    case 'version_ancienne':
      return 'Ancienne version arrivée en retard, gardée';
    case 'suite':
      return d ? `Suite reçue : ${d}` : 'Suite reçue';
    case 'limite':
      return 'Limite d’envois atteinte : un texte refusé';
    case 'ouverte':
      return 'Ouvert par toi';
    case 'en_attente':
      return 'Mis en attente';
    case 'reprise':
      return 'Remis à traiter';
    case 'rattachee':
      return 'Rattaché à une fiche';
    case 'detachee':
      return 'Détaché de la fiche';
    case 'decidee':
      return decision ? `Décision : ${decision}` : 'Décision notée';
    case 'reponse_faite':
      return d === 'whatsapp' || d === 'email'
        ? `Réponse notée : ${libelleCanal[d]}`
        : 'Réponse notée';
    case 'reponse_impossible':
      return 'Réponse impossible';
    case 'close':
      return 'Clos';
    case 'rouverte':
      return 'Rouvert par toi';
    case 'indesirable':
      return 'Rangé dans Indésirables';
    case 'pas_indesirable':
      return 'Rendu à sa file : pas indésirable';
    case 'reorientee':
      return d ? `Passé dans une autre file : ${d}` : 'Passé dans une autre file';
    case 'annonce_relancee':
      return 'Alerte relancée';
    case 'retrait_verifie':
      return d !== null && d in libelleVerification
        ? `Vérifié : ${libelleVerification[d as VerificationRetrait].toLowerCase()}`
        : 'Vérifié';
    case 'retrait_impossible':
      return 'Impossible à vérifier';
    case 'retrait_cible':
      return `À retirer : ${(d ?? '')
        .split(',')
        .map((c) => libelleCible[c as CibleRetrait]?.toLowerCase() ?? c)
        .join(', ')}`;
    case 'retrait_base':
      return 'Retiré de la base';
    case 'retrait_mise_en_ligne':
      return 'Mise en ligne demandée';
    case 'retrait_constate':
      return 'Constaté en ligne, sur les deux adresses';
    default:
      return e.quoi;
  }
}

// L'état des tâches : un silence se voit, une tâche jamais passée ne se dit pas « en marche » -------------------

const MINUTE = 60_000;
export const SILENCE_ALERTES_MINUTES = 30;
export const SILENCE_PURGE_HEURES = 26;

export type EtatTache = 'jamais' | 'silence' | 'passe';

export function etatDesAlertes(r: ResumeMessages, maintenant: Date): EtatTache {
  if (r.dernierPassageAlertesLe === null) return 'jamais';
  return maintenant.getTime() - Date.parse(r.dernierPassageAlertesLe) >
    SILENCE_ALERTES_MINUTES * MINUTE
    ? 'silence'
    : 'passe';
}
export function etatDeLaPurge(r: ResumeMessages, maintenant: Date): EtatTache {
  if (r.dernierPassagePurgeLe === null) return 'jamais';
  return maintenant.getTime() - Date.parse(r.dernierPassagePurgeLe) >
    SILENCE_PURGE_HEURES * 60 * MINUTE
    ? 'silence'
    : 'passe';
}

/** « 1 h 10 », « 45 min », « 2 jours » : une durée écoulée. */
export function dureeDepuis(iso: string, maintenant: Date): string {
  const minutes = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(iso)) / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48)
    return minutes % 60 === 0
      ? `${heures} h`
      : `${heures} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(heures / 24)} jours`;
}

/** Ce que la carte d'« Aujourd'hui » dit, et si elle demande un regard. */
export function resumerPourAujourdhui(
  r: ResumeMessages,
  maintenant: Date,
): { nombre: number; detail: string; attention: boolean } {
  const jour =
    r.plusAncienRetraitLe === null
      ? null
      : jourDuRetrait(
          { recuLe: r.plusAncienRetraitLe, retireLe: null, etapeRetrait: 'verifier' },
          maintenant,
        );
  const alertes = r.alertesEnEchec + r.alertesAbandonnees;
  const parties = [
    r.aTraiter > 0 && `${r.aTraiter} à traiter`,
    r.retraits > 0 && `${r.retraits} retrait${r.retraits > 1 ? 's' : ''}`,
    jour !== null && `retrait : ${texteDuDelai(jour).toLowerCase()}`,
    alertes > 0 && `${alertes} alerte${alertes > 1 ? 's' : ''} en échec`,
    r.plafondAtteintLe !== null && 'plafond du jour atteint',
  ].filter((x): x is string => Boolean(x));
  return {
    nombre: r.aTraiter + r.retraits,
    detail: parties.length > 0 ? parties.join(' · ') : 'rien n’attend',
    attention:
      alertes > 0 || r.plafondAtteintLe !== null || (jour !== null && jour > DELAI_RETRAIT_JOURS),
  };
}

/** Un jour lisible, avec l'année : « 24 nov. 2027 ». */
export function jourLong(jour: string): string {
  return new Date(`${jour.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
