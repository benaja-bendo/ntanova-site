import type { Equipement, EquipementASaisir } from './equipements-ecole';
import type { FraisASaisir, FraisEcole } from './frais-ecole';
import type { AccordContactPublic, ContactPublic } from './contact-public';
import type { AgrementASaisir, AgrementEnregistre, AgrementPublic } from './agrement';
import type { DateInscription, DateInscriptionASaisir } from './inscriptions';
import type { AccordMotDirection, MotDirection } from './mot-direction';
/**
 * Les contrats entre les écrans et le serveur. Les écrans n'appellent que ces
 * ports ; src/infra/ les branche sur Supabase aujourd'hui, sur un serveur REST
 * demain. Chaque opération porte en commentaire la route qu'elle deviendra.
 */
import type { Valeur } from './listes';
import type { MultiPolygone, Point } from './geo';
import type { LigneJournal } from './sante';

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
  /** v2 (13/11) : le sigle, l'école (institution) et son nombre de sites, pour « Déjà sur NTanova ? ». */
  sigle?: string | null;
  institutionId?: string | null;
  sites?: number;
}

/** v2 (13/11) : la liste nationale légère des écoles, gardée par le téléphone pour « Même nom, ailleurs ». */
export interface EcoleDuPays {
  id: string;
  nom: string;
  sigle: string | null;
  ville: string | null;
  sites: number;
}

/**
 * Ce que le relais relit de ses relevés : tout ce qu'ils contiennent (de quoi corriger sans tout ressaisir), jamais
 * le contact de la direction ni le chemin d'une photo.
 *
 * Les niveaux et le type sont dits tels que la base les a : une valeur que ce téléphone ne connaît pas encore est
 * possible, et la correction ne reprend que ce qu'il connaît. Le téléphone garde ces lignes : celles d'avant la
 * mise à jour n'ont pas les derniers champs, et se relisent avec des valeurs par défaut.
 */
export interface ReleveRecu {
  id: string;
  type: Valeur<'type_releve'>;
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
  niveaux: string[];
  typeEcole: string;
  programme: string | null;
  /** Les séries ou filières lues sur l'enseigne, et si elles sont en photo. */
  programmesVus: string | null;
  programmesEnPhoto: boolean;
  /** Les séries et filières que le relais avait cochées. Absent d'une lecture d'avant le 09/11/2026 : lu comme une liste vide. */
  formationsVues?: FormationSaisie[];
  repere: string | null;
  numeroEnseigne: string | null;
  position: Point | null;
  precisionM: number | null;
  /** Les rôles des photos arrivées chez NTanova (jamais leur chemin). */
  photos: Valeur<'photo_role'>[];
  /**
   * Le contact de la direction est arrivé chez NTanova (sans le lire). Il reste attaché à la fiche qui l'a reçu : une
   * correction n'a le sien que si le relais l'a redonné.
   */
  aContact: boolean;
  /**
   * La fiche que celle-ci corrige, quand c'en est une correction : de quoi suivre la chaîne jusqu'à la fiche qui porte
   * le contact (ticket #94). Absent des lignes gardées avant la mise à jour du téléphone.
   */
  corrigeReleveId?: string | null;
}

/**
 * Une photo que NTanova a reçue pour une fiche du relais, à relire (ticket #72). `url` est une adresse de lecture
 * temporaire (une heure) : elle ne se garde jamais, ni dans le téléphone ni dans la base.
 */
