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

/**
 * Une école déjà connue autour du lot : son nom et sa position, rien d'autre. Le téléphone la garde pour prévenir
 * d'un doublon à moins de 40 m, même sans réseau. `genre` : un campus connu, ou un relevé pas encore accepté.
 */
export interface EcoleProche extends Point {
  id: string;
  nom: string;
  genre?: 'campus' | 'releve';
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
  campusId: string | null;
}

/** Une photo prête à partir : déjà allégée (moins de 200 Ko, WebP ou JPEG), avec son identifiant créé sur le téléphone. */
export interface PhotoAEnvoyer {
  id: string;
  role: Valeur<'photo_role'>;
  blob: Blob;
  mime: 'image/webp' | 'image/jpeg';
  octets: number;
  largeur: number;
  hauteur: number;
  prisLe: string;
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
  /** Une ligne libre, facultative : « programme français-congolais, bilingue ». */
  programme: string | null;
  /** Les séries ou filières lues sur l'enseigne (lycée, technique, supérieur, autre formation). */
  programmesVus: string | null;
  /** Elles sont sur un panneau, une affiche ou un prospectus pris en photo. */
  programmesEnPhoto: boolean;
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

/**
 * Une école connue, confiée au relais pour qu'il la situe et la complète sur place.
 * Le type et les niveaux sont dits tels que la base les a : une valeur que ce téléphone ne
 * connaît pas encore est possible, et la contre-visite ne reprend que ce qu'il connaît.
 */
export interface EcoleACompleter {
  /** L'identifiant du campus. */
  id: string;
  nom: string;
  /** L'implantation (« Campus de Loandjili »), quand l'institution en a plusieurs. */
  etiquette?: string | null;
  quartier: string | null;
  typeEcole: string;
  niveaux: string[];
  programme: string | null;
  repere: string | null;
  numeroEnseigne: string | null;
  /** Ce que NTanova demande de vérifier. */
  note: string | null;
  /** Ce qu'on attend du relais : vérifier l'école, la situer, ou compléter sa fiche. */
  genre: Valeur<'mission_kind'>;
}

export interface PortRelais {
  /** `GET /moi` */
  monProfil(): Promise<Profil>;
  /** `GET /moi/lot` */
  monLot(): Promise<Lot | null>;
  /**
   * Les écoles connues autour du lot (campus et relevés pas encore acceptés, de tous les relais du lot) : nom et
   * position, pour que l'alerte « doublon possible à moins de 40 m » marche sans réseau. `GET /moi/lieux-connus`
   */
  lieuxConnus(): Promise<EcoleProche[]>;
  /** `GET /moi/releves` */
  mesReleves(): Promise<ReleveRecu[]>;
  /** Les écoles confiées au relais (ses missions ouvertes). `GET /moi/missions` */
  mesMissions(): Promise<EcoleACompleter[]>;
  /** `POST /releves` */
  envoyerReleve(releve: ReleveAEnvoyer): Promise<Reponse>;
  /** Dépose le fichier au chemin `<relevé>/<photo>.<webp|jpg>`, puis l'enregistre. `PUT /photos/{releve}/{photo}` */
  envoyerPhoto(releveId: string, photo: PhotoAEnvoyer): Promise<Reponse>;
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
  /** Combien de photos le relais a envoyées, et si l'enseigne (la seule obligatoire) est arrivée. */
  photos: number;
  enseigneRecue: boolean;
  /** Le relais a noté des séries ou filières, ou les a prises en photo. */
  indiceFormations: boolean;
  contactRecu: boolean;
}

/** Tout ce qu'un relevé contient, sauf le contact (lu à part). */
export interface DetailReleve extends ReleveAValider {
  prisLe: string;
  position: Point | null;
  niveaux: Valeur<'niveau'>[];
  typeEcole: Valeur<'type_ecole'>;
  programme: string | null;
  /** Les séries ou filières que le relais a lues sur l'enseigne. */
  programmesVus: string | null;
  programmesEnPhoto: boolean;
  repere: string | null;
  numeroEnseigne: string | null;
  direction: Valeur<'direction_vue'> | null;
  repasser: string | null;
  doublonDe: { id: string; nom: string } | null;
  corrigeReleveId: string | null;
  contactConfirmeLe: string | null;
  contactFonction: Valeur<'fonction_direction'> | null;
  /** Quand le lot est celui d'essai : le relevé a-t-il été validé pour la paie d'essai ? */
  essaiValideLe: string | null;
  /** Le campus que ce relevé a créé ou mis à jour, une fois accepté. */
  campusId: string | null;
  /** Où ce relevé tombe (le nom de la division du campus), une fois accepté. */
  divisionNom: string | null;
  /** Le nom du campus accepté, pour le pont avec la direction. */
  campusNom: string | null;
  /** Le campus accepté est-il déjà en ligne ? */
  campusPublie: boolean;
}

/** Une photo d'un relevé, avec une adresse temporaire pour la voir (jamais publique d'office). */
export interface PhotoVue {
  id: string;
  role: Valeur<'photo_role'>;
  adresse: string | null;
  octets: number;
  largeur: number | null;
  hauteur: number | null;
  prisLe: string | null;
  /** L'administration a vérifié qu'elle est publiable (sans enfant, sans nom ni numéro de personne). */
  publiable: boolean;
}

/** Une formation lue sur une photo, saisie par l'administration. */
export interface FormationSaisie {
  cycle: Valeur<'niveau'>;
  titre: string;
  /** L'adresse du domaine (`informatique`, `gestion`, `btp`, `sante`…). */
  domaine: string | null;
  serie: Valeur<'bac_track'> | null;
  diplome: Valeur<'diploma_kind'> | null;
  rythmes: Valeur<'study_rhythm'>[];
}

/**
 * Comment un relevé entre dans le catalogue, en un geste :
 * - `new_institution` : une nouvelle institution et son premier campus ;
 * - `new_campus` : un nouveau campus d'une institution connue (`institutionId`) ;
 * - `update_campus` : met à jour un campus connu (`campusId`) ;
 * - `add_cycle` : ajoute les cycles du relevé à un campus connu, sans toucher au reste.
 * Sans mode, la base le déduit (un campus donné : mise à jour ; une institution : nouveau campus).
 */
export type ModeAcceptation = 'new_institution' | 'new_campus' | 'update_campus' | 'add_cycle';

export interface DecisionAcceptation {
  mode?: ModeAcceptation;
  campusId?: string | null;
  institutionId?: string | null;
  etiquette?: string | null;
  formations?: FormationSaisie[];
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

/** Les compteurs d'un relais : de quoi calculer la paie (500 FCFA la fiche, +300 FCFA le contact confirmé). */
export interface CompteursRelais {
  envoyees: number;
  aValider: number;
  aCorriger: number;
  acceptees: number;
  refusees: number;
  contactsConfirmes: number;
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
  compteurs: CompteursRelais;
}

export interface LotVu {
  id: string;
  nom: string;
  essai: boolean;
  aRendreLe: string | null;
  /** Où il est posé : une ville, un arrondissement ou un quartier. */
  divisionId: string;
  divisionNom: string;
  divisionChemin: string;
}

/** Une division de la hiérarchie (pays, département, ville, arrondissement, quartier) et ce qu'elle contient. */
export interface DivisionVue {
  id: string;
  parentId: string | null;
  niveau: number;
  genre: Valeur<'geo_kind'>;
  nom: string;
  slug: string;
  chemin: string;
  /** Les relais peuvent-ils relever ici ? */
  ouverte: boolean;
  ecoles: number;
  publiees: number;
  /** D'où viennent les fiches : relevées par un relais, ajoutées par l'administration, importées. */
  relevees: number;
  ajoutees: number;
  importees: number;
}

export interface InstitutionVue {
  id: string;
  nom: string;
  genre: Valeur<'type_ecole'>;
  campus: {
    id: string;
    etiquette: string | null;
    division: string | null;
    publication: Valeur<'publication'>;
  }[];
}

export interface EcoleVue {
  /** L'identifiant du campus. */
  id: string;
  institutionId: string;
  nom: string;
  etiquette: string | null;
  quartier: string | null;
  /** La division où il est (nom) et son identifiant ; vides tant qu'il est « à situer ». */
  division: string | null;
  divisionId: string | null;
  publication: Valeur<'publication'>;
  origine: Valeur<'origin_kind'>;
  /** Pour un campus retiré : pourquoi, quand, et vers quel campus un doublon renvoie. */
  retrait: {
    motif: Valeur<'motif_retrait'>;
    le: string;
    note: string | null;
    remplaceePar: string | null;
  } | null;
  /** Sans position : l'école attend sa position (d'un relais, ou de l'administration). */
  aSituer: boolean;
  /** Sa position, quand elle en a une. */
  position: Point | null;
  confiee: {
    relaisId: string;
    prenom: string;
    note: string | null;
    genre: Valeur<'mission_kind'>;
  } | null;
  // Ce que la fiche dit aujourd'hui, pour la corriger sans repasser par le relais.
  typeEcole: Valeur<'type_ecole'>;
  niveaux: Valeur<'niveau'>[];
  programme: string | null;
  repere: string | null;
  numeroEnseigne: string | null;
  formations: number;
  /** « Vérifié » : la direction a validé la fiche à cette date (l'existence a été constatée par un relais). */
  verifieeLe: string | null;
}

/**
 * Ce que l'administration corrige sur une fiche : seuls les champs donnés changent, le reste
 * (et la date de relevé) n'est pas touché. `null` vide un champ facultatif.
 */
export interface CorrectionEcole {
  nom?: string;
  typeEcole?: Valeur<'type_ecole'>;
  niveaux?: Valeur<'niveau'>[];
  programme?: string | null;
  repere?: string | null;
  numeroEnseigne?: string | null;
}

/** Un campus d'une école créée depuis l'administration (formulaire ou importation). */
export interface EntreeCampus {
  etiquette: string | null;
  /** Le chemin (`congo.pointe_noire.pointe_noire.tie_tie`) ou l'identifiant ; sinon la position le dit. */
  division: string | null;
  quartier: string | null;
  repere: string | null;
  numeroEnseigne: string | null;
  /** Jamais inventée : sans position, le campus reste « à situer ». */
  position: Point | null;
  programme: string | null;
  cycles: {
    cycle: Valeur<'niveau'>;
    formations: Omit<FormationSaisie, 'cycle'>[];
  }[];
}

export interface EntreeCatalogue {
  /** Un identifiant anonyme (`ETB-012`) : une seconde importation ne dédouble pas. */
  reference: string | null;
  nom: string;
  genre: Valeur<'type_ecole'>;
  campus: EntreeCampus[];
}

export interface ResultatCreation {
  statut: 'creee' | 'existe';
  institutionId: string | null;
  campusIds: string[];
  message: string | null;
}

/** Le rapport d'une importation : en simulation, rien n'est écrit. */
export interface RapportImport {
  simulation: boolean;
  total: number;
  creees: number;
  existantes: number;
  erreurs: { ligne: number; nom: string | null; message: string }[];
}

/** Ce que NTanova doit à un relais jusqu'à un vendredi, avant clôture. */
export interface LignePaie {
  relaisId: string;
  prenom: string;
  fiches: number;
  contacts: number;
  /** 1 quand l'essai (trois fiches validées) est dû. */
  essais: number;
  totalXaf: number;
  /** Son numéro Mobile Money est-il noté ? */
  numeroConnu: boolean;
}

export interface SemainePaie {
  id: string;
  vendredi: string;
  totalXaf: number;
  relais: number;
  payes: number;
}

export interface PaiementVu {
  relaisId: string;
  prenom: string;
  totalXaf: number;
  fiches: number;
  contacts: number;
  essais: number;
  operateur: string | null;
  numero: string | null;
  payeLe: string | null;
  reference: string | null;
}

export interface PortAdministration {
  /** Le rôle vient de la base, pas de Google. `GET /moi` */
  suisAdmin(): Promise<boolean>;

