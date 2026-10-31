/**
 * Les contrats entre les écrans et le serveur. Les écrans n'appellent que ces
 * ports ; src/infra/ les branche sur Supabase aujourd'hui, sur un serveur REST
 * demain. Chaque opération porte en commentaire la route qu'elle deviendra.
 */
import type { Valeur } from './listes';
import type { MultiPolygone, Point } from './geo';

/** La réponse à un envoi : un second envoi du même identifiant répond « déjà reçu ». */
export type Reponse = 'recu' | 'deja_recu';

export interface Utilisateur {
  id: string;
  email: string | null;
}

/**
 * - `pret` : un envoi peut partir ;
 * - `hors_ligne` : pas de réseau pour renouveler le jeton, on réessaiera ;
 * - `reconnecter` : la session est perdue, le relais doit se reconnecter avec Google.
 */
export type EtatSession = 'pret' | 'hors_ligne' | 'reconnecter';

export interface PortSession {
  /** L'utilisateur gardé sur le téléphone, même hors ligne et même si son jeton a expiré. `GET /moi` */
  utilisateur(): Promise<Utilisateur | null>;
  /** `POST /auth/google` */
  connecterAvecGoogle(jetonGoogle: string, nonce: string): Promise<Utilisateur>;
  deconnecter(): Promise<void>;
  /** Renouvelle le jeton s'il le faut : à appeler avant chaque série d'envois. */
  etat(): Promise<EtatSession>;
}

export interface Profil {
  id: string;
  prenom: string;
  statut: Valeur<'statut_relais'>;
  lotId: string | null;
}

export interface Lot {
  id: string;
  nom: string;
  essai: boolean;
  aRendreLe: string | null;
  /** Le contour du lot, ou celui de son arrondissement quand le lot le couvre en entier. */
  contour: MultiPolygone | null;
}

export interface EcoleProche extends Point {
  id: string;
  nom: string;
}

/** Ce que le relais relit de ses relevés : jamais le contact de la direction. */
export interface ReleveRecu {
  id: string;
  nomEnseigne: string;
  prisLe: string;
  statut: Valeur<'statut_releve'>;
  motif: Valeur<'motif_decision'> | null;
  messageAuRelais: string | null;
  direction: Valeur<'direction_vue'> | null;
  ficheLiaisonRemise: boolean;
  repasser: string | null;
  contactConfirmeLe: string | null;
  contactFonction: Valeur<'fonction_direction'> | null;
  ecoleId: string | null;
}

export interface ReleveAEnvoyer {
  id: string;
  lotId: string | null;
  type: Valeur<'type_releve'>;
  corrigeReleveId: string | null;
  position: Point | null;
  precisionM: number | null;
  prisLe: string;
  reponseDoublon: Valeur<'reponse_doublon'> | null;
  doublonDe: string | null;
  nomEnseigne: string;
  niveaux: Valeur<'niveau'>[];
  typeEcole: Valeur<'type_ecole'>;
  repere: string | null;
  numeroEnseigne: string | null;
  direction: Valeur<'direction_vue'> | null;
  repasser: string | null;
}

export interface ContactAEnvoyer {
  releveId: string;
  fonction: Valeur<'fonction_direction'> | null;
  nom: string | null;
  whatsapp: string | null;
  accord: boolean;
  accordLe: string | null;
  note: string | null;
}

export interface ErreurAEnvoyer {
  id: string;
  survenueLe: string;
  ecran: string | null;
  code: string;
  detail: string | null;
  versionApp: string | null;
  appareil: string | null;
}

/** Une école connue, confiée au relais pour qu'il la situe et la complète sur place. */
export interface EcoleACompleter {
  id: string;
  nom: string;
  quartier: string | null;
  typeEcole: Valeur<'type_ecole'>;
  niveaux: Valeur<'niveau'>[];
  repere: string | null;
  numeroEnseigne: string | null;
  /** Ce que NTanova demande de vérifier. */
  note: string | null;
}

