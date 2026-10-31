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

export interface PortRelais {
  /** `GET /moi` */
  monProfil(): Promise<Profil>;
  /** `GET /moi/lot` */
  monLot(): Promise<Lot | null>;
  /** Les écoles publiées, pour prévenir d'un doublon sans réseau. `GET /public/ecoles` */
  ecolesPubliees(): Promise<EcoleProche[]>;
  /** `GET /moi/releves` */
  mesReleves(): Promise<ReleveRecu[]>;
  /** `POST /releves` */
  envoyerReleve(releve: ReleveAEnvoyer): Promise<Reponse>;
  /** `PUT /photos/{releve}/enseigne.jpg` */
  envoyerPhoto(releveId: string, photo: Blob): Promise<Reponse>;
  /** `POST /contacts` */
  envoyerContact(contact: ContactAEnvoyer): Promise<Reponse>;
  /** `POST /erreurs` */
  signalerErreur(erreur: ErreurAEnvoyer): Promise<Reponse>;
}

/** Une erreur de réseau : l'envoi sera rejoué plus tard. */
export class ErreurReseau extends Error {
  override name = 'ErreurReseau';
}

/** La session est perdue : le relais doit se reconnecter. */
export class ErreurSession extends Error {
  override name = 'ErreurSession';
}