  // À valider
  /** `GET /admin/releves` */
  relevesAValider(): Promise<ReleveAValider[]>;
  /** `GET /admin/releves/{id}` */
  detailReleve(id: string): Promise<DetailReleve>;
  /** Les photos d'un relevé (l'enseigne, le panneau des formations, le prospectus, le bâtiment). `GET /admin/releves/{id}/photos` */
  photosReleve(id: string): Promise<PhotoVue[]>;
  /** `GET /admin/releves/{id}/contact` */
  contactReleve(id: string): Promise<ContactDirection | null>;
  /** Transforme le relevé en institution, campus ou cycle. Rend le campus. `POST /admin/releves/{id}/decision` */
  accepter(id: string, decision?: DecisionAcceptation): Promise<string>;
  demanderCorrection(
    id: string,
    motif: Valeur<'motif_decision'>,
    message: string | null,
  ): Promise<void>;
  refuser(id: string, motif: Valeur<'motif_decision'>, message: string | null): Promise<void>;
  confirmerContact(id: string, fonction: Valeur<'fonction_direction'>): Promise<void>;
  /** Lot d'essai : valider le relevé avec le relais, sans le publier. */
  validerEssai(id: string): Promise<void>;
  /** Les décisions récentes (acceptées, à corriger, refusées). `GET /admin/releves?decides` */
  relevesDecides(): Promise<ReleveDecide[]>;
  /** Droit d'effacement : le contact de la direction d'un relevé. */
  effacerContact(releveId: string, note: string | null): Promise<void>;
  /** Efface une photo ; l'application supprime ensuite le fichier du stockage. */
  effacerPhoto(photoId: string, note: string | null): Promise<void>;
  /** La photo est-elle publiable (sans enfant, sans donnée personnelle) ? */
  marquerPhotoPubliable(photoId: string, publiable: boolean): Promise<void>;