export interface PortRelais {
  /** `GET /moi` */
  monProfil(): Promise<Profil>;
  /** `GET /moi/lot` */
  monLot(): Promise<Lot | null>;
  /** Les écoles publiées, pour prévenir d'un doublon sans réseau. `GET /public/ecoles` */
  ecolesPubliees(): Promise<EcoleProche[]>;
  /** `GET /moi/releves` */
  mesReleves(): Promise<ReleveRecu[]>;
  /** `GET /moi/ecoles-a-completer` */
  ecolesACompleter(): Promise<EcoleACompleter[]>;
  /** `POST /releves` */
  envoyerReleve(releve: ReleveAEnvoyer): Promise<Reponse>;
  /** `PUT /photos/{releve}/enseigne.jpg` */
  envoyerPhoto(releveId: string, photo: Blob): Promise<Reponse>;
  /** `POST /contacts` */
  envoyerContact(contact: ContactAEnvoyer): Promise<Reponse>;
  /** `POST /erreurs` */
  signalerErreur(erreur: ErreurAEnvoyer): Promise<Reponse>;
}

// L'administration -----------------------------------------------------------

/** Une ligne de la file « À valider ». */
export interface ReleveAValider {
  id: string;
  recuLe: string;
  type: Valeur<'type_releve'>;
  nomEnseigne: string;
  relais: string;
  lot: string | null;
  essai: boolean;
  horsLot: boolean | null;
  doublonPossible: boolean;
  reponseDoublon: Valeur<'reponse_doublon'> | null;
  precisionM: number | null;
  photoRecue: boolean;
  contactRecu: boolean;
}

/** Tout ce qu'un relevé contient, sauf le contact (lu à part). */
export interface DetailReleve extends ReleveAValider {
  prisLe: string;
  position: Point | null;
  niveaux: Valeur<'niveau'>[];
  typeEcole: Valeur<'type_ecole'>;
  repere: string | null;
  numeroEnseigne: string | null;
  direction: Valeur<'direction_vue'> | null;
  repasser: string | null;
  doublonDe: { id: string; nom: string } | null;
  corrigeReleveId: string | null;
  contactConfirmeLe: string | null;
  contactFonction: Valeur<'fonction_direction'> | null;
}

export interface ContactDirection {
  fonction: Valeur<'fonction_direction'> | null;
  nom: string | null;
  whatsapp: string | null;
  accord: boolean;
  accordLe: string | null;
  note: string | null;
  recuLe: string;
}

export interface RelaisVu {
  id: string;
  prenom: string;
  statut: Valeur<'statut_relais'>;
  lotId: string | null;
  creeLe: string;
  activeLe: string | null;
  /** Les relevés reçus de ce relais. */
  fiches: number;
}

export interface LotVu {
  id: string;
  nom: string;
  essai: boolean;
  aRendreLe: string | null;
}

export interface EcoleVue {
  id: string;
  nom: string;
  quartier: string | null;
  arrondissement: string | null;
  arrondissementId: number | null;
  publication: Valeur<'publication'>;
  /** Pour une école retirée : pourquoi, quand, et vers quelle école un doublon renvoie. */
  retrait: {
    motif: Valeur<'motif_retrait'>;
    le: string;
    note: string | null;
    remplaceePar: string | null;
  } | null;
  /** Sans position : l'école attend qu'un relais la situe. */
  aSituer: boolean;
  confiee: { relaisId: string; prenom: string; note: string | null } | null;
}