export interface PhotoRecue {
  id: string;
  role: Valeur<'photo_role'>;
  url: string;
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

/**
 * Une photo dont les octets sont déjà lus en mémoire : ce sont eux qui partent, jamais le fichier de la base du téléphone
 * (ticket #74 : un fichier relu dans IndexedDB et envoyé en multipart échoue sur iPhone, sans qu'une requête parte).
 */
export interface PhotoPrete extends PhotoAEnvoyer {
  contenu: ArrayBuffer;
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
  /**
   * Les séries et filières cochées sur place (puces) : elles préremplissent « À valider », rien ne se publie seul.
   * Seulement celles d'un niveau coché qui en annonce.
   */
  formationsVues: FormationSaisie[];
  repere: string | null;
  numeroEnseigne: string | null;
  direction: Valeur<'direction_vue'> | null;
  repasser: string | null;
  /** v2 (13/11) : le sigle, la remarque du relais, le bonus (vu sur place, clôture), l'école dont c'est « un autre site ». */
  sigle?: string | null;
  remarque?: string | null;
  vusSurPlace?: Valeur<'equipment_key'>[];
  cloture?: 'oui' | 'non' | null;
  autreSiteDe?: string | null;
}

export interface ContactAEnvoyer {
  releveId: string;
  /**
   * L'identifiant de la personne, créé sur le téléphone, pour une personne en plus de la direction (ticket #96) :
   * l'envoi se rejoue sans doublon. Absent pour la direction, dont l'identifiant est le numéro de la fiche.
   */
  contactId?: string;
  /** « Autre : … » : de quoi il s'agit, quand la fonction est « autre ». */
  precisionFonction?: string | null;
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
  /** La position que NTanova connaît de l'école, quand elle en a une. */
  position: Point | null;
  /** « relevee » ou « verifiee » : un relevé ne modifie plus une école vérifiée par la direction. */
  etatVerification: string;
  /** Les rôles des photos que NTanova a déjà de l'école (jamais leur chemin). */
  photos: Valeur<'photo_role'>[];
  /** Le contact de la direction est déjà confirmé. */
  contactConfirme: boolean;
  /**
   * v2 (13/11) : la mission elle-même, quand NTanova l'a écrite (« Compléter ») : son identifiant, ce qu'il faut faire et
   * pourquoi, la date limite, et le montant fixé par NTanova en la confiant. Absents d'une mission d'avant.
   */
  missionId?: string | null;
  tache?: string | null;
  raison?: string | null;
  avantLe?: string | null;
  paieXaf?: number | null;
}

/**
 * Une ligne de « Ma paie » : l'acquis du prochain vendredi, ou une semaine close. Le calcul est fait par la base (les
 * mêmes règles que l'administration) ; ici, rien que de l'affichage.
 */
export interface LigneDeMaPaie {
  /** Le vendredi de paie (AAAA-MM-JJ). */
  vendredi: string;
  /** `acquis` : pas encore clos ; `a_payer` : clos, pas encore payé ; `paye` : payé, avec la référence. */
  etat: 'acquis' | 'a_payer' | 'paye';
  fiches: number;
  contacts: number;
  /** 1 quand l'essai (trois fiches validées) est dû. */
  essais: number;
  /** v2 (13/11) : les missions faites, payées à leur montant (la fiche qui les ferme n'est pas payée en plus). */
  missions?: number;
  totalXaf: number;
  /** Fiches acceptées mais non payables (une école déjà relevée par un autre relais). */
  nonPayables: number;
  payeLe: string | null;
  reference: string | null;
}

/** La paie du relais connecté, en lecture seule : jamais le numéro Mobile Money, seulement si NTanova l'a. */
export interface MaPaie {
  /** L'acquis du prochain vendredi, toujours une ligne (même à zéro). */
  acquis: LigneDeMaPaie;
  /** Les semaines closes, la plus récente d'abord. */
  historique: LigneDeMaPaie[];
  /** NTanova a-t-elle le numéro Mobile Money du relais ? */
  numeroConnu: boolean;
}

export interface PortRelais {
  /** `GET /moi` */
  monProfil(): Promise<Profil>;
  /** `GET /moi/lot` */
  monLot(): Promise<Lot | null>;
  /**
   * Les écoles connues des zones ouvertes aux relais et du secteur du relais, s'il en a un (campus et relevés pas
   * encore acceptés, de tous les relais) : nom et position, pour que l'alerte « doublon possible à moins de 40 m »
   * marche sans réseau, où que le relais se trouve. `GET /moi/lieux-connus`
   */
  lieuxConnus(): Promise<EcoleProche[]>;
  /** v2 (13/11) : `GET /moi/ecoles-du-pays`, la liste nationale légère (nom, sigle, ville, sites). */
  ecolesDuPays(): Promise<EcoleDuPays[]>;
  /**
   * Le nom des zones ouvertes aux relais, par ordre alphabétique : de quoi dire où relever à un relais qui n'a pas
   * de secteur. `GET /zones-ouvertes`
   */
  zonesOuvertes(): Promise<string[]>;
  /** `GET /moi/releves` */
  mesReleves(): Promise<ReleveRecu[]>;
  /**
   * Les photos que NTanova a reçues pour une de ses fiches, avec une adresse de lecture temporaire : de quoi montrer
   * au relais qui corrige ce qui est déjà chez NTanova. Liste vide quand la base ne les lui laisse pas relire (règle
   * pas encore appliquée) : l'écran dit alors seulement quels rôles sont arrivés. `GET /moi/releves/{id}/photos`
   */
  mesPhotos(releveId: string): Promise<PhotoRecue[]>;
  /** Les écoles confiées au relais (ses missions ouvertes). `GET /moi/missions` */
  mesMissions(): Promise<EcoleACompleter[]>;
  /** v2 (13/11) : `POST /moi/missions/{id}/pas-pu`, « Je n'ai pas pu » : la mission se ferme sans paie, avec son motif. */
  missionPasPu(
    missionId: string,
    motif: Valeur<'mission_blocker'>,
    note: string | null,
  ): Promise<void>;
  /** Sa paie : ce qui lui est acquis, et les semaines closes. `GET /moi/paie` */
  maPaie(): Promise<MaPaie>;
  /** `POST /releves` */
  envoyerReleve(releve: ReleveAEnvoyer): Promise<Reponse>;
  /** Dépose le fichier au chemin `<relevé>/<photo>.<webp|jpg>`, puis l'enregistre. `PUT /photos/{releve}/{photo}` */
  envoyerPhoto(releveId: string, photo: PhotoPrete): Promise<Reponse>;
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
  /** Plus de 50 m du secteur du relais : une information, jamais un refus ni une condition de paie. */
  horsLot: boolean | null;
  /**
   * La position est-elle dans une zone ouverte aux relais ? Une information. Nul quand la base ne sait pas :
   * pas de position, ou aucun contour connu ne la contient (« zone inconnue » n'est pas « hors zone »).
   */
  enZoneOuverte: boolean | null;
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
/**
 * La vue d'ensemble de l'administration (ticket #76) : où en est le relevé, en nombres. Aucun seuil ni objectif : le
 * fondateur compare.
 */
export interface VueEnsemble {
  /** Quand la base a calculé la vue. */
  generee: string;
  aValider: { nombre: number; plusAncienneLe: string | null; depuisPlusDe24h: number };
  /** Les jours les plus anciens d'abord, les jours sans relevé compris ; le lot d'essai à part (à l'heure de Pointe-Noire). */
  recusParJour: { jour: string; total: number; essai: number }[];
  /** Sur les 30 derniers jours : les décisions rendues et le délai moyen entre la réception et la décision. */
  decisions: { nombre: number; delaiMoyenHeures: number | null };
  /** Sur les 30 derniers jours : les nouvelles fiches, et combien sont arrivées avec la photo de l'enseigne. */
  enseigne: { avecPhoto: number; total: number };
  contacts: { confirmesTotal: number; confirmes7j: number };
  /** « A envoyé une fiche » : la dernière ouverture de l'application n'est enregistrée nulle part. */
  relais: { actifs: number; enAttente: number; suspendus: number; ontEnvoye7j: number };
}

export interface DetailReleve extends ReleveAValider {
  /** Valeurs retenues par l’administration à l’acceptation ; le relevé original reste intact. */
  revision?: { valeurs: CorrectionEcole; le: string; auteur: string } | null;
  /** Le relais qui l'a envoyé : de quoi lire ce que son téléphone a signalé (ticket #77). */
  relaisId: string;
  /**
   * Vrai : cette correction corrige une fiche qui n'a pas encore d'école (renvoyée « à corriger », jamais acceptée). Elle se
   * traite comme une nouvelle fiche ; `position`, `divisionId` et `lot` sont alors ceux de la fiche d'origine quand la
   * correction n'a pas les siens (ticket #89).
   */
  corrigeUneFicheEnAttente: boolean;
  /** Vrai : `position` est celle de la fiche d'origine (la correction n'en a pas). */
  positionDeLaFicheDOrigine: boolean;
  /**
   * Vrai : `lot` est celui de la fiche d'origine, pas de la correction, qui n'en a pas (ticket #95). L'écran ne le montre
   * pas comme celui de la correction.
   */
  lotDeLaFicheDOrigine: boolean;
  prisLe: string;
  position: Point | null;
  /** La division que dit la position (la plus fine dont le contour la contient) ; nulle si aucun contour connu. */
  divisionId: string | null;
  niveaux: Valeur<'niveau'>[];
  typeEcole: Valeur<'type_ecole'>;
  programme: string | null;
  /** Les séries ou filières que le relais a lues sur l'enseigne. */
  programmesVus: string | null;
  programmesEnPhoto: boolean;
  /** Ce que le relais a coché sur place : préremplit les formations de l'acceptation, que l'administration corrige. */
  formationsVues: FormationSaisie[];
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
  /** v2 (13/11) : le sigle, la remarque du relais, son bonus, et l'école dont il dit que c'est « un autre site ». */
  sigle?: string | null;
  remarque?: string | null;
  vusSurPlace?: Valeur<'equipment_key'>[];
  cloture?: 'oui' | 'non' | null;
  autreSiteDe?: string | null;
}

/** v2 (13/11) : un équipement du bonus que l'administration garde, comme fait du terrain (« vu », ou la clôture absente). */
export interface FaitGarde {
  cle: Valeur<'equipment_key'>;
  etat: 'present' | 'absent';
}

/** Une photo d'un relevé, avec une adresse temporaire pour la voir (jamais publique d'office). */
export interface PhotoVue {
  publique?: boolean;
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
  /** v2 (13/11) : les équipements du bonus que l'administration garde ; jamais un équipement que le relais n'a pas vu. */
  faits?: FaitGarde[];
  /** Corrections explicites d’une nouvelle école, appliquées dans la même transaction que l’acceptation. */
  corrections?: CorrectionEcole;
  mode?: ModeAcceptation;
  campusId?: string | null;
  institutionId?: string | null;
  etiquette?: string | null;
  formations?: FormationSaisie[];
  /**
   * La division de l'école, choisie par l'administration (une ville, un arrondissement ou un quartier). Elle l'emporte
   * sur celle que dit la position, et elle est obligatoire quand aucun contour connu ne contient la position : la fiche
   * ne retombe plus sur la division du lot du relais (ticket n° 67).
   */
  divisionId?: string | null;
  /**
   * La position de l'école, saisie par l'administration quand la fiche n'en a pas (le téléphone du relais n'a pas pu la
   * mesurer, ticket 144). Jamais pour une fiche qui a déjà la sienne : celle du relais fait foi. La base garde qui l'a posée
   * et quand ; la division est celle du contour qui la contient, sinon `divisionId`.
   */
  position?: Point | null;
}

/**
 * Une personne à contacter pour une fiche (ticket #96) : la direction, un secrétariat, un propriétaire, un enseignant…
 * Une fiche en a trois au plus. Privée : jamais publiée, jamais relue par le relais.
 */
export interface ContactDirection {
  /** L'identifiant de la personne. Pour celle d'un téléphone d'avant, c'est le numéro de sa fiche. */
  id: string;
  fonction: Valeur<'fonction_direction'> | null;
  /** « Autre : … » : de quoi il s'agit (propriétaire, enseignant…). Nul pour une autre fonction. */
  precisionFonction: string | null;
  /** Qui l'a notée : le relais sur place, ou l'administration (un numéro reçu par WhatsApp, par exemple). */
  source: 'relais' | 'administration';
  nom: string | null;
  whatsapp: string | null;
  accord: boolean;
  accordLe: string | null;
  note: string | null;
  recuLe: string;
  /**
   * La fiche qui porte ce contact : celle qu'on regarde, ou la fiche qu'elle corrige quand le contact est arrivé avec
   * elle (ticket #94). C'est de cette fiche-là que le contact s'efface.
   */
  releveId?: string;
}

/** Ce que l'administration saisit pour une personne qu'elle ajoute ou corrige. Le numéro est déjà au format de la base. */
export interface ContactASaisir {
  fonction: Valeur<'fonction_direction'> | null;
  precisionFonction: string | null;
  nom: string | null;
  whatsapp: string | null;
  accord: boolean;
  note: string | null;
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
  /**
   * L'adresse de connexion du relais (ticket #78), pour relier un compte « à activer » à la personne. Gardée dans la
   * partie privée ; nulle quand la base ne la connaît pas (un compte d'avant, ou une base pas encore à jour).
   */
  email: string | null;
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
  /** Le jour où l'administration l'a déclaré terminé, s'il l'est. */
  renduLe: string | null;
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
  /** Les autres écritures du nom (« Mvoumvou »), pour la recherche ; jamais affichées comme nom. */
  aliases: string[];
  slug: string;
  chemin: string;
  /** Les relais peuvent-ils relever ici ? */
  ouverte: boolean;
  /**
   * Ce que la carte du site dit aux familles de cette zone : « actif » (relevé en cours), « programme » (déploiement
   * programmé), rien (pas encore couverte). **Distinct de `ouverte`** (ticket 102) : l'administration le règle ici,
   * à part.
   */
  deploiement: 'actif' | 'programme' | null;
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

/** Ce que la suppression définitive d'une école emporterait : lu avant de demander la confirmation. */
export interface ApercuSuppression {
  nom: string;
  /** Pourquoi on ne peut pas supprimer maintenant ; nul quand rien ne bloque. */
  bloque: string | null;
  fiches: number;
  photos: number;
  contacts: number;
}

export interface EcoleVue {
  equipements?: Equipement[];
  frais?: FraisEcole[];
  contactPublic?: ContactPublic | null;
  agrements?: AgrementEnregistre[];
  motDirection?: MotDirection | null;
  inscriptions?: DateInscription[];
  /** Les filières de l'école, pour rattacher un agrément à l'une d'elles. */
  filieres?: { id: string; titre: string }[];
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
  declareeLe?: string | null;
  /** Pour un campus retiré : pourquoi, quand, et vers quel campus un doublon renvoie. */
  retrait: {
    motif: Valeur<'motif_retrait'>;
    le: string;
    note: string | null;
    remplaceePar: string | null;
  } | null;
  /** À la corbeille depuis quand : l'école a disparu des listes, du site et des statistiques, mais se restaure. */
  corbeille: { le: string } | null;
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
  /** v2 (13/11) : le sigle de l'école, qui remplit celui de la nouvelle école. */
  sigle?: string | null;
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
  /** Les enseignes et façades des relevés acceptés de l'école : les seules photos qui peuvent paraître sur sa fiche. */
  photosEcole(id: string): Promise<PhotoVue[]>;
  /** v2 (13/11) : les photos de travail d'une école (prospectus, programmes, affiche), pour lire les frais. Jamais publiques. */
  photosDeTravail(id: string): Promise<PhotoVue[]>;
  /**
   * Comment la photo de l'école est décidée (repli automatique, choix prioritaire ou retrait explicite) et laquelle la vue
   * publique retient. Lecture seule. `GET /admin/ecoles/{id}/photo-publique`
   */
  etatPhotoPublique(ecoleId: string): Promise<import('./photos-publiques').EtatPhotoPublique>;
  /**
   * Choisir une photo (prioritaire, avec confirmation du contrôle) ou **retirer** : `photoId` nul écrit un retrait explicite
   * qui bloque aussi le repli automatique. Jamais un simple retrait du contrôle d'une photo, qui ferait paraître une autre.
   * `PUT /admin/ecoles/{id}/photo-publique`
   */
  choisirPhotoPublique(ecoleId: string, photoId: string | null, confirme: boolean): Promise<void>;
  /**
   * Les personnes à contacter pour un relevé, la première reçue d'abord (vide : aucune). Elles restent attachées à la
   * fiche qui les a reçues : celles d'une fiche qu'on corrige se lisent sur sa correction (ticket #94).
   * `GET /admin/releves/{id}/contacts`
   */
  contactsReleve(id: string): Promise<ContactDirection[]>;
  /** Note une personne de plus sur la fiche (trois au plus). Rend son identifiant. `POST /admin/releves/{id}/contacts` */
  ajouterContact(releveId: string, contact: ContactASaisir): Promise<string>;
  /** Corrige une personne : tous ses champs sont redonnés. `PUT /admin/contacts/{id}` */
  corrigerContact(contactId: string, contact: ContactASaisir): Promise<void>;
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
  /** Droit d'effacement : UNE personne à contacter. `DELETE /admin/contacts/{id}` */
  effacerContact(contactId: string, note: string | null): Promise<void>;
  /** Efface une photo ; l'application supprime ensuite le fichier du stockage. */
  effacerPhoto(photoId: string, note: string | null): Promise<void>;
  /** La photo est-elle publiable (sans enfant, sans donnée personnelle) ? */
  marquerPhotoPubliable(photoId: string, publiable: boolean): Promise<void>;