  // Relais, lots, zones
  /** `GET /admin/relais` */
  relais(): Promise<RelaisVu[]>;
  /** `GET /admin/lots` */
  lots(): Promise<LotVu[]>;
  /** Un lot sur n'importe quelle ville, arrondissement ou quartier. `POST /admin/lots` */
  creerLot(
    nom: string,
    divisionId: string,
    aRendreLe: string | null,
    essai: boolean,
  ): Promise<string>;
  /** `POST /admin/relais/{id}/activation` */
  activerRelais(relaisId: string, lotId: string): Promise<void>;
  suspendreRelais(relaisId: string): Promise<void>;
  /** La hiérarchie, avec ce que chaque division contient. `GET /admin/divisions` */
  divisions(): Promise<DivisionVue[]>;
  /** Ouvre ou ferme une zone aux relais. `PUT /admin/divisions/{id}/ouverture` */
  ouvrirZone(divisionId: string, ouverte: boolean): Promise<void>;
  /** Ajoute un quartier, une zone, une ville ou un arrondissement sous une division. `POST /admin/divisions` */
  ajouterDivision(
    parentId: string,
    genre: Valeur<'geo_kind'>,
    nom: string,
    adresse: string,
  ): Promise<string>;

  // Écoles
  /** Les domaines de formation, pour saisir ce que les photos montrent. `GET /admin/domaines` */
  domaines(): Promise<DomainePublic[]>;
  /** `GET /admin/ecoles` */
  ecoles(): Promise<EcoleVue[]>;
  /** `GET /admin/institutions` : pour rattacher un relevé à une institution connue. */
  institutions(): Promise<InstitutionVue[]>;
  /** Une école d'un coup : institution, campus, cycles, formations. `POST /admin/ecoles` */
  creerEcole(entree: EntreeCatalogue): Promise<ResultatCreation>;
  /** Une liste d'écoles, avec simulation d'abord. `POST /admin/importations` */
  importerEcoles(entrees: EntreeCatalogue[], simulation: boolean): Promise<RapportImport>;
  /** Confie un campus à un relais actif, avec ce qu'il doit vérifier. `POST /admin/ecoles/{id}/mission` */
  confierEcole(
    ecoleId: string,
    relaisId: string,
    genre: Valeur<'mission_kind'>,
    note: string | null,
  ): Promise<void>;
  reprendreEcole(ecoleId: string): Promise<void>;
  /** Corrige une fiche (brouillon, prête ou publiée) sans repasser par le relais. `PATCH /admin/ecoles/{id}` */
  modifierEcole(ecoleId: string, correction: CorrectionEcole): Promise<void>;
  /**
   * Donne la position d'un campus connu (prise sur une carte). Rend le nom de la division où elle tombe ;
   * `divisionId` quand aucun contour connu ne la contient. `PUT /admin/ecoles/{id}/position`
   */
  situerEcole(ecoleId: string, position: Point, divisionId?: string | null): Promise<string>;
  /** Un campus prêt (ou retiré) passe en ligne. `POST /admin/ecoles/{id}/publication` */
  publierEcole(ecoleId: string): Promise<void>;
  /** Tous les campus prêts d'une division et de ce qu'elle contient ; rend leur nombre. */
  publierDivision(divisionId: string): Promise<number>;
  /** Les campus prêts relevés dans un lot ; rend leur nombre. */
  publierLot(lotId: string): Promise<number>;
  /** Retirer du site, avec un motif. `POST /admin/ecoles/{id}/retrait` */
  retirerEcole(ecoleId: string, motif: Valeur<'motif_retrait'>, note: string | null): Promise<void>;
  /** Le premier campus est retiré et renvoie vers le second. */
  fusionnerEcoles(doublonId: string, gardeeId: string): Promise<void>;