export interface PortAdministration {
  /** Le rôle vient de la base, pas de Google. `GET /moi` */
  suisAdmin(): Promise<boolean>;
  /** `GET /admin/releves` */
  relevesAValider(): Promise<ReleveAValider[]>;
  /** `GET /admin/releves/{id}` */
  detailReleve(id: string): Promise<DetailReleve>;
  /** Une adresse temporaire de la photo, ou null si elle n'est pas encore arrivée. */
  photoReleve(id: string): Promise<string | null>;
  /** `GET /admin/releves/{id}/contact` */
  contactReleve(id: string): Promise<ContactDirection | null>;
  /** Publie la fiche ; avec `ecoleId`, met à jour cette école. Rend l'école. `POST /admin/releves/{id}/decision` */
  accepter(id: string, ecoleId?: string | null): Promise<string>;
  demanderCorrection(
    id: string,
    motif: Valeur<'motif_decision'>,
    message: string | null,
  ): Promise<void>;
  refuser(id: string, motif: Valeur<'motif_decision'>, message: string | null): Promise<void>;
  confirmerContact(id: string, fonction: Valeur<'fonction_direction'>): Promise<void>;
  /** `GET /admin/relais` */
  relais(): Promise<RelaisVu[]>;
  /** `GET /admin/lots` */
  lots(): Promise<LotVu[]>;
  /** `POST /admin/relais/{id}/activation` */
  activerRelais(relaisId: string, lotId: string): Promise<void>;
  suspendreRelais(relaisId: string): Promise<void>;
  /** `GET /admin/ecoles` */
  ecoles(): Promise<EcoleVue[]>;
  /** Confie une école à un relais actif, avec ce qu'il doit vérifier. `POST /admin/ecoles/{id}/confier` */
  confierEcole(ecoleId: string, relaisId: string, note: string | null): Promise<void>;
  reprendreEcole(ecoleId: string): Promise<void>;
  /** `GET /public/quartiers` (avec leur identifiant, pour publier tout un arrondissement) */
  arrondissements(): Promise<{ id: number; slug: string; nom: string }[]>;
  /** Une école prête (ou retirée) passe en ligne. `POST /admin/ecoles/{id}/publication` */
  publierEcole(ecoleId: string): Promise<void>;
  /** Toutes les écoles prêtes d'un arrondissement ; rend leur nombre. */
  publierArrondissement(arrondissementId: number): Promise<number>;
  /** Les écoles prêtes relevées dans un lot ; rend leur nombre. */
  publierLot(lotId: string): Promise<number>;
  /** Retirer du site, avec un motif. `POST /admin/ecoles/{id}/retrait` */
  retirerEcole(ecoleId: string, motif: Valeur<'motif_retrait'>, note: string | null): Promise<void>;
  /** La première école est retirée et renvoie vers la seconde. */
  fusionnerEcoles(doublonId: string, gardeeId: string): Promise<void>;
  /** Droit d'effacement : le contact de la direction d'un relevé. */
  effacerContact(releveId: string, note: string | null): Promise<void>;
  /** La photo de l'enseigne d'un relevé. */
  effacerPhoto(releveId: string, note: string | null): Promise<void>;
  /** Les décisions récentes (acceptées, à corriger, refusées). `GET /admin/releves?decides` */
  relevesDecides(): Promise<ReleveDecide[]>;
}

export interface ReleveDecide {
  id: string;
  nomEnseigne: string;
  relais: string;
  lot: string | null;
  type: Valeur<'type_releve'>;
  statut: Valeur<'statut_releve'>;
  decideLe: string | null;
  motif: Valeur<'motif_decision'> | null;
  messageAuRelais: string | null;
}

/** Une décision refusée par la base, avec son message (écrit en français dans la base). */
export class ErreurDecision extends Error {
  override name = 'ErreurDecision';
}

/** Une erreur de réseau : l'envoi sera rejoué plus tard. */
export class ErreurReseau extends Error {
  override name = 'ErreurReseau';
}

/** La session est perdue : le relais doit se reconnecter. */
export class ErreurSession extends Error {
  override name = 'ErreurSession';
}

// Le site public ----------------------------------------------------------------

export interface ArrondissementPublic {
  slug: string;
  nom: string;
}

/** Une école publiée, telle que le site public la montre. */
export interface EcolePubliee {
  id: string;
  arrondissement: string;
  slug: string;
  nom: string;
  quartier: string | null;
  typeEcole: Valeur<'type_ecole'>;
  niveaux: Valeur<'niveau'>[];
  repere: string | null;
  numeroEnseigne: string | null;
  latitude: number | null;
  longitude: number | null;
  etat: Valeur<'etat_ecole'>;
  misAJourLe: string;
}

/** Lu à la construction du site : les pages publiques n'appellent jamais la base. */
export interface PortCatalogue {
  /** `GET /public/quartiers` */
  arrondissements(): Promise<ArrondissementPublic[]>;
  /** `GET /public/ecoles` */
  ecoles(): Promise<EcolePubliee[]>;
}