  // Relais, lots, zones
  /** `GET /admin/relais` */
  relais(): Promise<RelaisVu[]>;
  /**
   * `GET /admin/erreurs?depuis=` : le journal des téléphones (ticket #77), le plus récent d'abord, avec le prénom du
   * relais. `depuis` est une date ISO ; `null` lit tout le journal. `relaisId` ne garde que celui d'un relais.
   */
  erreursRecentes(depuis: string | null, relaisId?: string): Promise<LigneJournal[]>;
  /** `GET /admin/vue-ensemble?jours=` : où en est le relevé, en nombres (ticket #76). 14 jours par défaut, 90 au plus. */
  vueEnsemble(jours?: number): Promise<VueEnsemble>;
  /**
   * Combien d'écoles sont prêtes (acceptées, pas encore publiées) : le compteur de l'onglet « Écoles ». Un seul nombre, lu
   * sans charger la liste : il se rafraîchit toutes les minutes (audit du 06/11/2026).
   */
  ecolesPretes(): Promise<number>;
  /** `GET /admin/lots` */
  lots(): Promise<LotVu[]>;
  /** Un lot sur n'importe quelle ville, arrondissement ou quartier. `POST /admin/lots` */
  creerLot(
    nom: string,
    divisionId: string,
    aRendreLe: string | null,
    essai: boolean,
  ): Promise<string>;
  /** Marque un lot rendu à la date du jour, ou le remet en cours (`rendu` faux). `PUT /admin/lots/{id}/rendu` */
  marquerLotRendu(lotId: string, rendu: boolean): Promise<void>;
  /** `POST /admin/relais/{id}/activation` */
  /** Sans lot (`null`), le relais relève où il se trouve : les zones ouvertes sont sa limite. */
  activerRelais(relaisId: string, lotId: string | null): Promise<void>;
  suspendreRelais(relaisId: string): Promise<void>;
  /** La hiérarchie, avec ce que chaque division contient. `GET /admin/divisions` */
  divisions(): Promise<DivisionVue[]>;
  /** Ouvre ou ferme une zone aux relais. `PUT /admin/divisions/{id}/ouverture` */
  ouvrirZone(divisionId: string, ouverte: boolean): Promise<void>;
  /**
   * Règle ce que la carte du site dit d'une zone : relevé en cours, déploiement programmé, ou rien (pas encore couverte).
   * Ne touche jamais à l'ouverture aux relais. `set_division_public_status`
   */
  etatPublicZone(divisionId: string, etat: 'actif' | 'programme' | null): Promise<void>;
  /** Ajoute un quartier, une zone, une ville ou un arrondissement sous une division. `POST /admin/divisions` */
  ajouterDivision(
    parentId: string,
    genre: Valeur<'geo_kind'>,
    nom: string,
    adresse: string,
  ): Promise<string>;
  /**
   * Change le nom d'une zone et la liste de ses autres écritures. Son adresse, son parent et son niveau ne changent jamais
   * (ils sont dans des liens publics). Refuse un nom déjà pris sous le même parent. `rename_division`
   */
  renommerDivision(divisionId: string, nom: string, aliases: string[]): Promise<void>;
  /**
   * Supprime une zone qui ne contient plus rien : ni sous-zone, ni école (corbeille comprise), ni relevé, ni lot, et qui n'a
   * ni contour, ni état sur la carte, ni ouverture aux relais. Définitif. `delete_division`
   */
  supprimerDivision(divisionId: string): Promise<void>;