  // Pont avec la direction
  /** Le badge « Vérifié » : l'accord daté de la direction, après un relevé accepté. `POST /admin/ecoles/{id}/verification` */
  enregistrerVerification(
    campusId: string,
    accordLe: string,
    fonction: Valeur<'fonction_direction'>,
    canal: 'whatsapp' | 'appel' | 'sur_place' | 'autre',
    note: string | null,
  ): Promise<void>;
  /** Note que le premier message a été envoyé (une date, jamais son contenu). */
  noterMessageEnvoye(campusId: string): Promise<void>;

  // La paie
  /** Ce qui serait payé le vendredi donné. `GET /admin/paie?vendredi=…` */
  apercuPaie(vendredi: string): Promise<LignePaie[]>;
  /** Clôture la semaine ; rend son identifiant. `POST /admin/paie` */
  cloturerPaie(vendredi: string): Promise<string>;
  semainesPaie(): Promise<SemainePaie[]>;
  paiementsDeLaSemaine(semaineId: string): Promise<PaiementVu[]>;
  /** Après l'envoi du Mobile Money : la référence de l'opération. */
  noterPaye(semaineId: string, relaisId: string, reference: string): Promise<void>;
  enregistrerMobileMoney(
    relaisId: string,
    operateur: 'mtn' | 'airtel' | 'autre',
    numero: string,
  ): Promise<void>;
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

/**
 * La base a répondu qu'elle refuse (un compte inactif, une règle non respectée) : rejouer l'envoi ne sert à rien.
 * La fiche sort de la file avec ce message, que le relais lit. `code` est celui de la base (`42501`, `23514`…),
 * ou `403` pour un refus de droits du stockage.
 */
export class ErreurRejet extends Error {
  override name = 'ErreurRejet';
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Le site public ----------------------------------------------------------------

/** Une division de la hiérarchie telle que le site la montre (pays, département, ville, arrondissement, quartier). */
export interface DivisionPublique {
  id: string;
  parentId: string | null;
  niveau: number;
  genre: Valeur<'geo_kind'>;
  nom: string;
  slug: string;
  /** Les adresses du pays à cette division (`['congo', 'pointe-noire', 'pointe-noire', 'tie-tie']`). */
  adresse: string[];
  /** Le numéro d'ordre officiel, quand il existe (« arrondissement 3 »). */
  ordinal: number | null;
  /** D'autres écritures (« Mvoumvou »), pour la recherche. */
  alias: string[];
  /** Quand la ligne a été confrontée à une source (vide : pas encore vérifiée). */
  verifieeLe: string | null;
  /** Le relevé a commencé ici (la zone est ouverte aux relais). Vaut aussi pour ce qu'elle contient. */
  ouverte: boolean;
}

/** Un domaine de formation (Informatique, Gestion, BTP, Santé…). */
export interface DomainePublic {
  slug: string;
  nom: string;
  ordre: number;
}

/** Une formation d'un cycle : série de bac, diplôme, domaine, rythme. */
export interface FormationPublique {
  cycle: Valeur<'niveau'>;
  titre: string;
  domaine: { slug: string; nom: string } | null;
  serie: Valeur<'bac_track'> | null;
  diplome: Valeur<'diploma_kind'> | null;
  rythmes: Valeur<'study_rhythm'>[];
}

/** Un campus publié, tel que le site public le montre : une implantation d'une institution. */
export interface EcolePubliee {
  /** L'identifiant du campus. */
  id: string;
  institutionId: string;
  /** La division où il est (la plus fine connue : arrondissement, quartier, ou ville sans arrondissement). */
  divisionId: string;
  /** L'adresse du campus dans sa division. */
  slug: string;
  /** Le nom de l'institution. */
  nom: string;
  /** L'implantation (« Campus de Loandjili »), quand l'institution en a plusieurs. */
  etiquette: string | null;
  /** L'adresse de l'arrondissement (ou, à défaut, de la division la plus fine) : les pages d'avant. */
  arrondissement: string;
  /** Les adresses du pays à la division du campus, sans répétition : le début de son adresse publique. */
  adresse: string[];
  /** Les noms des divisions, du pays au campus : « Congo › Pointe-Noire › Tié-Tié ». */
  divisionNoms: string[];
  quartier: string | null;
  typeEcole: Valeur<'type_ecole'>;
  /** Les cycles enseignés dans ce campus. */
  niveaux: Valeur<'niveau'>[];
  /** « Programme français-congolais, bilingue » : tel que le relais l'a lu, ou rien. */
  programme: string | null;
  formations: FormationPublique[];
  repere: string | null;
  numeroEnseigne: string | null;
  latitude: number | null;
  longitude: number | null;
  etat: Valeur<'etat_ecole'>;
  /** « Fiche vérifiée par la direction le … » : l'accord daté, quand il existe. */
  verifieeLe: string | null;
  /**
   * Le jour du relevé sur le terrain (la photo) : il ne bouge pas quand l'administration publie
   * ou corrige. Absent des fiches d'avant : la page retombe sur `misAJourLe`.
   */
  releveeLe: string | null;
  /** Le jour où l'administration l'a située, quand aucun relevé ne l'a encore décrite. */
  situeeLe: string | null;
  misAJourLe: string;
}

/** Lu à la construction du site : les pages publiques n'appellent jamais la base. */
export interface PortCatalogue {
  /** `GET /public/divisions` */
  divisions(): Promise<DivisionPublique[]>;
  /** `GET /public/ecoles` */
  ecoles(): Promise<EcolePubliee[]>;
  /** `GET /public/domaines` */
  domaines(): Promise<DomainePublic[]>;
  /** Les anciennes adresses des doublons fusionnés, et le campus qu'elles rejoignent. */
  redirections(): Promise<Redirection[]>;
}

export interface Redirection {
  de: { chemin: string[]; slug: string };
  vers: { chemin: string[]; slug: string };
}