  // Écoles
  /** Les domaines de formation, pour saisir ce que les photos montrent. `GET /admin/domaines` */
  domaines(): Promise<DomainePublic[]>;
  /** `GET /admin/ecoles` */
  ecoles(): Promise<EcoleVue[]>;
  /** `GET /admin/institutions` : pour rattacher un relevé à une institution connue. */
  institutions(): Promise<InstitutionVue[]>;
  /**
   * v2 (13/11) : « C'est un site de… » : le site rejoint une autre école ; son adresse publique ne change pas. L'école quittée,
   * sans autre site, lui donne ce qui lui manque (sigle, année, site web, logo, mot) puis est supprimée. Refusé quand les
   * deux écoles ont un logo ou un mot : on retire d'abord celui qui ne vaut plus. `POST /admin/ecoles/{id}/rattachement`
   */
  rattacherSite(campusId: string, institutionId: string): Promise<{ ancienneSupprimee: boolean }>;
  /** v2 (13/11) : les nouvelles d'un site. `GET /admin/ecoles/{id}/nouvelles` */
  nouvellesDeLEcole(ecoleId: string): Promise<import('./fiche-admin').NouvelleAdmin[]>;
  /** v2 : publie une nouvelle, avec l'accord daté de l'école. `POST /admin/ecoles/{id}/nouvelles` */
  publierNouvelle(ecoleId: string, n: import('./fiche-admin').NouvelleASaisir): Promise<string>;
  /** v2 : `DELETE /admin/nouvelles/{id}` (gardée au journal, retirée de la page) */
  retirerNouvelle(id: string): Promise<void>;
  /** v2 : l'admission d'un site du supérieur, la plus récente. `GET /admin/ecoles/{id}/admission` */
  admissionDeLEcole(ecoleId: string): Promise<import('./fiche-admin').AdmissionASaisir | null>;
  /** v2 : `PUT /admin/ecoles/{id}/admission` */
  enregistrerAdmission(ecoleId: string, a: import('./fiche-admin').AdmissionASaisir): Promise<void>;
  /** Une école d'un coup : institution, campus, cycles, formations. `POST /admin/ecoles` */
  creerEcole(
    entree: EntreeCatalogue,
    declaration?: import('./declaration-ecole').DeclarationEcole,
  ): Promise<ResultatCreation>;
  /** Une liste d'écoles, avec simulation d'abord. `POST /admin/importations` */
  importerEcoles(entrees: EntreeCatalogue[], simulation: boolean): Promise<RapportImport>;
  /** Confie un campus à un relais actif, avec ce qu'il doit vérifier. `POST /admin/ecoles/{id}/mission` */
  confierEcole(
    ecoleId: string,
    relaisId: string,
    genre: Valeur<'mission_kind'>,
    note: string | null,
    details?: import('./fiche-admin').DetailsMission,
  ): Promise<void>;
  /** v2 (13/11) : ce qui manque au site et qui peut le donner. `GET /admin/ecoles/{id}/manques` */
  manquesDeLEcole(ecoleId: string): Promise<import('./fiche-admin').Manque[]>;
  /** v2 : note « demandé à l'école le … ». `POST /admin/ecoles/{id}/demandes` */
  demanderALEcole(
    ecoleId: string,
    sujet: Valeur<'request_topic'>,
    detail: string | null,
  ): Promise<string>;
  /** v2 : une demande obtenue ou annulée. `PATCH /admin/demandes/{id}` */
  fermerDemande(demandeId: string, etat: 'obtenue' | 'annulee'): Promise<void>;
  /** v2 : les images de l'école (logo, couverture, galerie), publiques ou non. `GET /admin/ecoles/{id}/medias` */
  mediasDeLEcole(ecoleId: string): Promise<import('./fiche-admin').MediaAdmin[]>;
  /** v2 : ajoute une image (un fichier réduit dans le navigateur, ou une photo d'un relevé). `POST /admin/ecoles/{id}/medias` */
  ajouterMedia(ecoleId: string, media: import('./fiche-admin').NouveauMedia): Promise<string>;
  /** v2 : la légende, le contrôle « sans enfant », la publication. `PATCH /admin/medias/{id}` */
  modifierMedia(
    mediaId: string,
    champs: { legende?: string | null; controle?: boolean; publique?: boolean },
  ): Promise<void>;
  /** v2 : retire une image ; ses fichiers envoyés sont effacés du stockage. `DELETE /admin/medias/{id}` */
  retirerMedia(mediaId: string): Promise<void>;
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
  /**
   * L'école quitte les listes, le site, les statistiques et les missions, mais se restaure (audit du 06/11/2026). Un
   * retrait ne cache rien aux listes de l'administration : la corbeille, si.
   */
  mettreALaCorbeille(
    ecoleId: string,
    motif: Valeur<'motif_retrait'>,
    note: string | null,
  ): Promise<void>;
  /** Une école de la corbeille revient : « retirée » si elle l'était, sinon « prête » (jamais « publiée » toute seule). */
  restaurerEcole(ecoleId: string): Promise<void>;
  /** Ce que la suppression définitive emporterait, et ce qui la bloque. Ne supprime rien. */
  apercuSuppression(ecoleId: string): Promise<ApercuSuppression>;
  /**
   * Efface l'école, ses fiches, ses photos (fichiers compris), ses contacts, ses frais et ses faits ; laisse une trace.
   * Exige la corbeille d'abord ; refuse si une fiche est payée, si un envoi attend ou si une fusion y renvoie.
   */
  supprimerDefinitivement(ecoleId: string): Promise<void>;
  /** Le premier campus est retiré et renvoie vers le second. */
  fusionnerEcoles(doublonId: string, gardeeId: string): Promise<void>;

  /** Accord explicite de publication du contact ; null retire le contact public. Ne touche pas au privé ni au badge. */
  enregistrerContactPublic(ecoleId: string, contact: AccordContactPublic | null): Promise<void>;
  enregistrerFraisEcole(ecoleId: string, frais: FraisASaisir, id: string | null): Promise<string>;
  retirerFraisEcole(ecoleId: string, id: string): Promise<void>;
  /** Ajoute ou remplace l'agrément de l'établissement ou d'une filière : une ligne par école et par filière. */
  enregistrerAgrement(ecoleId: string, agrement: AgrementASaisir): Promise<string>;
  retirerAgrement(id: string): Promise<void>;
  /** `mot` nul : le retrait. */
  enregistrerMotDirection(ecoleId: string, mot: AccordMotDirection | null): Promise<void>;
  enregistrerDateInscription(
    ecoleId: string,
    date: DateInscriptionASaisir,
    id: string | null,
  ): Promise<string>;
  retirerDateInscription(ecoleId: string, id: string): Promise<void>;
  enregistrerEquipement(
    ecoleId: string,
    equipement: EquipementASaisir,
    id: string | null,
  ): Promise<string>;
  retirerEquipement(ecoleId: string, id: string): Promise<void>;

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
  /**
   * L'état public de la zone sur la carte (ticket 102) : « actif » (relevé en cours), « programme » (déploiement
   * programmé), rien (non couverte). **Distinct de `ouverte`** : l'un règle les relais, l'autre ce que la carte dit.
   */
  deploiement: 'actif' | 'programme' | null;
  /** Le point d'une ville ou d'une zone, quand il est connu et sourcé (jamais inventé). */
  position: Point | null;
  /**
   * Le contour de la zone, quand la base le connaît (OpenStreetMap, simplifié, sourcé ; jamais inventé) : la carte le
   * dessine. Pointe-Noire et Brazzaville aujourd'hui (ticket 113).
   */
  contour: MultiPolygone | null;
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
  /** La référence officielle de cette filière, quand l'administration l'a saisie. */
  agrement?: AgrementPublic | null;
  /** v2 (13/11) : l'identifiant de la formation (ses frais s'y rattachent) et son détail, dit par l'école. */
  id?: string;
  dureeAnnees?: number | null;
  niveauDemande?: string | null;
  selection?: Valeur<'selection_kind'> | null;
  fraisDossier?: number | null;
  delivrePar?: string | null;
}

/** Un campus publié, tel que le site public le montre : une implantation d'une institution. */
export interface EcolePubliee {
  photo?: import('./photos-publiques').PhotoPublique | null;
  /** v2 (13/11) : ce qui est commun à l'école (tous ses sites) et le profil du site, dits par l'école. */
  sigle?: string | null;
  fondeeEn?: number | null;
  siteWeb?: string | null;
  horaires?: Valeur<'study_shift'>[];
  langues?: Valeur<'teaching_language'>[];
  /** Le logo (de l'école), la couverture et la galerie (du site) : seulement les images publiques, contrôlées. */
  medias?: import('./vitrine').MediasEcole;
  nouvelles?: import('./vitrine').NouvellePublique[];
  admission?: import('./vitrine').AdmissionPublique | null;
  /** La référence officielle de l'établissement, quand l'administration l'a saisie. */
  agrement?: AgrementPublic | null;
  /** Le mot de la direction : seulement sur une fiche confirmée. */
  motDirection?: MotDirection | null;
  inscriptions?: DateInscription[];
  origine?: string;
  declareeLe?: string | null;
  equipements?: Equipement[];
  frais?: FraisEcole[];
  contactPublic?: ContactPublic | null;
  /** L'identifiant du campus. */
  id: string;
  institutionId: string;
  /** La division où il est (la plus fine connue : arrondissement, quartier, ou ville sans arrondissement). */
  divisionId: string;
  /** L'adresse du campus dans sa division : le nom dans l'adresse de sa fiche. */
  slug: string;
  /**
   * L'identifiant NTanova (ticket 147) : six chiffres tirés par la base, jamais changés, jamais réutilisés. La fiche vit
   * à `/ecoles/<slug>-<numero>/`, le lien court `/ecoles/<numero>/` y renvoie.
   */
  numero: string;
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
  lirePhotoPublique?(id: string): Promise<Uint8Array>;
  /** v2 (13/11) : les octets d'une image publique ; `miniature` lit la miniature quand l'administration en a posé une. */
  lireMedia?(id: string, miniature: boolean): Promise<Uint8Array>;
  /** `GET /public/divisions` */
  divisions(): Promise<DivisionPublique[]>;
  /** `GET /public/ecoles` */
  ecoles(): Promise<EcolePubliee[]>;
  /** `GET /public/domaines` */
  domaines(): Promise<DomainePublic[]>;
  /** Les anciennes adresses des doublons fusionnés, et le campus qu'elles rejoignent. */
  redirections(): Promise<Redirection[]>;
  /** Les anciennes adresses des fiches publiées (renommées ou déplacées), ticket 147. */
  anciennesAdresses(): Promise<AncienneAdresse[]>;
}

/** Une adresse qui a été celle d'une fiche : sa division d'alors (du pays à elle, sans répétition), son nom, son numéro. */
export interface AncienneAdresse {
  chemin: string[];
  slug: string;
  numero: string;
}

/** Un doublon fusionné : son ancienne adresse (et son propre numéro) mènent à la fiche gardée. */
export interface Redirection {
  de: AncienneAdresse;
  versNumero: string;
}
