import { photoExemple, photoExempleAdresse } from './photo-exemple';
import { jourDuCongo } from '../../modele/date-declaration';
import type {
  AdmissionASaisir,
  AutorisationFormation,
  DetailsFormation,
  DetailsMission,
  Manque,
  MediaAdmin,
  NouvelleAdmin,
} from '../../modele/fiche-admin';
import {
  detailsVides,
  erreurDeLaFiche,
  erreurDesDetails,
  sansDetail,
  verdictDeProximite,
} from '../../modele/fiche-admin';
import { noyauDuNom, ressemblance } from '../../modele/deja-sur-ntanova';
import { erreursFormulaireEcole, formulaireDe } from '../../modele/correction-ecole';
import { erreursDeclaration } from '../../modele/declaration-ecole';
import {
  lireEquipement,
  saisieDeEquipement,
  type Equipement,
} from '../../modele/equipements-ecole';
import {
  erreurDuOui,
  etatDuOui,
  ligneChangee,
  lireFraisEcole,
  saisieDeFrais,
  type FraisEcole,
} from '../../modele/frais-ecole';
import {
  finDeLAnnonce,
  lireEffectif,
  lirePlaces,
  saisieDEffectif,
  saisieDePlaces,
  type EffectifClasse,
  type PlacesAnnoncees,
} from '../../modele/places-effectifs';
import type { DemandeFamille } from '../../modele/demandes-familles';
import { lireAccordContactPublic, type ContactPublic } from '../../modele/contact-public';
import { lireAgrement, type AgrementEnregistre } from '../../modele/agrement';
import { lireDateInscription, type DateInscription } from '../../modele/inscriptions';
import { lireMotDirection, type MotDirection } from '../../modele/mot-direction';
/**
 * Un faux serveur, gardé dans le navigateur, pour les parcours Playwright
 * (`PUBLIC_ADAPTATEUR=faux`). Il répond comme la base : « reçu », « déjà reçu »,
 * et refuse tout quand le navigateur est hors ligne. Jamais en ligne.
 *
 * Il rejoue les règles de la base (supabase/migrations) en plus petit : l'acceptation d'un relevé en
 * institution, campus ou cycle, l'importation avec simulation, les lots sur toute division, la paie.
 * Son état vit dans `localStorage` : c'est le serveur qui est imité, pas le téléphone (la base du
 * téléphone, elle, est dans IndexedDB).
 */
import type { Adaptateurs } from '../index';
import { arrondissementDeLaPosition } from '../../modele/carte/plan';
import { heriterDeLOrigine } from '../../modele/acceptation';
import { peutParaitreSurLeSite, type EtatPhotoPublique } from '../../modele/photos-publiques';
import { distanceMetres, type Point } from '../../modele/geo';
import { messageManquant } from '../../modele/decision';
import { niveauxConnus, typeConnu, type Valeur } from '../../modele/listes';
import { jourABrazzaville, prochainVendredi } from '../../modele/paie';
import { etatDesPlanches } from './scenario-planches';
import { etatDesPlanchesAdmin } from './scenario-admin';
import {
  ErreurDecision,
  ErreurRejet,
  ErreurReseau,
  type ContactAEnvoyer,
  type DecisionAcceptation,
  type DivisionVue,
  type EcoleVue,
  type EntreeCatalogue,
  type ErreurAEnvoyer,
  type FormationSaisie,
  type PortAdministration,
  type PortRelais,
  type PortSession,
  type Profil,
  type RapportImport,
  type ReleveAEnvoyer,
  type Reponse,
} from '../../modele/ports';

const CLE = 'ntanova-faux-serveur';

interface Decision {
  revision?: import('../../modele/ports').DetailReleve['revision'];
  statut: Valeur<'statut_releve'>;
  motif: Valeur<'motif_decision'> | null;
  message: string | null;
  ecoleId: string | null;
  contactConfirmeLe: string | null;
  contactFonction: Valeur<'fonction_direction'> | null;
  /** Comme la base : une école relevée par un autre relais, ou une correction, ne se paie pas. */
  payable: boolean;
  essaiValideLe: string | null;
}

interface PhotoFausse {
  publique?: boolean;
  id: string;
  releveId: string;
  role: Valeur<'photo_role'>;
  mime: string;
  octets: number;
  publiable: boolean;
  onYVoit?: ('signboard' | 'entrance' | 'building')[];
  /** Scénario « admin » : l'enseigne fictive dessinée au lieu de l'icône. */
  exemple?: boolean;
}

/** Une institution et son campus, réunis (le faux serveur n'a qu'un campus par institution, sauf ajout). */
interface CampusFaux {
  /** Lot 2 du site public (15/11) : les places annoncées et l'effectif des classes, dits par l'école. */
  places?: PlacesAnnoncees[];
  effectifs?: EffectifClasse[];
  agrements?: AgrementEnregistre[];
  motDirection?: MotDirection | null;
  inscriptions?: DateInscription[];
  equipements?: Equipement[];
  frais?: FraisEcole[];
  contactPublic?: ContactPublic | null;
  id: string;
  institutionId: string;
  nom: string;
  etiquette: string | null;
  quartier: string | null;
  publication: Valeur<'publication'>;
  origine: Valeur<'origin_kind'>;
  declareeLe?: string | null;
  position: { latitude: number; longitude: number } | null;
  divisionId: string | null;
  confieeA: string | null;
  /** Lot I : quand la mission a été confiée. */
  confieeLe?: string | null;
  noteMission: string | null;
  genreMission: Valeur<'mission_kind'>;
  /** v2 (13/11) : la tâche, la raison, la date limite et le montant de la mission. */
  detailsMission?: DetailsMission | null;
  retrait?: {
    motif: Valeur<'motif_retrait'>;
    le: string;
    note: string | null;
    remplaceePar: string | null;
  } | null;
  /** À la corbeille : depuis quand, et l'état d'avant (pour restaurer). */
  corbeille?: { le: string; avant: Valeur<'publication'> } | null;
  /** Le lot du relevé qui a fait l'école (pour « Publier un lot »). */
  lotId?: string | null;
  /** Tels que la base les dit ; un parcours y met une valeur qu'un téléphone ne connaît pas encore. */
  typeEcole?: string;
  niveaux?: string[];
  programme?: string | null;
  repere?: string | null;
  numeroEnseigne?: string | null;
  formations?: FormationSaisie[];
  /** Lot F : le détail des formations du supérieur, par filière (`cycle|titre`, l'identifiant du faux). */
  detailsFormations?: Record<string, DetailsFormation>;
  /** Lot 2 (14/11) : les frais par an et l'autorisation d'une formation (tiroir « modifier une formation »). */
  ficheFormations?: Record<
    string,
    {
      fraisParAn: number | null;
      autorisation: AutorisationFormation | null;
      /** Lot 2 (15/11) : les séries du bac admises ; nul : pas dit. */
      seriesAdmises?: Valeur<'bac_track'>[] | null;
    }
  >;
  verifieeLe?: string | null;
  /** Lot G : l'école voisine au même lieu. */
  memeLieuQue?: string | null;
  reference?: string | null;
}

interface DivisionFausse {
  id: string;
  parentId: string | null;
  niveau: number;
  genre: Valeur<'geo_kind'>;
  nom: string;
  slug: string;
  chemin: string;
  ouverte: boolean;
  /** L'état public sur la carte ; absent des états gardés avant ce réglage (= non couverte). */
  deploiement?: 'actif' | 'programme' | null;
  /** Les autres écritures du nom ; absent des états gardés avant ce réglage. */
  aliases?: string[];
}

interface LotFaux {
  id: string;
  nom: string;
  essai: boolean;
  aRendreLe: string | null;
  /** Le jour où l'administration l'a déclaré terminé (absent des états gardés avant le ticket n° 67). */
  renduLe?: string | null;
  divisionId: string;
}

interface VersementFaux {
  id: string;
  relaisId: string;
  montantXaf: number;
  verseLe: string;
  reference: string | null;
  noteLe: string;
  annuleLe: string | null;
  motif: string | null;
}

interface SemaineFausse {
  id: string;
  vendredi: string;
  lignes: {
    relaisId: string;
    prenom: string;
    fiches: number;
    contacts: number;
    essais: number;
    totalXaf: number;
  }[];
  payes: Record<string, { le: string; reference: string }>;
}

/** Une personne à contacter dans le faux serveur : ce que le relais envoie, plus ce que l'administration note. */
type ContactFaux = ContactAEnvoyer & {
  /** Fiche d'école (16/11) : une personne notée sur le site lui-même (alors `releveId` est vide). */
  ecoleId?: string | null;
  precisionFonction?: string | null;
  source?: 'relais' | 'administration';
  recuLe?: string;
};

/** Les personnes notées pour une fiche, la première reçue d'abord. */
function personnesDe(e: Etat, releveId: string): [string, ContactFaux][] {
  return Object.entries(e.contacts).filter(([, c]) => c.releveId === releveId);
}

const TROIS_PERSONNES = 'Une fiche a trois personnes à contacter au plus.';

interface Etat {
  /** Lot 2 du site public (15/11) : les demandes des familles, sans nom ni numéro (comme `family_demands`). */
  demandesFamilles?: DemandeFamille[];
  /** Le scénario « admin » : le relais de chaque fiche, et la liste des relais de l'administration. */
  relaisDesReleves?: Record<string, string>;
  relaisDeLAdmin?: Awaited<ReturnType<PortAdministration['relais']>>;
  /** Le scénario « planches » : les missions faites de la semaine, payées à leur montant (le faux ne les ferme pas). */
  paieMissions?: { tarifXaf: number; nombre: number }[];
  /** Lot H : le numéro Mobile Money du relais. */
  numeroDePaie?: {
    operateur: 'mtn' | 'airtel' | 'autre';
    numero: string;
    titulaire?: string | null;
    majLe: string;
  } | null;
  /** v2 (13/11) : les demandes faites (« demandé à l'école le … ») et les images des écoles. */
  demandes?: {
    id: string;
    campusId: string;
    sujet: Valeur<'request_topic'>;
    detail: string | null;
    le: string;
    a: Valeur<'request_target'>;
    etat: Valeur<'request_state'>;
  }[];
  medias?: (MediaAdmin & { campusId: string })[];
  nouvelles?: (NouvelleAdmin & { campusId: string })[];
  admissions?: Record<string, AdmissionASaisir>;
  /** v2 (13/11) : les « Je n'ai pas pu » reçus, pour les parcours. */
  missionsPasPu?: { missionId: string; motif: string; note: string | null }[];
  utilisateur: { id: string; email: string } | null;
  statut: Profil['statut'];
  /** L'utilisateur du faux serveur est aussi administrateur. */
  admin: boolean;
  releves: Record<string, ReleveAEnvoyer>;
  photos: Record<string, PhotoFausse>;
  /**
   * Comme `prive.campus_photo_choices` : une école absente = repli automatique ; une photo = choix prioritaire ;
   * `null` = retrait explicite, qui bloque tout repli.
   */
  choixPhotos: Record<string, string | null>;
  /** Les personnes à contacter, par identifiant : celle d'un téléphone d'avant a pour clé le numéro de sa fiche. */
  contacts: Record<string, ContactFaux>;
  erreurs: ErreurAEnvoyer[];
  decisions: Record<string, Decision>;
  /** Un second relais, fictif, en attente d'activation. */
  autreRelais: { statut: Profil['statut']; lotId: string | null };
  /** Les campus connus, dont un à situer (sans position). */
  campus: Record<string, CampusFaux>;
  divisions: Record<string, DivisionFausse>;
  lots: LotFaux[];
  messages: Record<string, string>;
  paie: {
    semaines: SemaineFausse[];
    numeros: Record<string, { operateur: string; numero: string; titulaire?: string | null }>;
    deja: string[];
    /** 19/11 : les versements notés par l'administration (absents d'un état gardé avant). */
    versements?: VersementFaux[];
  };
  /** Les relevés qu'un autre relais a envoyés et qui attendent : ils apparaissent dans les lieux connus. */
  autresReleves: { id: string; nom: string; latitude: number; longitude: number }[];
}

const ECOLE_A_SITUER = '40000000-0000-4000-8000-000000000001';

const div = (
  id: string,
  parentId: string | null,
  niveau: number,
  genre: Valeur<'geo_kind'>,
  nom: string,
  slug: string,
  chemin: string,
  ouverte = false,
): DivisionFausse => ({ id, parentId, niveau, genre, nom, slug, chemin, ouverte });

/** Un extrait du Congo, comme `geo_divisions` : de quoi essayer les lots, les zones et la navigation. */
const DIVISIONS_INITIALES: DivisionFausse[] = [
  div('d-cg', null, 0, 'country', 'Congo', 'congo', 'congo'),
  div('d-pn-dep', 'd-cg', 1, 'department', 'Pointe-Noire', 'pointe-noire', 'congo.pointe_noire'),
  div(
    'd-pn',
    'd-pn-dep',
    2,
    'city',
    'Pointe-Noire',
    'pointe-noire',
    'congo.pointe_noire.pointe_noire',
  ),
  ...(
    [
      ['lumumba', 'Lumumba', false],
      ['mvou-mvou', 'Mvou-Mvou', false],
      ['tie-tie', 'Tié-Tié', true],
      ['loandjili', 'Loandjili', false],
      ['mongo-mpoukou', 'Mongo-Mpoukou', false],
      ['ngoyo', 'Ngoyo', true],
    ] as const
  ).map(([slug, nom, ouverte]) =>
    div(
      `d-pn-${slug}`,
      'd-pn',
      3,
      'arrondissement',
      nom,
      slug,
      `congo.pointe_noire.pointe_noire.${slug.replace(/-/g, '_')}`,
      ouverte,
    ),
  ),
  div('d-bz-dep', 'd-cg', 1, 'department', 'Brazzaville', 'brazzaville', 'congo.brazzaville'),
  div('d-bz', 'd-bz-dep', 2, 'city', 'Brazzaville', 'brazzaville', 'congo.brazzaville.brazzaville'),
  div(
    'd-bz-moungali',
    'd-bz',
    3,
    'arrondissement',
    'Moungali',
    'moungali',
    'congo.brazzaville.brazzaville.moungali',
  ),
  div('d-ni', 'd-cg', 1, 'department', 'Niari', 'niari', 'congo.niari'),
  div('d-dolisie', 'd-ni', 2, 'commune', 'Dolisie', 'dolisie', 'congo.niari.dolisie'),
];

/** L'état public de départ, celui de la base : deux arrondissements actifs, les autres programmés. */
const DEPLOIEMENTS_INITIAUX: Partial<Record<string, 'actif' | 'programme'>> = {
  'd-pn-tie-tie': 'actif',
  'd-pn-ngoyo': 'actif',
  'd-pn-lumumba': 'programme',
  'd-pn-mvou-mvou': 'programme',
  'd-pn-loandjili': 'programme',
  'd-pn-mongo-mpoukou': 'programme',
  'd-bz': 'programme',
};

const LOT = {
  id: '00000000-0000-4000-8000-0000000000e1',
  nom: 'Tié-Tié',
  essai: false,
  aRendreLe: null,
  divisionId: 'd-pn-tie-tie',
};
const LOTS_INITIAUX: LotFaux[] = [
  LOT,
  {
    id: '00000000-0000-4000-8000-0000000000e2',
    nom: 'Ngoyo',
    essai: false,
    aRendreLe: null,
    divisionId: 'd-pn-ngoyo',
  },
  {
    id: '00000000-0000-4000-8000-0000000000e3',
    nom: 'Essai',
    essai: true,
    aRendreLe: null,
    divisionId: 'd-pn-tie-tie',
  },
];

const etatInitial = (): Etat => ({
  utilisateur: null,
  statut: 'actif',
  admin: true,
  releves: {},
  photos: {},
  choixPhotos: {},
  contacts: {},
  erreurs: [],
  decisions: {},
  autreRelais: { statut: 'en_attente', lotId: null },
  campus: {
    [ECOLE_A_SITUER]: {
      id: ECOLE_A_SITUER,
      institutionId: ECOLE_A_SITUER,
      nom: '[École à situer]',
      etiquette: null,
      quartier: 'Tié-Tié',
      publication: 'brouillon',
      origine: 'import',
      position: null,
      divisionId: null,
      confieeA: null,
      noteMission: null,
      genreMission: 'locate',
    },
  },
  divisions: Object.fromEntries(
    DIVISIONS_INITIALES.map((d) => [
      d.id,
      { ...d, deploiement: DEPLOIEMENTS_INITIAUX[d.id] ?? null },
    ]),
  ),
  lots: LOTS_INITIAUX,
  messages: {},
  paie: { semaines: [], numeros: {}, deja: [] },
  autresReleves: [],
});

// `?scenario=planches` dans l'adresse (serveur local du fondateur) : on repart des états des planches v2.
if (
  typeof location !== 'undefined' &&
  ['planches', 'admin'].includes(new URLSearchParams(location.search).get('scenario') ?? '')
) {
  localStorage.setItem(
    'ntanova-faux-scenario',
    new URLSearchParams(location.search).get('scenario') ?? '',
  );
  localStorage.removeItem(CLE);
}

function lireEtat(): Etat {
  const garde = localStorage.getItem(CLE);
  if (garde) return { ...etatInitial(), ...(JSON.parse(garde) as Partial<Etat>) };
  // `ntanova-faux-scenario` = « planches » : les états des planches v2, pour les captures comparées.
  if (localStorage.getItem('ntanova-faux-scenario') === 'planches') {
    const depart = etatInitial();
    const scenario = etatDesPlanches() as unknown as Partial<Etat>;
    return { ...depart, ...scenario, campus: { ...depart.campus, ...scenario.campus } };
  }
  // `ntanova-faux-scenario` = « admin » : les états des planches de l'administration.
  if (localStorage.getItem('ntanova-faux-scenario') === 'admin') {
    return { ...etatInitial(), ...(etatDesPlanchesAdmin() as unknown as Partial<Etat>) };
  }
  return etatInitial();
}

function ecrire(modifier: (etat: Etat) => void): void {
  const etat = lireEtat();
  modifier(etat);
  localStorage.setItem(CLE, JSON.stringify(etat));
}

/** Les photos des relevés acceptés d'une école (les seules qui peuvent paraître sur sa fiche). */
function photosAcceptees(e: Etat, ecoleId: string): PhotoFausse[] {
  return Object.values(e.photos).filter(
    (p) =>
      e.decisions[p.releveId]?.statut === 'accepte' && e.decisions[p.releveId]?.ecoleId === ecoleId,
  );
}

/**
 * L'état de la photo publique d'une école, comme la base le dit (`campus_public_photo_state`) : aucun choix = repli
 * sur la première enseigne ou façade contrôlée ; un choix prioritaire doit rester valide ; un retrait bloque tout.
 * Rien n'est retenu tant que la fiche n'est pas publiée (une restauration la remet « prête », jamais publiée).
 */
function etatPhotoFaux(e: Etat, ecoleId: string): EtatPhotoPublique {
  const ecole = e.campus[ecoleId];
  const publiee = ecole?.publication === 'publiee' && !ecole.corbeille;
  const choix = e.choixPhotos[ecoleId];
  const mode = choix === undefined ? 'automatique' : choix === null ? 'retire' : 'choix';
  const controlees = photosAcceptees(e, ecoleId)
    .filter((p) => p.publiable && peutParaitreSurLeSite(p.role))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let retenueId: string | null = null;
  if (publiee && mode === 'automatique') retenueId = controlees[0]?.id ?? null;
  if (publiee && mode === 'choix') {
    retenueId = controlees.find((p) => p.id === choix && p.publique === true)?.id ?? null;
  }
  return { mode, choisieId: typeof choix === 'string' ? choix : null, publiee, retenueId };
}

/** Ce qui n'est pas clos, comme `payable_items_for` : le faux serveur n'a qu'un relais, l'utilisateur. */
async function apercuDuFaux() {
  await reseau();
  const e = lireEtat();
  const lignes = new Map<string, { fiches: number; contacts: number; essais: number }>();
  const ligne = () => lignes.get(MOI) ?? { fiches: 0, contacts: 0, essais: 0 };
  for (const r of Object.values(e.releves)) {
    const d = e.decisions[r.id];
    if (!d || e.paie.deja.includes(`${r.id}|fiche`)) continue;
    const essai = lotDe(r.lotId, e).essai;
    if (!essai && d.statut === 'accepte' && d.payable && r.type !== 'correction') {
      lignes.set(MOI, { ...ligne(), fiches: ligne().fiches + 1 });
    }
    if (
      !essai &&
      d.statut === 'accepte' &&
      d.contactConfirmeLe &&
      d.contactFonction !== 'secretariat' &&
      !e.paie.deja.includes(`${r.id}|contact`)
    ) {
      lignes.set(MOI, { ...ligne(), contacts: ligne().contacts + 1 });
    }
  }
  const validesEssai = Object.values(e.releves).filter(
    (r) => lotDe(r.lotId, e).essai && e.decisions[r.id]?.essaiValideLe,
  ).length;
  if (validesEssai >= 3 && !e.paie.deja.includes('essai')) {
    lignes.set(MOI, { ...ligne(), essais: 1 });
  }
  return [...lignes.entries()].map(([relaisId, l]) => ({
    relaisId,
    prenom: '[Prénom]',
    fiches: l.fiches,
    contacts: l.contacts,
    essais: l.essais,
    totalXaf: l.fiches * 500 + l.contacts * 300 + l.essais * 1500,
    numeroConnu: relaisId in e.paie.numeros,
  }));
}

/** Le prénom d'un relais du faux serveur : celui d'une semaine close s'il en a une (cas extrêmes), sinon « [Prénom] ». */
function prenomDuFaux(e: Etat, relaisId: string): string {
  return (
    e.paie.semaines.flatMap((x) => x.lignes).find((l) => l.relaisId === relaisId)?.prenom ??
    '[Prénom]'
  );
}

/**
 * 19/11 : le solde d'un relais dans le faux serveur. Gagné : ce qui n'est pas clos (et les missions de l'utilisateur), plus
 * les semaines closes. Reçu : les versements non annulés et les semaines notées « payées », le plus récent d'abord.
 */
async function soldeDuFaux(relaisId: string) {
  const e = lireEtat();
  const ouvert = (await apercuDuFaux()).find((l) => l.relaisId === relaisId)?.totalXaf ?? 0;
  const missions =
    relaisId === MOI ? (e.paieMissions ?? []).reduce((t, m) => t + m.tarifXaf * m.nombre, 0) : 0;
  const clos = e.paie.semaines.reduce(
    (t, x) => t + (x.lignes.find((l) => l.relaisId === relaisId)?.totalXaf ?? 0),
    0,
  );
  const recus = [
    ...(e.paie.versements ?? [])
      .filter((v) => v.relaisId === relaisId && !v.annuleLe)
      .map((v) => ({ verseLe: v.verseLe, montantXaf: v.montantXaf, reference: v.reference })),
    ...e.paie.semaines.flatMap((x) => {
      const p = x.payes[relaisId];
      const l = x.lignes.find((y) => y.relaisId === relaisId);
      return p && l && l.totalXaf > 0
        ? [{ verseLe: p.le.slice(0, 10), montantXaf: l.totalXaf, reference: p.reference || null }]
        : [];
    }),
  ].sort((x, y) => y.verseLe.localeCompare(x.verseLe));
  return { gagne: ouvert + missions + clos, recus };
}

/** Les lignes de la paie du faux serveur, aux tarifs qu'il applique (500 la fiche, 300 le contact, 1 500 l'essai). */
function factureFausse(fiches: number, contacts: number, essais: number, ids: string[]) {
  return [
    { genre: 'fiche' as const, tarifXaf: 500, nombre: fiches, fiches: ids.slice(0, fiches) },
    { genre: 'contact' as const, tarifXaf: 300, nombre: contacts, fiches: [] },
    { genre: 'essai' as const, tarifXaf: 1500, nombre: essais, fiches: [] },
  ].filter((l) => l.nombre > 0);
}

async function reseau(): Promise<void> {
  // 50 ms ; un parcours peut ralentir la réponse (`ntanova-faux-latence`, en ms) pour
  // rejouer une 3G qui traîne.
  const latence = Number(localStorage.getItem('ntanova-faux-latence') ?? 50);
  await new Promise((fin) => setTimeout(fin, latence));
  if (!navigator.onLine) throw new ErreurReseau('hors ligne');
}

/** Les rôles des photos de ces relevés, sans doublon et triés comme la base : jamais leur chemin. */
function rolesDesPhotos(e: Etat, releveIds: string[]): Valeur<'photo_role'>[] {
  const roles = Object.values(e.photos)
    .filter((p) => releveIds.includes(p.releveId))
    .map((p) => p.role);
  return [...new Set(roles)].sort();
}

function ajouter<T>(table: Record<string, T>, id: string, valeur: T): Reponse {
  if (id in table) return 'deja_recu';
  table[id] = valeur;
  return 'recu';
}

const MOI = '00000000-0000-4000-8000-00000000000a';
const AUTRE = '00000000-0000-4000-8000-00000000000b';

/** Comme `division_of_position()` : l'arrondissement dessiné qui contient la position, s'il y en a un. */
function divisionDeLaPosition(
  position: { latitude: number; longitude: number },
  e: Etat,
): DivisionFausse | null {
  const dessine = arrondissementDeLaPosition(position);
  return dessine
    ? (Object.values(e.divisions).find((d) => d.niveau === 3 && d.slug === dessine.slug) ?? null)
    : null;
}

const SLUG = (texte: string) =>
  texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const session: PortSession = {
  async utilisateur() {
    return lireEtat().utilisateur;
  },
  async connecterAvecGoogle() {
    await reseau();
    const utilisateur = { id: MOI, email: 'relais@exemple.test' };
    ecrire((e) => (e.utilisateur = utilisateur));
    return utilisateur;
  },
  async deconnecter() {
    ecrire((e) => (e.utilisateur = null));
  },
  async etat() {
    if (!navigator.onLine) return 'hors_ligne';
    return lireEtat().utilisateur ? 'pret' : 'reconnecter';
  },
};

/** `ntanova-faux-sans-secteur` : un relais actif à qui NTanova n'a donné aucun secteur (lot). */
const sansSecteur = () => localStorage.getItem('ntanova-faux-sans-secteur') === '1';

const relais: PortRelais = {
  async monProfil() {
    await reseau();
    // `ntanova-faux-panne-lecture` : la base refuse de lire le compte (une panne dont on ne sait rien), comme
    // un téléphone resté sur une ancienne version devant une base qui a changé.
    if (localStorage.getItem('ntanova-faux-panne-lecture')) {
      throw new Error('503 : service indisponible');
    }
    const e = lireEtat();
    if (!e.utilisateur) throw new Error('Aucune session');
    return {
      id: e.utilisateur.id,
      prenom: '[Prénom]',
      statut: e.statut,
      lotId: e.statut === 'actif' && !sansSecteur() ? LOT.id : null,
    };
  },
  async monLot() {
    await reseau();
    // Un carré autour de Tié-Tié.
    const contour = [
      [
        [
          [11.85, -4.83],
          [11.95, -4.83],
          [11.95, -4.75],
          [11.85, -4.75],
          [11.85, -4.83],
        ],
      ],
    ];
    return lireEtat().statut === 'actif' && !sansSecteur()
      ? { id: LOT.id, nom: LOT.nom, essai: LOT.essai, aRendreLe: null, contour }
      : null;
  },
  async zonesOuvertes() {
    await reseau();
    return Object.values(lireEtat().divisions)
      .filter((d) => d.ouverte)
      .map((d) => d.nom)
      .sort((a, b) => a.localeCompare(b, 'fr'));
  },
  // v2 (13/11) : la liste nationale ; une école homonyme ailleurs, à deux sites, pour « Même nom, ailleurs ».
  async ecolesDuPays() {
    await reseau();
    return [
      {
        id: '10000000-0000-4000-8000-000000000001',
        nom: '[École exemple publiée]',
        sigle: 'EEP',
        ville: 'Pointe-Noire',
        sites: 1,
      },
      {
        id: '10000000-0000-4000-8000-0000000000aa',
        nom: '[Groupe scolaire Les Palmiers]',
        sigle: 'GSLP',
        ville: 'Brazzaville',
        sites: 2,
      },
    ];
  },
  async lieuxConnus() {
    await reseau();
    const e = lireEtat();
    return [
      {
        id: '20000000-0000-4000-8000-000000000001',
        nom: '[École exemple publiée]',
        latitude: -4.79105,
        longitude: 11.925,
        genre: 'campus' as const,
        sigle: 'EEP',
        institutionId: '10000000-0000-4000-8000-000000000001',
        sites: 1,
        // Lot F : sa vignette publique, comme `known_places_for_me` la rend (un chemin, jamais l'image).
        vignette: 'ecoles/20000000-0000-4000-8000-000000000001/couverture-vignette.webp',
      },
      ...Object.values(e.campus)
        .filter((c) => c.position && c.publication !== 'retiree')
        .map((c) => ({
          id: c.id,
          nom: c.etiquette ? `${c.nom} — ${c.etiquette}` : c.nom,
          latitude: (c.position as { latitude: number }).latitude,
          longitude: (c.position as { longitude: number }).longitude,
          genre: 'campus' as const,
        })),
      ...e.autresReleves.map((r) => ({ ...r, genre: 'releve' as const })),
    ];
  },
  async mesReleves() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.releves).map((r) => {
      const d = e.decisions[r.id];
      return {
        id: r.id,
        type: r.type,
        nomEnseigne: r.nomEnseigne,
        prisLe: r.prisLe,
        statut: d?.statut ?? 'a_valider',
        motif: d?.motif ?? null,
        messageAuRelais: d?.message ?? null,
        direction: r.direction,
        ficheLiaisonRemise: false,
        repasser: r.repasser,
        contactConfirmeLe: d?.contactConfirmeLe ?? null,
        contactFonction: d?.contactFonction ?? null,
        campusId: d?.ecoleId ?? null,
        // Comme `my_submissions` : tout le contenu, les rôles des photos (jamais leur chemin), « le contact est arrivé ».
        niveaux: r.niveaux,
        typeEcole: r.typeEcole,
        programme: r.programme,
        programmesVus: r.programmesVus,
        programmesEnPhoto: r.programmesEnPhoto,
        formationsVues: r.formationsVues ?? [],
        repere: r.repere,
        numeroEnseigne: r.numeroEnseigne,
        position: r.position,
        precisionM: r.precisionM,
        photos: rolesDesPhotos(e, [r.id]),
        aContact: personnesDe(e, r.id).length > 0,
        corrigeReleveId: r.corrigeReleveId ?? null,
        // Lot F : une école publiée a sa page. Le faux catalogue n'en a que trois : on renvoie à la fiche « complète »
        // (n° 158427), pour que le lien s'ouvre sur le site construit avec le faux.
        pageEnLigne: d?.ecoleId && e.campus[d.ecoleId]?.publication === 'publiee' ? 158427 : null,
      };
    });
  },
  async adresseDeVignette(chemin) {
    await reseau();
    // `ntanova-faux-vignette` = « cassee » : une adresse qui ne se charge pas (le repli sur le sigle se vérifie) ;
    // « aucune » : la base ne la donne pas.
    const reglage = localStorage.getItem('ntanova-faux-vignette');
    if (reglage === 'aucune' || !chemin.startsWith('ecoles/')) return null;
    return reglage === 'cassee'
      ? '/vignette-introuvable.webp'
      : URL.createObjectURL(new Blob([photoExemple()], { type: 'image/jpeg' }));
  },
  async mesPhotos(releveId) {
    await reseau();
    // Une image d'un pixel, la même pour toutes : le faux serveur ne garde pas les fichiers. Elle se charge, c'est ce
    // que les parcours vérifient.
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    return Object.values(lireEtat().photos)
      .filter((p) => p.releveId === releveId)
      .map((p) => ({ id: p.id, role: p.role, url: image }));
  },
  async mesMissions() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.campus)
      .filter((c) => c.confieeA === MOI)
      .map((c) => {
        // Comme `my_missions` : ce que NTanova sait de l'école, d'après ses relevés acceptés.
        const acceptes = Object.values(e.releves).filter(
          (r) => e.decisions[r.id]?.statut === 'accepte' && e.decisions[r.id]?.ecoleId === c.id,
        );
        return {
          id: c.id,
          nom: c.nom,
          etiquette: c.etiquette,
          quartier: c.quartier,
          typeEcole: c.typeEcole ?? 'privee',
          niveaux: c.niveaux ?? ['primaire'],
          programme: c.programme ?? null,
          repere: c.repere ?? null,
          numeroEnseigne: c.numeroEnseigne ?? null,
          note: c.noteMission,
          genre: c.genreMission,
          position: c.position,
          etatVerification: c.verifieeLe ? 'verifiee' : 'relevee',
          photos: rolesDesPhotos(
            e,
            acceptes.map((r) => r.id),
          ),
          contactConfirme: acceptes.some((r) => e.decisions[r.id]?.contactConfirmeLe),
          // v2 (13/11) : une mission fictive porte son identifiant ; ce qu'il faut faire, la date et le montant se règlent
          // pour les parcours par `ntanova-faux-mission` (JSON : tache, raison, avantLe, paieXaf).
          missionId: `m-${c.id}`,
          confieeLe: c.confieeLe ?? null,
          ...(c.detailsMission ?? {}),
          ...(JSON.parse(localStorage.getItem('ntanova-faux-mission') ?? '{}') as Record<
            string,
            unknown
          >),
        };
      });
  },
  async missionPasPu(missionId, motif, note) {
    await reseau();
    if (motif === 'autre' && !note?.trim())
      throw new ErreurRejet('22023', 'Dites ce qui vous a empêché (et précisez « autre »).');
    let trouvee = false;
    ecrire((e) => {
      for (const c of Object.values(e.campus))
        if (`m-${c.id}` === missionId && c.confieeA === MOI) {
          c.confieeA = null;
          trouvee = true;
        }
      e.missionsPasPu = [...(e.missionsPasPu ?? []), { missionId, motif, note }];
    });
    if (!trouvee) throw new ErreurRejet('P0002', 'Mission introuvable ou déjà fermée.');
  },
  async monNumeroDePaie() {
    await reseau();
    const n = lireEtat().numeroDePaie;
    return n ? { ...n, titulaire: n.titulaire ?? null } : null;
  },
  async enregistrerMonNumeroDePaie(operateur, numero, titulaire) {
    await reseau();
    if (lireEtat().statut !== 'actif')
      throw new ErreurRejet('42501', 'Seul un relais actif enregistre son numéro de paie.');
    if (!/^[1-9][0-9]{7,14}$/.test(numero))
      throw new ErreurRejet(
        '22023',
        'Le numéro s’écrit avec l’indicatif, sans + ni espace (242…).',
      );
    const nom = titulaire.replace(/\s+/g, ' ').trim();
    if (nom !== '' && (nom.length < 2 || nom.length > 80))
      throw new ErreurRejet('22023', 'Le nom du titulaire fait de 2 à 80 caractères.');
    ecrire(
      (e) =>
        (e.numeroDePaie = {
          operateur,
          numero,
          titulaire: nom || e.numeroDePaie?.titulaire || null,
          majLe: new Date().toISOString(),
        }),
    );
  },
  async maPaie() {
    await reseau();
    const e = lireEtat();
    // Comme `my_payout` : l'acquis du prochain vendredi (le calcul de l'administration, pour le seul relais), puis les
    // semaines closes. Les montants sont ceux de l'administration : le faux serveur n'en invente pas d'autres.
    const vendredi = prochainVendredi();
    const [ligne] = await apercuDuFaux();
    const nonPayables = Object.values(e.releves).filter((r) => {
      const d = e.decisions[r.id];
      return (
        d?.statut === 'accepte' && !d.payable && r.type !== 'correction' && !lotDe(r.lotId, e).essai
      );
    }).length;
    const historique = [...e.paie.semaines]
      .sort((a, b) => b.vendredi.localeCompare(a.vendredi))
      .flatMap((s) => {
        const l = s.lignes.find((x) => x.relaisId === MOI);
        if (!l) return [];
        const paye = s.payes[MOI];
        return [
          {
            vendredi: s.vendredi,
            etat: paye ? ('paye' as const) : ('a_payer' as const),
            fiches: l.fiches,
            contacts: l.contacts,
            essais: l.essais,
            totalXaf: l.totalXaf,
            nonPayables: 0,
            payeLe: paye?.le ?? null,
            reference: paye?.reference ?? null,
            // Le faux serveur ne garde pas les fiches d'une semaine close : les quantités et les tarifs seulement.
            lignes: factureFausse(l.fiches, l.contacts, l.essais, []),
          },
        ];
      });
    // Les fiches de l'acquis, comme `payable_items_for` : acceptées, payables, hors essai, pas déjà payées.
    const payees = Object.values(e.releves)
      .filter((r) => {
        const d = e.decisions[r.id];
        return (
          d?.statut === 'accepte' &&
          d.payable &&
          r.type !== 'correction' &&
          !lotDe(r.lotId, e).essai &&
          !e.paie.deja.includes(`${r.id}|fiche`)
        );
      })
      .map((r) => r.id);
    const missions = e.paieMissions ?? [];
    const enMissions = missions.reduce((t, m) => t + m.tarifXaf * m.nombre, 0);
    // 19/11 : le solde, et les fiches couvertes par ce qui est reçu (les semaines closes d'abord, plus anciennes).
    const { gagne, recus } = await soldeDuFaux(MOI);
    const recu = recus.reduce((t, v) => t + v.montantXaf, 0);
    let couvre =
      recu -
      e.paie.semaines.reduce(
        (t, x) => t + (x.lignes.find((l) => l.relaisId === MOI)?.totalXaf ?? 0),
        0,
      );
    const fichesPayees: string[] = [];
    for (const id of payees) {
      if (couvre < 500) break;
      couvre -= 500;
      fichesPayees.push(id);
    }
    return {
      acquis: {
        solde: {
          gagneXaf: gagne,
          recuXaf: recu,
          resteXaf: gagne - recu,
          versements: recus,
          fichesPayees,
        },
        vendredi,
        etat: 'acquis' as const,
        fiches: ligne?.fiches ?? 0,
        contacts: ligne?.contacts ?? 0,
        essais: ligne?.essais ?? 0,
        missions: missions.reduce((t, m) => t + m.nombre, 0),
        totalXaf: (ligne?.totalXaf ?? 0) + enMissions,
        nonPayables,
        payeLe: null,
        reference: null,
        lignes: [
          ...factureFausse(ligne?.fiches ?? 0, ligne?.contacts ?? 0, ligne?.essais ?? 0, payees),
          ...missions.map((m) => ({ genre: 'mission' as const, ...m, fiches: [] })),
        ],
      },
      historique,
      numeroConnu: MOI in e.paie.numeros,
    };
  },
  async envoyerReleve(r) {
    await reseau();
    // Deux réglages pour rejouer ce que répond la vraie base (parcours de la file d'envoi) :
    //   `ntanova-faux-rejet` = « code|message » : la base REFUSE le relevé, comme `traduire` le lit ;
    //   `ntanova-faux-panne` : une panne dont on ne sait rien (erreur serveur).
    const rejet = localStorage.getItem('ntanova-faux-rejet');
    if (rejet) {
      const refus = Number(localStorage.getItem('ntanova-faux-refus') ?? 0);
      localStorage.setItem('ntanova-faux-refus', String(refus + 1));
      const [code = '', ...message] = rejet.split('|');
      throw new ErreurRejet(code, message.join('|'));
    }
    if (localStorage.getItem('ntanova-faux-panne')) throw new Error('503 : service indisponible');
    let reponse: Reponse = 'recu';
    ecrire((e) => (reponse = ajouter(e.releves, r.id, r)));
    return reponse;
  },
  async envoyerPhoto(releveId, photo) {
    await reseau();
    // `ntanova-faux-reseau-photo` : le navigateur échoue à envoyer la photo (« Load failed », sans réponse de la base),
    // alors que le téléphone se dit en ligne : ce qui arrive sur iPhone (ticket #74).
    if (localStorage.getItem('ntanova-faux-reseau-photo')) throw new ErreurReseau('Load failed');
    const e = lireEtat();
    if (!(releveId in e.releves)) throw new Error('Relevé inconnu');
    // Comme la base : une photo déjà enregistrée répond « déjà reçu », une seule enseigne par fiche,
    // trois autres photos au plus.
    if (photo.id in e.photos) return 'deja_recu';
    const siennes = Object.values(e.photos).filter((p) => p.releveId === releveId);
    if (photo.role === 'signboard' && siennes.some((p) => p.role === 'signboard')) {
      throw new Error('23505 : une fiche n’a qu’une photo d’enseigne');
    }
    if (photo.role !== 'signboard' && siennes.filter((p) => p.role !== 'signboard').length >= 5) {
      throw new ErreurRejet('22023', 'Au plus cinq photos en plus de l’enseigne.');
    }
    if (photo.octets >= 200_000) throw new Error('photo trop lourde');
    ecrire((s) => {
      s.photos[photo.id] = {
        id: photo.id,
        releveId,
        role: photo.role,
        ...(photo.onYVoit ? { onYVoit: photo.onYVoit } : {}),
        mime: photo.mime,
        octets: photo.octets,
        publiable: false,
      };
    });
    return 'recu';
  },
  async envoyerContact(c) {
    await reseau();
    if (!(c.releveId in lireEtat().releves)) throw new Error('Relevé inconnu');
    let reponse: Reponse = 'recu';
    // La direction a pour clé le numéro de la fiche ; une personne en plus, son propre identifiant (ticket #96).
    ecrire((e) => (reponse = ajouter(e.contacts, c.contactId ?? c.releveId, c)));
    return reponse;
  },
  async signalerErreur(erreur) {
    await reseau();
    ecrire((e) => e.erreurs.push(erreur));
    return 'recu';
  },
};

// L'administration ---------------------------------------------------------------

function decision(id: string): Decision {
  const e = lireEtat();
  if (!(id in e.releves)) throw new ErreurDecision('Relevé introuvable.');
  return (
    e.decisions[id] ?? {
      statut: 'a_valider',
      motif: null,
      message: null,
      ecoleId: null,
      contactConfirmeLe: null,
      contactFonction: null,
      payable: true,
      essaiValideLe: null,
    }
  );
}

function decider(id: string, champs: Partial<Decision>): void {
  const avant = decision(id);
  ecrire((e) => (e.decisions[id] = { ...avant, ...champs }));
}

function lotDe(id: string | null | undefined, e: Etat): LotFaux {
  return e.lots.find((l) => l.id === id) ?? e.lots[0] ?? LOT;
}

/** Le carré du faux lot et de la faux zone ouverte (Tié-Tié), comme `monLot` le donne au téléphone. */
const CARRE_DU_LOT = { ouest: 11.85, est: 11.95, sud: -4.83, nord: -4.75 };
const dansLeCarre = (
  p: { latitude: number; longitude: number },
  c: { ouest: number; est: number; sud: number; nord: number },
) => p.longitude >= c.ouest && p.longitude <= c.est && p.latitude >= c.sud && p.latitude <= c.nord;

/**
 * Comme la base : vrai quand la division que dit la position est ouverte (elle, ou l'un de ses ancêtres), faux quand elle
 * est fermée (Lumumba…), nul là où aucun contour n'est connu (Brazzaville, l'est de Pointe-Noire…) et sans position.
 */
function enZoneOuverte(p: { latitude: number; longitude: number } | null, e: Etat): boolean | null {
  if (!p) return null;
  let d: DivisionFausse | null | undefined = divisionDeLaPosition(p, e);
  if (!d) return null;
  while (d) {
    if (d.ouverte) return true;
    d = d.parentId ? e.divisions[d.parentId] : null;
  }
  return false;
}

/** Une ligne de la file « À valider », comme la vue `submissions_to_review`. */
function ligneDe(r: ReleveAEnvoyer, e: Etat) {
  const photos = Object.values(e.photos).filter((p) => p.releveId === r.id);
  const lot = lotDe(r.lotId, e);
  return {
    id: r.id,
    recuLe: r.prisLe,
    type: r.type,
    nomEnseigne: r.nomEnseigne,
    relais: e.relaisDesReleves?.[r.id] ?? '[Prénom]',
    // Comme la base : un relais sans secteur n'a pas de lot (le faux serveur retombait sur le premier lot).
    lot: r.lotId ? lot.nom : null,
    essai: lot.essai,
    horsLot: r.position ? !dansLeCarre(r.position, CARRE_DU_LOT) : null,
    enZoneOuverte: enZoneOuverte(r.position, e),
    doublonPossible: r.reponseDoublon !== null,
    reponseDoublon: r.reponseDoublon,
    precisionM: r.precisionM,
    photos: photos.length,
    enseigneRecue: photos.some((p) => p.role === 'signboard'),
    indiceFormations: Boolean(r.programmesVus) || r.programmesEnPhoto,
    contactRecu: personnesDe(e, r.id).length > 0,
  };
}

function divisionPar(e: Etat, reference: string | null): DivisionFausse | null {
  if (!reference) return null;
  return (
    Object.values(e.divisions).find((d) => d.id === reference || d.chemin === reference) ?? null
  );
}

function vueDeCampus(c: CampusFaux, e: Etat): EcoleVue {
  const division = c.divisionId ? e.divisions[c.divisionId] : undefined;
  return {
    id: c.id,
    institutionId: c.institutionId,
    nom: c.nom,
    etiquette: c.etiquette,
    numeroPublic: 158427,
    quartier: c.quartier,
    division: division?.nom ?? null,
    divisionId: division?.id ?? null,
    publication: c.publication,
    origine: c.origine,
    declareeLe: c.declareeLe ?? null,
    retrait: c.retrait ?? null,
    corbeille: c.corbeille ? { le: c.corbeille.le } : null,
    aSituer: c.position === null,
    position: c.position,
    confiee: c.confieeA
      ? {
          relaisId: c.confieeA,
          prenom: c.confieeA === MOI ? '[Prénom]' : '[Relais en attente]',
          note: c.noteMission,
          genre: c.genreMission,
        }
      : null,
    typeEcole: typeConnu(c.typeEcole ?? 'non_indique'),
    niveaux: niveauxConnus(c.niveaux ?? []),
    programme: c.programme ?? null,
    repere: c.repere ?? null,
    numeroEnseigne: c.numeroEnseigne ?? null,
    frais: c.frais ?? [],
    places: c.places ?? [],
    effectifs: c.effectifs ?? [],
    equipements: c.equipements ?? [],
    contactPublic: c.contactPublic ?? null,
    formations: (c.formations ?? []).length,
    filieres: (c.formations ?? []).map((f) => ({ id: `${f.cycle}|${f.titre}`, titre: f.titre })),
    agrements: c.agrements ?? [],
    motDirection: c.motDirection ?? null,
    inscriptions: c.inscriptions ?? [],
    verifieeLe: c.verifieeLe ?? null,
    memeLieuQue: c.memeLieuQue ?? null,
  };
}

/** Une école d'un coup, comme `create_catalog_entry` : mêmes règles, mêmes messages. */
function creerEntree(
  e: Etat,
  entree: EntreeCatalogue,
  origine: Valeur<'origin_kind'>,
): {
  statut: 'creee' | 'existe';
  institutionId: string | null;
  campusIds: string[];
  message: string | null;
} {
  const nom = entree.nom.trim();
  if (nom === '') throw new ErreurDecision('Le nom de l’école est obligatoire.');
  if (entree.campus.length === 0) {
    throw new ErreurDecision(`Il faut au moins un campus (une implantation) : « ${nom} ».`);
  }
  if (entree.reference && Object.values(e.campus).some((c) => c.reference === entree.reference)) {
    return {
      statut: 'existe',
      institutionId: null,
      campusIds: [],
      message: `Référence déjà importée : ${entree.reference}`,
    };
  }
  const institutionId = crypto.randomUUID();
  const campusIds: string[] = [];
  const crees: CampusFaux[] = [];
  for (const [i, c] of entree.campus.entries()) {
    let division = divisionPar(e, c.division);
    if (c.division && !division) {
      throw new ErreurDecision(`Division inconnue : « ${c.division} » (école « ${nom} »).`);
    }
    if (division && division.niveau < 2) {
      throw new ErreurDecision(
        `Un campus se place dans une ville, un arrondissement ou un quartier (école « ${nom} »).`,
      );
    }
    if (c.position && !division) division = divisionDeLaPosition(c.position, e);
    const exacte = Object.values(e.campus).some(
      (x) =>
        i === 0 &&
        division !== null &&
        x.divisionId === division.id &&
        SLUG(x.nom) === SLUG(nom) &&
        SLUG(x.etiquette ?? '') === SLUG(c.etiquette ?? ''),
    );
    if (exacte)
      return {
        statut: 'existe',
        institutionId: null,
        campusIds: [],
        message: `Déjà enregistrée : ${nom}`,
      };
    const id = crypto.randomUUID();
    campusIds.push(id);
    crees.push({
      id,
      institutionId,
      nom,
      etiquette: c.etiquette,
      quartier: c.quartier,
      publication: c.position && division ? 'prete' : 'brouillon',
      origine,
      position: c.position,
      divisionId: division?.id ?? null,
      confieeA: null,
      noteMission: null,
      genreMission: 'verify',
      typeEcole: entree.genre,
      niveaux: c.cycles.map((x) => x.cycle),
      programme: c.programme,
      repere: c.repere,
      numeroEnseigne: c.numeroEnseigne,
      formations: c.cycles.flatMap((x) => x.formations.map((f) => ({ ...f, cycle: x.cycle }))),
      reference: i === 0 ? entree.reference : null,
    });
  }
  for (const c of crees) e.campus[c.id] = c;
  return { statut: 'creee', institutionId, campusIds, message: null };
}

const admin: PortAdministration = {
  async suisAdmin() {
    await reseau();
    return lireEtat().admin;
  },
  async relevesAValider() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.releves)
      .filter((r) => (e.decisions[r.id]?.statut ?? 'a_valider') === 'a_valider')
      .map((r) => ligneDe(r, e));
  },
  async detailReleve(id) {
    await reseau();
    const e = lireEtat();
    const r = e.releves[id];
    if (!r) throw new ErreurDecision('Relevé introuvable.');
    const ligne = ligneDe(r, e);
    const d = decision(id);
    const divisionDe = (p: Point | null) => (p ? divisionDeLaPosition(p, e)?.id : null) ?? null;
    // Une correction d'une fiche pas encore acceptée reprend la position, la division et le secteur de cette fiche (#89).
    const o = r.corrigeReleveId ? e.releves[r.corrigeReleveId] : undefined;
    const herite = heriterDeLOrigine(
      { type: r.type, position: r.position, divisionId: divisionDe(r.position), lot: ligne.lot },
      o
        ? {
            campusId: e.decisions[o.id]?.ecoleId ?? null,
            position: o.position,
            divisionId: divisionDe(o.position),
            lot: o.lotId ? lotDe(o.lotId, e).nom : null,
          }
        : null,
    );
    return {
      ...ligne,
      revision: d.revision ?? null,
      lot: herite.lot,
      relaisId: MOI,
      prisLe: r.prisLe,
      position: herite.position,
      divisionId: herite.divisionId,
      corrigeUneFicheEnAttente: herite.corrigeUneFicheEnAttente,
      positionDeLaFicheDOrigine: herite.positionDeLaFicheDOrigine,
      lotDeLaFicheDOrigine: herite.lotDeLaFicheDOrigine,
      niveaux: r.niveaux,
      typeEcole: r.typeEcole,
      programme: r.programme,
      programmesVus: r.programmesVus,
      programmesEnPhoto: r.programmesEnPhoto,
      formationsVues: r.formationsVues ?? [],
      repere: r.repere,
      numeroEnseigne: r.numeroEnseigne,
      direction: r.direction,
      repasser: r.repasser,
      sigle: r.sigle ?? null,
      remarque: r.remarque ?? null,
      vusSurPlace: r.vusSurPlace ?? [],
      cloture: r.cloture ?? null,
      autreSiteDe: r.autreSiteDe ?? null,
      doublonDe:
        r.doublonDe && e.campus[r.doublonDe]
          ? { id: r.doublonDe, nom: e.campus[r.doublonDe]?.nom ?? '' }
          : null,
      corrigeReleveId: r.corrigeReleveId,
      contactConfirmeLe: d.contactConfirmeLe,
      contactFonction: d.contactFonction,
      essaiValideLe: d.essaiValideLe,
      campusId: d.ecoleId,
      campusNom: d.ecoleId ? (e.campus[d.ecoleId]?.nom ?? null) : null,
      divisionNom: d.ecoleId
        ? (e.campus[d.ecoleId]?.divisionId &&
            e.divisions[e.campus[d.ecoleId]?.divisionId ?? '']?.nom) ||
          null
        : null,
      campusPublie: d.ecoleId ? e.campus[d.ecoleId]?.publication === 'publiee' : false,
    };
  },
  async domaines() {
    await reseau();
    return [
      { slug: 'informatique', nom: 'Informatique', ordre: 10 },
      { slug: 'gestion', nom: 'Gestion', ordre: 20 },
      { slug: 'btp', nom: 'BTP', ordre: 60 },
      { slug: 'sante', nom: 'Santé', ordre: 100 },
      { slug: 'sciences-technologies', nom: 'Sciences et technologies', ordre: 160 },
      { slug: 'autre', nom: 'Autre', ordre: 999 },
    ];
  },
  async photosReleve(id) {
    await reseau();
    return Object.values(lireEtat().photos)
      .filter((p) => p.releveId === id)
      .map((p) => ({
        id: p.id,
        role: p.role,
        adresse: p.exemple ? photoExempleAdresse : '/relais/icone-512.png',
        octets: p.octets,
        largeur: 1280,
        hauteur: 960,
        prisLe: null,
        publiable: p.publiable,
        onYVoit: p.onYVoit ?? null,
      }));
  },
  async photosDeTravail(id) {
    await reseau();
    return photosAcceptees(lireEtat(), id)
      .filter((p) => ['brochure', 'programs_board', 'enrollment_poster'].includes(p.role))
      .map((p) => ({
        id: p.id,
        role: p.role,
        adresse: p.exemple ? photoExempleAdresse : '/relais/icone-512.png',
        octets: p.octets,
        largeur: 1280,
        hauteur: 960,
        prisLe: null,
        publiable: false,
        publique: false,
      }));
  },
  async photosEcole(id) {
    await reseau();
    return photosAcceptees(lireEtat(), id)
      .filter((p) => peutParaitreSurLeSite(p.role))
      .map((p) => ({
        id: p.id,
        role: p.role,
        adresse: p.exemple ? photoExempleAdresse : '/relais/icone-512.png',
        octets: p.octets,
        largeur: 1280,
        hauteur: 960,
        prisLe: null,
        publiable: p.publiable,
        publique: p.publique ?? false,
      }));
  },
  async etatPhotoPublique(ecoleId) {
    await reseau();
    const e = lireEtat();
    if (!e.campus[ecoleId]) throw new ErreurDecision('École introuvable.');
    return etatPhotoFaux(e, ecoleId);
  },
  async choisirPhotoPublique(ecoleId, photoId, confirme) {
    await reseau();
    const e = lireEtat();
    if (!e.campus[ecoleId]) throw new ErreurDecision('École introuvable.');
    if (photoId) {
      if (!confirme) {
        throw new ErreurDecision(
          'Confirme le contrôle sans enfant ni donnée personnelle et la publication.',
        );
      }
      const p = photosAcceptees(e, ecoleId).find((x) => x.id === photoId);
      if (!p || !peutParaitreSurLeSite(p.role)) {
        throw new ErreurDecision(
          'Choisis une enseigne ou une vue du bâtiment issue d’un relevé accepté de cette école.',
        );
      }
    }
    // Comme la base : le choix est écrit même s'il est nul, et un choix nul est un retrait qui bloque aussi le repli.
    ecrire((s) => {
      for (const p of photosAcceptees(s, ecoleId)) p.publique = p.id === photoId;
      const choisie = photoId ? s.photos[photoId] : undefined;
      if (choisie) choisie.publiable = true;
      s.choixPhotos[ecoleId] = photoId;
    });
  },
  async contactsReleve(id) {
    await reseau();
    const e = lireEtat();
    // Les personnes restent attachées à la fiche qui les a reçues : celles d'une fiche qu'on corrige se lisent sur sa
    // correction, que le relais les ait redonnées ou non (ticket #94). On remonte la chaîne, sans jamais boucler.
    const vus = new Set<string>();
    for (
      let courant: string | null | undefined = id;
      courant && !vus.has(courant);
      courant = e.releves[courant]?.corrigeReleveId
    ) {
      vus.add(courant);
      const personnes = personnesDe(e, courant);
      if (personnes.length > 0) {
        const fiche = courant;
        return personnes.map(([cle, c]) => ({
          id: cle,
          fonction: c.fonction,
          precisionFonction: c.precisionFonction ?? null,
          source: c.source ?? 'relais',
          nom: c.nom,
          whatsapp: c.whatsapp,
          accord: c.accord,
          accordLe: c.accordLe,
          note: c.note,
          recuLe: c.recuLe ?? c.accordLe ?? new Date().toISOString(),
          releveId: fiche,
        }));
      }
    }
    return [];
  },
  async contactsDeLEcole(ecoleId) {
    await reseau();
    const e = lireEtat();
    // Comme `contacts_of_campus` : les fiches du site (acceptées, contre-visites), puis celles qu'elles corrigent.
    const fiches = new Set<string>();
    for (const r of Object.values(e.releves)) {
      if (e.decisions[r.id]?.ecoleId !== ecoleId && r.doublonDe !== ecoleId) continue;
      for (
        let c: string | null | undefined = r.id;
        c && !fiches.has(c);
        c = e.releves[c]?.corrigeReleveId
      )
        fiches.add(c);
    }
    return Object.entries(e.contacts)
      .filter(([, c]) => fiches.has(c.releveId) || (!c.releveId && c.ecoleId === ecoleId))
      .map(([cle, c]) => {
        const releve = c.releveId ? e.releves[c.releveId] : undefined;
        return {
          id: cle,
          fonction: c.fonction,
          precisionFonction: c.precisionFonction ?? null,
          source: c.source ?? 'relais',
          nom: c.nom,
          whatsapp: c.whatsapp,
          accord: c.accord,
          accordLe: c.accordLe,
          note: c.note,
          recuLe: c.recuLe ?? c.accordLe ?? new Date().toISOString(),
          releveId: releve ? c.releveId : null,
          releveLe: releve?.prisLe ?? null,
          relais: releve ? (e.relaisDesReleves?.[releve.id] ?? '[Prénom]') : null,
        };
      })
      .sort(
        (a, b) => Number(!a.whatsapp) - Number(!b.whatsapp) || b.recuLe.localeCompare(a.recuLe),
      );
  },
  async ajouterContactEcole(ecoleId, contact) {
    await reseau();
    const e = lireEtat();
    if (!(ecoleId in e.campus)) throw new ErreurDecision('Site introuvable.');
    if (contact.whatsapp && !contact.accord) {
      throw new ErreurDecision('Sans l’accord de la personne, on ne note pas son numéro.');
    }
    const id = crypto.randomUUID();
    const maintenant = new Date().toISOString();
    ecrire((etat) => {
      etat.contacts[id] = {
        releveId: '',
        ecoleId,
        fonction: contact.fonction,
        precisionFonction: contact.fonction === 'autre' ? contact.precisionFonction : null,
        nom: contact.nom,
        whatsapp: contact.whatsapp,
        accord: contact.accord,
        accordLe: contact.accord ? maintenant : null,
        note: contact.note,
        source: 'administration',
        recuLe: maintenant,
      };
    });
    return id;
  },
  async ajouterContact(releveId, contact) {
    await reseau();
    const e = lireEtat();
    if (!(releveId in e.releves)) throw new ErreurDecision('Relevé introuvable.');
    if (contact.whatsapp && !contact.accord) {
      throw new ErreurDecision('Sans l’accord de la personne, on ne note pas son numéro.');
    }
    if (personnesDe(e, releveId).length >= 3) throw new ErreurDecision(TROIS_PERSONNES);
    const id = crypto.randomUUID();
    const maintenant = new Date().toISOString();
    ecrire((etat) => {
      etat.contacts[id] = {
        releveId,
        fonction: contact.fonction,
        precisionFonction: contact.fonction === 'autre' ? contact.precisionFonction : null,
        nom: contact.nom,
        whatsapp: contact.whatsapp,
        accord: contact.accord,
        accordLe: contact.accord ? maintenant : null,
        note: contact.note,
        source: 'administration',
        recuLe: maintenant,
      };
    });
    return id;
  },
  async corrigerContact(contactId, contact) {
    await reseau();
    const avant = lireEtat().contacts[contactId];
    if (!avant) throw new ErreurDecision('Personne introuvable.');
    if (contact.whatsapp && !contact.accord) {
      throw new ErreurDecision('Sans l’accord de la personne, on ne note pas son numéro.');
    }
    ecrire((etat) => {
      etat.contacts[contactId] = {
        ...avant,
        fonction: contact.fonction,
        precisionFonction: contact.fonction === 'autre' ? contact.precisionFonction : null,
        nom: contact.nom,
        whatsapp: contact.whatsapp,
        accord: contact.accord,
        accordLe: contact.accord ? (avant.accordLe ?? new Date().toISOString()) : null,
        note: contact.note,
      };
    });
  },
  async accepter(id, choix: DecisionAcceptation = {}) {
    await reseau();
    const e0 = lireEtat();
    const original = e0.releves[id];
    const corrections = choix.corrections ?? {};
    const releve = original
      ? { ...original, ...corrections, nomEnseigne: corrections.nom ?? original.nomEnseigne }
      : undefined;
    const avant = decision(id);
    if (avant.statut === 'refuse') {
      throw new ErreurDecision(
        'Relevé refusé : un refus est définitif. Le relais peut envoyer une nouvelle fiche.',
      );
    }
    if (avant.statut === 'accepte' && avant.ecoleId) return avant.ecoleId;
    if (releve && lotDe(releve.lotId, e0).essai) {
      throw new ErreurDecision(
        'Relevé du lot d’essai : il ne se publie jamais (le valider pour la paie d’essai).',
      );
    }
    let cible = choix.campusId ?? null;
    if (!cible && releve?.corrigeReleveId)
      cible = e0.decisions[releve.corrigeReleveId]?.ecoleId ?? null;
    if (!cible && releve?.type === 'contre_visite') cible = releve.doublonDe;
    const mode =
      choix.mode ??
      (cible ? 'update_campus' : choix.institutionId ? 'new_campus' : 'new_institution');
    if (Object.keys(corrections).length && mode !== 'new_institution')
      throw new ErreurDecision('Les corrections avant acceptation concernent une nouvelle école.');
    if ((mode === 'update_campus' || mode === 'add_cycle') && !cible) {
      throw new ErreurDecision('Il faut dire quel campus mettre à jour.');
    }
    if (mode === 'new_campus' && !choix.institutionId) {
      throw new ErreurDecision('Il faut dire à quelle institution rattacher le nouveau campus.');
    }
    if (Object.keys(corrections).length && releve) {
      const erreurs = erreursFormulaireEcole(formulaireDe({ ...releve, nom: releve.nomEnseigne }));
      if (Object.keys(erreurs).length)
        throw new ErreurDecision(Object.values(erreurs)[0] ?? 'Valeurs de correction invalides.');
    }
    // Comme la base : la division choisie par l'administration, sinon celle de la position, sinon (sans position seulement)
    // celle du lot du relais. Une position qu'aucun contour ne contient n'est plus rattachée d'office au lot.
    const choisie = choix.divisionId ? (e0.divisions[choix.divisionId] ?? null) : null;
    if (choix.divisionId && (!choisie || choisie.niveau < 2)) {
      throw new ErreurDecision(
        'Division introuvable : choisissez une ville, un arrondissement ou un quartier.',
      );
    }
    // Comme la base : une correction d'une fiche pas encore acceptée reprend la position et le secteur de cette fiche (#89).
    const origine = releve?.corrigeReleveId ? e0.releves[releve.corrigeReleveId] : undefined;
    // Comme la base (ticket 144) : l'administration peut donner la position d'une fiche qui n'en a pas ; celle du relais fait foi,
    // et de simples niveaux ajoutés ne la changent pas.
    const positionDuRelais = releve?.position ?? origine?.position ?? null;
    const positionSaisie = choix.position ?? null;
    if (positionSaisie) {
      if (!(Math.abs(positionSaisie.latitude) <= 90 && Math.abs(positionSaisie.longitude) <= 180)) {
        throw new ErreurDecision(
          'Position illisible : la latitude va de -90 à 90, la longitude de -180 à 180.',
        );
      }
      if (mode === 'add_cycle') {
        throw new ErreurDecision('Ajouter des niveaux ne change pas la position de l’école.');
      }
      if (positionDuRelais) {
        throw new ErreurDecision(
          'Cette fiche a déjà une position, mesurée par le relais : elle fait foi. Pour la changer, utilise « Écoles › Position » après l’acceptation.',
        );
      }
    }
    const positionRetenue = positionDuRelais ?? positionSaisie;
    const lotRetenu = releve?.lotId ?? origine?.lotId ?? null;
    const lotDuReleve = lotRetenu ? e0.lots.find((l) => l.id === lotRetenu) : undefined;
    const division =
      choisie ??
      (positionRetenue
        ? divisionDeLaPosition(positionRetenue, e0)
        : lotDuReleve
          ? (e0.divisions[lotDuReleve.divisionId] ?? null)
          : null);
    if ((mode === 'new_institution' || mode === 'new_campus') && !division) {
      throw new ErreurDecision(
        'Division inconnue : la position n’est dans aucune division connue (ou le relevé n’a ni position ni lot). Choisissez la division de l’école.',
      );
    }
    // Une école connue qui reçoit une position saisie passe par les règles de « Situer » (comme la base : `locate_campus`).
    let divisionSituee: DivisionFausse | null = null;
    const ecoleASituer =
      positionSaisie && mode === 'update_campus' && cible ? e0.campus[cible] : null;
    if (positionSaisie && ecoleASituer) {
      if (ecoleASituer.publication === 'retiree') {
        throw new ErreurDecision('Un campus retiré ne se modifie plus : le republier d’abord.');
      }
      divisionSituee =
        choisie ??
        divisionDeLaPosition(positionSaisie, e0) ??
        (ecoleASituer.divisionId ? (e0.divisions[ecoleASituer.divisionId] ?? null) : null);
      if (!divisionSituee) {
        throw new ErreurDecision(
          'Cette position n’est dans aucune division connue : choisis la division.',
        );
      }
      if (ecoleASituer.publication === 'publiee' && ecoleASituer.divisionId !== divisionSituee.id) {
        throw new ErreurDecision(
          `Cette position est à ${divisionSituee.nom}, pas dans la division de la fiche : son adresse publique changerait.`,
        );
      }
    }
    const campusId = cible ?? crypto.randomUUID();
    ecrire((e) => {
      const visee = e.campus[campusId];
      if (mode === 'update_campus' || mode === 'add_cycle') {
        if (visee && releve) {
          if (mode === 'update_campus') {
            // Comme la base : « Pas indiqué » et « aucun niveau » n'effacent rien ; une école à situer devient prête.
            visee.nom = visee.etiquette ? visee.nom : releve.nomEnseigne;
            visee.position = releve.position ?? visee.position;
            if (positionSaisie && divisionSituee) {
              visee.position = positionSaisie;
              visee.divisionId = divisionSituee.id;
            }
            if (releve.typeEcole !== 'non_indique') visee.typeEcole = releve.typeEcole;
            visee.programme = releve.programme ?? visee.programme ?? null;
          }
          visee.niveaux = [...new Set([...(visee.niveaux ?? []), ...releve.niveaux])];
          visee.repere = visee.repere ?? releve.repere;
          // Comme la base : une mise à jour prend le numéro du relais s'il en a saisi un (`coalesce(r.sign_phone, k.sign_phone)`) ;
          // les niveaux ajoutés à une implantation gardent le sien (`coalesce(k.sign_phone, r.sign_phone)`).
          visee.numeroEnseigne =
            mode === 'update_campus'
              ? (releve.numeroEnseigne ?? visee.numeroEnseigne ?? null)
              : (visee.numeroEnseigne ?? releve.numeroEnseigne);
          visee.divisionId = visee.divisionId ?? division?.id ?? null;
          if (visee.publication === 'brouillon') visee.publication = 'prete';
          visee.confieeA = null;
          visee.noteMission = null;
        }
      } else if (releve) {
        const institution =
          mode === 'new_campus'
            ? (Object.values(e.campus).find((c) => c.institutionId === choix.institutionId)?.nom ??
              releve.nomEnseigne)
            : releve.nomEnseigne;
        e.campus[campusId] = {
          id: campusId,
          institutionId: choix.institutionId ?? crypto.randomUUID(),
          nom: institution,
          etiquette: choix.etiquette ?? null,
          quartier: null,
          publication: 'prete',
          origine: 'field',
          position: positionRetenue,
          divisionId: division?.id ?? null,
          confieeA: null,
          noteMission: null,
          genreMission: 'verify',
          lotId: lotRetenu,
          typeEcole: releve.typeEcole,
          niveaux: releve.niveaux,
          programme: releve.programme,
          repere: releve.repere,
          numeroEnseigne: releve.numeroEnseigne,
          formations: [],
        };
      }
      const campus = e.campus[campusId];
      if (campus && choix.formations?.length) {
        const deja = new Set((campus.formations ?? []).map((f) => `${f.cycle}|${SLUG(f.titre)}`));
        for (const f of choix.formations) {
          if (f.titre.trim() === '')
            throw new ErreurDecision('Une formation sans titre : écris ce qui est affiché.');
          if (deja.has(`${f.cycle}|${SLUG(f.titre)}`)) continue;
          (campus.formations ??= []).push({ ...f, titre: f.titre.trim() });
          if (!(campus.niveaux ?? []).includes(f.cycle))
            campus.niveaux = [...(campus.niveaux ?? []), f.cycle];
        }
      }
      // Une école déjà relevée par un autre relais, ou une correction, ne se paie pas.
      const dejaAcceptee = Object.entries(e.decisions).some(
        ([autre, d]) => autre !== id && d.statut === 'accepte' && d.ecoleId === campusId,
      );
      e.decisions[id] = {
        ...avant,
        revision: Object.keys(corrections).length
          ? { valeurs: corrections, le: new Date().toISOString(), auteur: MOI }
          : null,
        statut: 'accepte',
        ecoleId: campusId,
        motif: null,
        message: null,
        payable: releve?.type !== 'correction' && !dejaAcceptee,
      };
      if (releve?.corrigeReleveId && e.decisions[releve.corrigeReleveId]) {
        const o = e.decisions[releve.corrigeReleveId];
        if (o) {
          o.statut = 'accepte';
          o.ecoleId = campusId;
        }
      }
      // Lot G : « Même lieu », noté sur la nouvelle école.
      if (choix.memeLieuQue && e.campus[campusId])
        e.campus[campusId].memeLieuQue = choix.memeLieuQue;
    });
    return campusId;
  },
  async definirMemeLieu(campusId, autreId) {
    await reseau();
    if (autreId === campusId)
      throw new ErreurDecision('Une école n’est pas « au même lieu » qu’elle-même.');
    ecrire((e) => {
      const c = e.campus[campusId];
      if (!c) throw new ErreurDecision('École introuvable.');
      c.memeLieuQue = autreId;
    });
  },
  async demanderCorrection(id, motif, message) {
    await reseau();
    // Comme la base : « autre » sans message est refusé (ticket #80).
    const manque = messageManquant(motif, message);
    if (manque) throw new ErreurDecision(manque);
    decider(id, { statut: 'a_corriger', motif, message });
  },
  async refuser(id, motif, message) {
    await reseau();
    const manque = messageManquant(motif, message);
    if (manque) throw new ErreurDecision(manque);
    decider(id, { statut: 'refuse', motif, message });
  },
  async confirmerContact(id, fonction) {
    await reseau();
    decider(id, { contactConfirmeLe: new Date().toISOString(), contactFonction: fonction });
  },
  async validerEssai(id) {
    await reseau();
    const e = lireEtat();
    const r = e.releves[id];
    if (!r || !lotDe(r.lotId, e).essai) {
      throw new ErreurDecision('Seul un relevé du lot d’essai, encore ouvert, se valide ainsi.');
    }
    decider(id, { essaiValideLe: new Date().toISOString() });
  },
  async relevesDecides() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.releves)
      .filter((r) => (e.decisions[r.id]?.statut ?? 'a_valider') !== 'a_valider')
      .map((r) => {
        const d = e.decisions[r.id];
        return {
          id: r.id,
          nomEnseigne: r.nomEnseigne,
          relais: '[Prénom]',
          lot: lotDe(r.lotId, e).nom,
          type: r.type,
          statut: d?.statut ?? 'a_valider',
          decideLe: new Date().toISOString(),
          motif: d?.motif ?? null,
          messageAuRelais: d?.message ?? null,
        };
      });
  },
  async effacerContact(contactId) {
    await reseau();
    if (!(contactId in lireEtat().contacts)) throw new ErreurDecision('Personne introuvable.');
    ecrire((e) => delete e.contacts[contactId]);
  },
  async effacerPhoto(photoId) {
    await reseau();
    if (!(photoId in lireEtat().photos)) throw new ErreurDecision('Photo introuvable.');
    ecrire((e) => {
      delete e.photos[photoId];
      // Comme la base (`on delete set null`) : le choix devient un retrait, il ne laisse pas le repli prendre le relais.
      for (const [ecole, choix] of Object.entries(e.choixPhotos)) {
        if (choix === photoId) e.choixPhotos[ecole] = null;
      }
    });
  },
  async marquerPhotoPubliable(photoId, publiable) {
    await reseau();
    const p = lireEtat().photos[photoId];
    // Comme la base : la photo choisie ne se démarque pas à la main, il faut passer par le retrait.
    if (p?.publique) throw new ErreurDecision('Utiliser la sélection de photo publique.');
    ecrire((e) => {
      const q = e.photos[photoId];
      if (q) q.publiable = publiable;
    });
  },

  async erreursRecentes(depuis, relaisId) {
    await reseau();
    // Un seul téléphone dans le faux serveur : le sien (MOI). Une autre identité n'a rien signalé.
    if (relaisId !== undefined && relaisId !== MOI) return [];
    const debut = depuis === null ? Number.NEGATIVE_INFINITY : Date.parse(depuis);
    return lireEtat()
      .erreurs.filter((l) => Date.parse(l.survenueLe) >= debut)
      .sort((a, b) => Date.parse(b.survenueLe) - Date.parse(a.survenueLe))
      .map((l) => ({
        id: l.id,
        relaisPrenom: '[Prénom]',
        survenueLe: l.survenueLe,
        ecran: l.ecran,
        code: l.code,
        detail: l.detail,
        versionApp: l.versionApp,
        appareil: l.appareil,
      }));
  },

  async ecolesPretes() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.campus).filter((c) => vueDeCampus(c, e).publication === 'prete').length;
  },
  async vueEnsemble(jours = 14) {
    await reseau();
    const e = lireEtat();
    const nb = Math.max(1, Math.min(jours, 90));
    const maintenant = Date.now();
    const releves = Object.values(e.releves);
    const statut = (id: string) => e.decisions[id]?.statut ?? 'a_valider';
    const attente = releves.filter((r) => statut(r.id) === 'a_valider');
    const dates = attente.map((r) => Date.parse(r.prisLe)).sort((a, b) => a - b);
    // Les jours à l'heure de Pointe-Noire (UTC+1), comme la base.
    const jourDe = (t: number) => new Date(t + 3_600_000).toISOString().slice(0, 10);
    const jour = (k: number) => jourDe(maintenant - (nb - 1 - k) * 86_400_000);
    const sont = (r: ReleveAEnvoyer) => lotDe(r.lotId, e).essai;
    const decides = releves.filter((r) => statut(r.id) !== 'a_valider');
    const nouvelles = releves.filter((r) => r.type === 'releve');
    const semaine = maintenant - 7 * 86_400_000;
    return {
      generee: new Date(maintenant).toISOString(),
      aValider: {
        nombre: attente.length,
        plusAncienneLe: dates[0] === undefined ? null : new Date(dates[0]).toISOString(),
        depuisPlusDe24h: dates.filter((t) => maintenant - t >= 86_400_000).length,
      },
      recusParJour: Array.from({ length: nb }, (_, k) => {
        const duJour = releves.filter((r) => jourDe(Date.parse(r.prisLe)) === jour(k));
        return { jour: jour(k), total: duJour.length, essai: duJour.filter(sont).length };
      }),
      // Le faux serveur ne garde pas la date des décisions : pas de délai.
      decisions: { nombre: decides.length, delaiMoyenHeures: null },
      enseigne: {
        avecPhoto: nouvelles.filter((r) =>
          Object.values(e.photos).some((p) => p.releveId === r.id && p.role === 'signboard'),
        ).length,
        total: nouvelles.length,
      },
      contacts: {
        confirmesTotal: releves.filter((r) => e.decisions[r.id]?.contactConfirmeLe).length,
        confirmes7j: releves.filter((r) => {
          const le = e.decisions[r.id]?.contactConfirmeLe;
          return le ? Date.parse(le) >= semaine : false;
        }).length,
      },
      relais: {
        actifs: 1 + (e.autreRelais.statut === 'actif' ? 1 : 0),
        enAttente: e.autreRelais.statut === 'en_attente' ? 1 : 0,
        suspendus: e.autreRelais.statut === 'suspendu' ? 1 : 0,
        ontEnvoye7j: releves.some((r) => Date.parse(r.prisLe) >= semaine) ? 1 : 0,
      },
    };
  },

  async relais() {
    await reseau();
    const e = lireEtat();
    if (e.relaisDeLAdmin) return e.relaisDeLAdmin;
    const siennes = Object.values(e.releves);
    const d = (id: string) => e.decisions[id]?.statut ?? 'a_valider';
    return [
      {
        id: MOI,
        prenom: '[Prénom]',
        email: 'relais@exemple.test',
        statut: e.statut,
        lotId: LOT.id,
        creeLe: '2026-10-31T08:00:00Z',
        activeLe: '2026-10-31T09:00:00Z',
        fiches: siennes.length,
        compteurs: {
          envoyees: siennes.length,
          aValider: siennes.filter((r) => d(r.id) === 'a_valider').length,
          aCorriger: siennes.filter((r) => d(r.id) === 'a_corriger').length,
          acceptees: siennes.filter((r) => d(r.id) === 'accepte' && r.type !== 'correction').length,
          refusees: siennes.filter((r) => d(r.id) === 'refuse').length,
          contactsConfirmes: siennes.filter((r) => e.decisions[r.id]?.contactConfirmeLe).length,
          // Le faux serveur tient toutes ses fiches pour « de la semaine ».
          envoyeesSemaine: siennes.length,
          positionLenteSemaine: e.erreurs.filter(
            (x) =>
              x.code === 'position_trop_longue' &&
              Date.now() - new Date(x.survenueLe).getTime() < 7 * 86_400_000,
          ).length,
        },
      },
      {
        id: AUTRE,
        prenom: '[Relais en attente]',
        email: 'marie@exemple.test',
        statut: e.autreRelais.statut,
        lotId: e.autreRelais.lotId,
        creeLe: '2026-11-01T08:00:00Z',
        activeLe: null,
        fiches: 0,
        compteurs: {
          envoyees: 0,
          aValider: 0,
          aCorriger: 0,
          acceptees: 0,
          refusees: 0,
          contactsConfirmes: 0,
          envoyeesSemaine: 0,
          positionLenteSemaine: 0,
        },
      },
    ];
  },
  async lots() {
    await reseau();
    const e = lireEtat();
    return e.lots.map((l) => {
      const division = e.divisions[l.divisionId];
      return {
        id: l.id,
        nom: l.nom,
        essai: l.essai,
        aRendreLe: l.aRendreLe,
        renduLe: l.renduLe ?? null,
        divisionId: l.divisionId,
        divisionNom: division?.nom ?? '',
        divisionChemin: division?.chemin ?? '',
      };
    });
  },
  async creerLot(nom, divisionId, aRendreLe, essai) {
    await reseau();
    const e0 = lireEtat();
    const division = e0.divisions[divisionId];
    if (nom.trim() === '') throw new ErreurDecision('Le lot a besoin d’un nom.');
    if (!division || division.niveau < 2) {
      throw new ErreurDecision(
        'Un lot se pose sur une ville, un arrondissement ou un quartier, pas sur un pays ni un département.',
      );
    }
    if (e0.lots.some((l) => l.nom === nom.trim()))
      throw new ErreurDecision('Le nom d’un lot est unique.');
    const id = crypto.randomUUID();
    ecrire((e) => e.lots.push({ id, nom: nom.trim(), essai, aRendreLe, divisionId }));
    return id;
  },
  async marquerLotRendu(lotId, rendu) {
    await reseau();
    if (!lireEtat().lots.some((l) => l.id === lotId)) throw new ErreurDecision('Lot introuvable.');
    ecrire((e) => {
      const lot = e.lots.find((l) => l.id === lotId);
      if (lot) lot.renduLe = rendu ? new Date().toISOString().slice(0, 10) : null;
    });
  },
  async activerRelais(relaisId, lotId) {
    await reseau();
    if (relaisId === AUTRE) ecrire((e) => (e.autreRelais = { statut: 'actif', lotId }));
    else ecrire((e) => (e.statut = 'actif'));
  },
  async suspendreRelais(relaisId) {
    await reseau();
    if (relaisId === AUTRE) ecrire((e) => (e.autreRelais.statut = 'suspendu'));
    else ecrire((e) => (e.statut = 'suspendu'));
  },
  async divisions() {
    await reseau();
    const e = lireEtat();
    const campus = Object.values(e.campus);
    return Object.values(e.divisions).map((d): DivisionVue => {
      const dessous = (x: CampusFaux) => {
        const cd = x.divisionId ? e.divisions[x.divisionId] : null;
        return (
          cd !== null &&
          cd !== undefined &&
          (cd.chemin === d.chemin || cd.chemin.startsWith(`${d.chemin}.`))
        );
      };
      const siens = campus.filter(dessous);
      return {
        id: d.id,
        parentId: d.parentId,
        niveau: d.niveau,
        genre: d.genre,
        nom: d.nom,
        aliases: d.aliases ?? [],
        slug: d.slug,
        chemin: d.chemin,
        ouverte: d.ouverte,
        deploiement: d.deploiement ?? null,
        ecoles: siens.length,
        publiees: siens.filter((x) => x.publication === 'publiee').length,
        relevees: siens.filter((x) => x.origine === 'field').length,
        ajoutees: siens.filter((x) => x.origine === 'admin').length,
        importees: siens.filter((x) => x.origine === 'import').length,
      };
    });
  },
  async ouvrirZone(divisionId, ouverte) {
    await reseau();
    if (!lireEtat().divisions[divisionId]) throw new ErreurDecision('Division introuvable.');
    ecrire((e) => {
      const d = e.divisions[divisionId];
      if (d) d.ouverte = ouverte;
    });
  },
  async etatPublicZone(divisionId, etat) {
    await reseau();
    if (!lireEtat().divisions[divisionId]) throw new ErreurDecision('Division introuvable.');
    ecrire((e) => {
      const d = e.divisions[divisionId];
      if (d) d.deploiement = etat;
    });
  },
  async ajouterDivision(parentId, genre, nom, adresse) {
    await reseau();
    const parent = lireEtat().divisions[parentId];
    if (!parent) throw new ErreurDecision('Division parente introuvable.');
    const slug = SLUG(adresse || nom);
    if (nom.trim() === '' || slug === '') throw new ErreurDecision('Il faut un nom.');
    const niveau = parent.niveau + 1;
    const permis: Record<number, Valeur<'geo_kind'>[]> = {
      1: ['department', 'region'],
      2: ['city', 'commune', 'district'],
      3: ['arrondissement'],
      4: ['quarter', 'zone'],
    };
    if (!permis[niveau]?.includes(genre)) {
      throw new ErreurDecision(
        'Le genre doit correspondre au niveau (un « quartier » n’est pas de niveau 3).',
      );
    }
    const chemin = `${parent.chemin}.${slug.replace(/-/g, '_')}`;
    if (Object.values(lireEtat().divisions).some((d) => d.chemin === chemin)) {
      throw new ErreurDecision('Deux divisions d’un même parent n’ont pas la même adresse.');
    }
    const id = crypto.randomUUID();
    ecrire(
      (e) => (e.divisions[id] = div(id, parentId, niveau, genre, nom.trim(), slug, chemin, false)),
    );
    return id;
  },
  async renommerDivision(divisionId, nom, aliases) {
    await reseau();
    const zone = lireEtat().divisions[divisionId];
    if (!zone) throw new ErreurDecision('Zone introuvable.');
    const propre = nom.trim();
    if (propre === '' || propre.length > 120) {
      throw new ErreurDecision('Le nom d’une zone fait de 1 à 120 caractères.');
    }
    const cle = (texte: string) =>
      texte
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const pris = Object.values(lireEtat().divisions).some(
      (d) => d.id !== zone.id && d.parentId === zone.parentId && cle(d.nom) === cle(propre),
    );
    if (pris) throw new ErreurDecision(`Une autre zone de ce parent s’appelle déjà « ${propre} ».`);
    const vues = new Set([cle(propre)]);
    const propres = aliases
      .map((a) => a.trim())
      .filter((a) => a !== '' && !vues.has(cle(a)) && vues.add(cle(a)));
    if (propres.length > 20) throw new ErreurDecision('Vingt autres écritures au plus par zone.');
    if (propres.some((a) => a.length > 80)) {
      throw new ErreurDecision('Une autre écriture fait 80 caractères au plus.');
    }
    ecrire((e) => {
      const d = e.divisions[divisionId];
      if (d) {
        d.nom = propre;
        d.aliases = propres;
      }
    });
  },
  async supprimerDivision(divisionId) {
    await reseau();
    const e = lireEtat();
    const zone = e.divisions[divisionId];
    if (!zone) throw new ErreurDecision('Zone introuvable.');
    if (zone.niveau === 0) throw new ErreurDecision('Un pays ne se supprime pas.');
    const sous = Object.values(e.divisions).filter((d) => d.parentId === divisionId).length;
    if (sous > 0) {
      throw new ErreurDecision(
        `« ${zone.nom} » contient encore ${sous} zone(s) : supprime ou garde-les d’abord.`,
      );
    }
    const ecoles = Object.values(e.campus).filter((c) => c.divisionId === divisionId).length;
    if (ecoles > 0) {
      throw new ErreurDecision(
        `« ${zone.nom} » contient ${ecoles} école(s), à la corbeille comprise : une zone qui a des écoles ne se supprime pas.`,
      );
    }
    const lots = e.lots.filter((l) => l.divisionId === divisionId).length;
    if (lots > 0) {
      throw new ErreurDecision(
        `« ${zone.nom} » a ${lots} lot(s) : une zone qui a un lot ne se supprime pas.`,
      );
    }
    if (zone.deploiement) {
      throw new ErreurDecision(
        `« ${zone.nom} » est sur la carte du site : retire-la de la carte d’abord (« Aucun »).`,
      );
    }
    if (zone.ouverte) {
      throw new ErreurDecision(`« ${zone.nom} » est ouverte aux relais : ferme-la d’abord.`);
    }
    ecrire((etat) => {
      delete etat.divisions[divisionId];
    });
  },

  async ecoles() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.campus).map((c) => vueDeCampus(c, e));
  },
  // v2 (13/11) : les nouvelles et l'admission, gardées par site.
  async nouvellesDeLEcole(ecoleId) {
    await reseau();
    return (lireEtat().nouvelles ?? [])
      .filter((n) => n.campusId === ecoleId)
      .map((n) => ({ ...n, campusId: undefined }) as NouvelleAdmin);
  },
  async publierNouvelle(ecoleId, n) {
    await reseau();
    if (!n.accord)
      throw new ErreurDecision(
        'L’accord de l’école est requis : qui, par quel canal, et quand. Sans accord, rien ne paraît.',
      );
    const id = crypto.randomUUID();
    ecrire((e) => {
      e.nouvelles = [
        ...(e.nouvelles ?? []),
        {
          id,
          campusId: ecoleId,
          genre: n.genre,
          titre: n.titre,
          texte: n.texte,
          publieeLe: n.publieeLe,
          fournieParLEcole: n.fournieParLEcole,
          etat: 'publiee',
        },
      ];
    });
    return id;
  },
  async retirerNouvelle(id) {
    await reseau();
    ecrire((e) => {
      for (const n of e.nouvelles ?? []) if (n.id === id) n.etat = 'retiree';
    });
  },
  async admissionDeLEcole(ecoleId) {
    await reseau();
    return lireEtat().admissions?.[ecoleId] ?? null;
  },
  async enregistrerAdmission(ecoleId, a) {
    await reseau();
    if (a.etapes.some((x) => x.fin && x.fin < x.debut))
      throw new ErreurDecision(
        'Vérifie les pièces (10 au plus), le lieu de dépôt (300 caractères) et le calendrier (une date par étape, la fin après le début).',
      );
    ecrire((e) => {
      e.admissions = { ...(e.admissions ?? {}), [ecoleId]: a };
    });
  },
  // v2 (13/11) : comme `attach_campus_to_institution` ; le conflit de logo se règle par `ntanova-faux-conflit-logo`.
  async rattacherSite(campusId, institutionId) {
    await reseau();
    const e0 = lireEtat();
    const c = e0.campus[campusId];
    if (!c) throw new ErreurDecision('Site introuvable, à la corbeille ou retiré.');
    if (c.institutionId === institutionId)
      throw new ErreurDecision('Ce site appartient déjà à cette école.');
    const cible = Object.values(e0.campus).find((x) => x.institutionId === institutionId);
    if (!cible) throw new ErreurDecision('École introuvable (ou sans site actif).');
    const orpheline = !Object.values(e0.campus).some(
      (x) => x.institutionId === c.institutionId && x.id !== campusId,
    );
    if (orpheline && localStorage.getItem('ntanova-faux-conflit-logo'))
      throw new ErreurDecision(
        'Les deux écoles ont un logo : retire celui qui ne vaut plus, puis rattache.',
      );
    ecrire((e) => {
      const site = e.campus[campusId]!;
      site.institutionId = institutionId;
      site.nom = cible.nom;
    });
    return { ancienneSupprimee: orpheline };
  },
  async institutions() {
    await reseau();
    const e = lireEtat();
    const parInstitution = new Map<string, CampusFaux[]>();
    for (const c of Object.values(e.campus)) {
      parInstitution.set(c.institutionId, [...(parInstitution.get(c.institutionId) ?? []), c]);
    }
    return [...parInstitution.entries()].map(([id, liste]) => ({
      id,
      nom: liste[0]?.nom ?? '',
      genre: typeConnu(liste[0]?.typeEcole ?? 'non_indique'),
      campus: liste.map((c) => ({
        id: c.id,
        etiquette: c.etiquette,
        division: c.divisionId ? (e.divisions[c.divisionId]?.nom ?? null) : null,
        publication: c.publication,
      })),
    }));
  },
  async creerEcole(entree, declaration) {
    await reseau();
    if (declaration && Object.keys(erreursDeclaration(declaration)).length)
      throw new ErreurDecision('Date et confirmation de la déclaration requises.');
    if (declaration && entree.campus.some((c) => c.numeroEnseigne !== null))
      throw new ErreurDecision('Le contact public nécessite son accord séparé.');
    const origine = declaration ? 'school' : 'admin';
    // Les erreurs d'abord, sans rien écrire ; puis l'écriture, dont on rend les identifiants (ceux qui existent).
    creerEntree(lireEtat(), entree, origine);
    let resultat!: ReturnType<typeof creerEntree>;
    ecrire((e) => {
      resultat = creerEntree(e, entree, origine);
      if (resultat.statut === 'creee' && declaration)
        for (const id of resultat.campusIds) e.campus[id]!.declareeLe = declaration.declareeLe;
    });
    return resultat;
  },
  async importerEcoles(entrees, simulation) {
    await reseau();
    const rapport: RapportImport = {
      simulation,
      total: entrees.length,
      creees: 0,
      existantes: 0,
      erreurs: [],
    };
    if (entrees.length > 1000)
      throw new ErreurDecision('Au plus mille écoles par importation : couper la liste.');
    const e = lireEtat();
    for (const [i, entree] of entrees.entries()) {
      try {
        const r = creerEntree(e, entree, 'import');
        if (r.statut === 'creee') rapport.creees++;
        else rapport.existantes++;
      } catch (erreur) {
        rapport.erreurs.push({
          ligne: i + 1,
          nom: entree.nom || null,
          message: erreur instanceof Error ? erreur.message : 'erreur',
        });
      }
    }
    if (!simulation) localStorage.setItem(CLE, JSON.stringify(e));
    return rapport;
  },
  async modifierEcole(ecoleId, correction) {
    const frais = lireEtat().campus[ecoleId]?.frais ?? [];
    if (correction.niveaux && frais.some((f) => !correction.niveaux!.includes(f.cycle)))
      throw new ErreurDecision('Retire d’abord les frais déclarés pour ce cycle.');
    await reseau();
    if (!lireEtat().campus[ecoleId]) {
      throw new ErreurDecision('École introuvable, ou modification refusée.');
    }
    ecrire((e) => {
      const ecole = e.campus[ecoleId];
      if (!ecole) return;
      if (correction.nom !== undefined) ecole.nom = correction.nom;
      if (correction.typeEcole !== undefined) ecole.typeEcole = correction.typeEcole;
      if (correction.niveaux !== undefined) ecole.niveaux = correction.niveaux;
      if (correction.programme !== undefined) ecole.programme = correction.programme;
      if (correction.repere !== undefined) ecole.repere = correction.repere;
      if (correction.numeroEnseigne !== undefined) ecole.numeroEnseigne = correction.numeroEnseigne;
    });
  },
  async confierEcole(ecoleId, relaisId, genre, note, details) {
    await reseau();
    const e = lireEtat();
    const actif = relaisId === MOI ? e.statut === 'actif' : e.autreRelais.statut === 'actif';
    if (!actif) throw new ErreurDecision('Ce relais n’est pas actif : l’activer d’abord.');
    ecrire((etat) => {
      const ecole = etat.campus[ecoleId];
      if (ecole)
        Object.assign(ecole, {
          confieeA: relaisId,
          confieeLe: new Date().toISOString(),
          noteMission: note,
          genreMission: genre,
          detailsMission: details ?? null,
        });
    });
  },
  // v2 (13/11) : comme `campus_gaps` : logo, photos, frais, contact, puis les demandes précisées ; « demandé le … ».
  async manquesDeLEcole(ecoleId) {
    await reseau();
    const e = lireEtat();
    const c = e.campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    const ouvertes = (e.demandes ?? []).filter(
      (d) => d.campusId === ecoleId && d.etat === 'ouverte',
    );
    const medias = (e.medias ?? []).filter((m) => m.campusId === ecoleId);
    const calcules: Manque['sujet'][] = [
      ...(medias.some((m) => m.genre === 'logo') ? [] : (['logo'] as const)),
      ...(medias.some((m) => m.genre === 'gallery') ? [] : (['photos'] as const)),
      ...((c.frais ?? []).length > 0 ? [] : (['frais'] as const)),
      ...(c.contactPublic ? [] : (['contact'] as const)),
      // 17/11 : ni passage d'un relais ni confirmation (le faux n'a pas la date de passage : son origine la dit).
      ...((c.origine === 'admin' || c.origine === 'school') && !c.verifieeLe
        ? (['visite'] as const)
        : []),
    ];
    const qui = (s: Manque['sujet']): Manque['quiPeut'] =>
      s === 'logo' ? ['ecole'] : s === 'visite' ? ['relais'] : ['ecole', 'relais'];
    return [
      ...calcules.map((sujet) => {
        const d = ouvertes.find((x) => x.sujet === sujet && !x.detail);
        return {
          sujet,
          detail: null,
          quiPeut: qui(sujet),
          demandeLe: d?.le ?? null,
          demandeA: d?.a ?? null,
          demandeId: d?.id ?? null,
        };
      }),
      ...ouvertes
        .filter((d) => d.detail)
        .map((d) => ({
          sujet: d.sujet,
          detail: d.detail,
          quiPeut: qui(d.sujet),
          demandeLe: d.le,
          demandeA: d.a,
          demandeId: d.id,
        })),
    ];
  },
  async demanderALEcole(ecoleId, sujet, detail) {
    await reseau();
    if (sujet === 'autre' && !detail?.trim())
      throw new ErreurDecision('Dis ce qui est demandé (et précise « autre »), et à qui.');
    const id = crypto.randomUUID();
    ecrire((e) => {
      e.demandes = [
        ...(e.demandes ?? []),
        { id, campusId: ecoleId, sujet, detail, le: jourDuCongo(), a: 'ecole', etat: 'ouverte' },
      ];
    });
    return id;
  },
  async fermerDemande(demandeId, etat) {
    await reseau();
    let trouvee = false;
    ecrire((e) => {
      for (const d of e.demandes ?? [])
        if (d.id === demandeId && d.etat === 'ouverte') {
          d.etat = etat;
          trouvee = true;
        }
    });
    if (!trouvee) throw new ErreurDecision('Cette demande est déjà fermée.');
  },
  async mediasDeLEcole(ecoleId) {
    await reseau();
    return (lireEtat().medias ?? [])
      .filter((m) => m.campusId === ecoleId)
      .map((m) => ({ ...m, campusId: undefined }) as MediaAdmin);
  },
  async ajouterMedia(ecoleId, m) {
    await reseau();
    const deja = (lireEtat().medias ?? []).filter((x) => x.campusId === ecoleId);
    if (m.genre === 'logo' && deja.some((x) => x.genre === 'logo'))
      throw new ErreurDecision('Cette école a déjà un logo : retire-le d’abord.');
    if (m.genre === 'cover' && deja.some((x) => x.genre === 'cover'))
      throw new ErreurDecision('Ce site a déjà une couverture : retire-la d’abord.');
    if (m.genre === 'gallery' && deja.filter((x) => x.genre === 'gallery').length >= 12)
      throw new ErreurDecision('Douze images au plus dans la galerie.');
    if (m.publique && !m.controle)
      throw new ErreurDecision('Une image non contrôlée ne se publie pas.');
    const id = crypto.randomUUID();
    ecrire((e) => {
      e.medias = [
        ...(e.medias ?? []),
        {
          id,
          campusId: ecoleId,
          genre: m.genre,
          sujet: m.sujet,
          legende: m.legende,
          adresse: '/relais/icone-512.png',
          controleLe: m.controle ? new Date().toISOString() : null,
          publique: m.publique,
          source: m.photoDuReleve ? 'terrain' : 'administration',
        },
      ];
    });
    return id;
  },
  async modifierMedia(mediaId, champs) {
    await reseau();
    ecrire((e) => {
      const m = (e.medias ?? []).find((x) => x.id === mediaId);
      if (!m) return;
      if (champs.legende !== undefined) m.legende = champs.legende;
      if (champs.controle !== undefined)
        m.controleLe = champs.controle ? new Date().toISOString() : null;
      if (champs.publique !== undefined) m.publique = champs.publique && m.controleLe !== null;
    });
  },
  async retirerMedia(mediaId) {
    await reseau();
    ecrire((e) => {
      e.medias = (e.medias ?? []).filter((m) => m.id !== mediaId);
    });
  },
  async reprendreEcole(ecoleId) {
    await reseau();
    ecrire((etat) => {
      const ecole = etat.campus[ecoleId];
      if (ecole) Object.assign(ecole, { confieeA: null, noteMission: null });
    });
  },
  async situerEcole(ecoleId, position, divisionId = null) {
    await reseau();
    const e0 = lireEtat();
    const choisie = divisionId ? e0.divisions[divisionId] : undefined;
    const trouvee = choisie ?? divisionDeLaPosition(position, e0) ?? undefined;
    const ecole = e0.campus[ecoleId];
    if (!ecole) throw new ErreurDecision('École introuvable.');
    if (ecole.publication === 'retiree') {
      throw new ErreurDecision('Une école retirée ne se modifie plus : la republier d’abord.');
    }
    const division = trouvee ?? (ecole.divisionId ? e0.divisions[ecole.divisionId] : undefined);
    if (!division)
      throw new ErreurDecision(
        'Cette position n’est dans aucune division connue : choisis la division.',
      );
    if (ecole.publication === 'publiee' && ecole.divisionId !== division.id) {
      throw new ErreurDecision(
        `Cette position est à ${division.nom}, pas dans la division de la fiche : son adresse publique changerait.`,
      );
    }
    ecrire((e) => {
      const visee = e.campus[ecoleId];
      if (!visee) return;
      visee.position = position;
      visee.divisionId = division.id;
      if (visee.publication === 'brouillon') visee.publication = 'prete';
    });
    return division.nom;
  },
  async publierEcole(ecoleId) {
    await reseau();
    const ecole = lireEtat().campus[ecoleId];
    if (
      !ecole ||
      !['prete', 'retiree'].includes(ecole.publication) ||
      ecole.retrait?.remplaceePar
    ) {
      throw new ErreurDecision(
        'Seul un campus prêt ou retiré se publie (un campus à situer attend sa position).',
      );
    }
    ecrire((e) =>
      Object.assign(e.campus[ecoleId] ?? {}, { publication: 'publiee', retrait: null }),
    );
  },
  async publierDivision(divisionId) {
    await reseau();
    const e0 = lireEtat();
    const racine = e0.divisions[divisionId];
    let n = 0;
    ecrire((e) => {
      for (const ecole of Object.values(e.campus)) {
        const d = ecole.divisionId ? e.divisions[ecole.divisionId] : null;
        const dedans =
          racine && d && (d.chemin === racine.chemin || d.chemin.startsWith(`${racine.chemin}.`));
        if (ecole.publication === 'prete' && ecole.position && dedans) {
          ecole.publication = 'publiee';
          n++;
        }
      }
    });
    return n;
  },
  async publierLot(lotId) {
    await reseau();
    let n = 0;
    ecrire((e) => {
      for (const ecole of Object.values(e.campus)) {
        if (ecole.publication === 'prete' && ecole.lotId === lotId) {
          ecole.publication = 'publiee';
          n++;
        }
      }
    });
    return n;
  },
  async mettreALaCorbeille(ecoleId, motif, note) {
    await reseau();
    const ecole = lireEtat().campus[ecoleId];
    if (!ecole || ecole.corbeille) {
      throw new ErreurDecision('Cette école est introuvable ou déjà à la corbeille.');
    }
    ecrire((e) =>
      Object.assign(e.campus[ecoleId] ?? {}, {
        corbeille: { le: new Date().toISOString(), avant: ecole.publication },
        publication: 'retiree',
        retrait: ecole.retrait ?? { motif, le: new Date().toISOString(), note, remplaceePar: null },
        confieeA: null,
      }),
    );
  },
  async restaurerEcole(ecoleId) {
    await reseau();
    const ecole = lireEtat().campus[ecoleId];
    if (!ecole?.corbeille) {
      throw new ErreurDecision('Cette école est introuvable ou n’est pas à la corbeille.');
    }
    const avant = ecole.corbeille.avant;
    ecrire((e) =>
      Object.assign(e.campus[ecoleId] ?? {}, {
        corbeille: null,
        publication: avant === 'publiee' ? 'prete' : avant,
        retrait: avant === 'retiree' ? ecole.retrait : null,
      }),
    );
  },
  async apercuSuppression(ecoleId) {
    await reseau();
    const e = lireEtat();
    const ecole = e.campus[ecoleId];
    if (!ecole) throw new ErreurDecision('Cette école est introuvable.');
    const fiches = Object.entries(e.decisions).filter(([, d]) => d.ecoleId === ecoleId);
    return {
      nom: ecole.nom,
      bloque: ecole.corbeille ? null : 'Mets l’école à la corbeille d’abord.',
      fiches: fiches.length,
      photos: fiches.length,
      contacts: fiches.length,
    };
  },
  async supprimerDefinitivement(ecoleId) {
    await reseau();
    const e = lireEtat();
    const ecole = e.campus[ecoleId];
    if (!ecole) throw new ErreurDecision('Cette école est introuvable.');
    if (!ecole.corbeille) throw new ErreurDecision('Mets l’école à la corbeille d’abord.');
    ecrire((s) => {
      const ids = Object.entries(s.decisions)
        .filter(([, d]) => d.ecoleId === ecoleId)
        .map(([id]) => id);
      for (const id of ids) {
        delete s.decisions[id];
        delete s.releves[id];
      }
      delete s.campus[ecoleId];
    });
  },
  async retirerEcole(ecoleId, motif, note) {
    await reseau();
    const ecole = lireEtat().campus[ecoleId];
    if (!ecole || !['prete', 'publiee'].includes(ecole.publication)) {
      throw new ErreurDecision('Seul un campus prêt ou publié se retire.');
    }
    ecrire((e) =>
      Object.assign(e.campus[ecoleId] ?? {}, {
        publication: 'retiree',
        retrait: { motif, le: new Date().toISOString(), note, remplaceePar: null },
        confieeA: null,
      }),
    );
  },
  async fusionnerEcoles(doublonId, gardeeId) {
    await reseau();
    ecrire((e) =>
      Object.assign(e.campus[doublonId] ?? {}, {
        publication: 'retiree',
        retrait: {
          motif: 'doublon',
          le: new Date().toISOString(),
          note: null,
          remplaceePar: gardeeId,
        },
      }),
    );
  },

  async enregistrerEquipement(ecoleId, equipement, id) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    if (id && !(c.equipements ?? []).some((e) => e.id === id))
      throw new ErreurDecision('Équipement introuvable.');
    const resultat = lireEquipement({
      ...saisieDeEquipement({ ...equipement, id: id ?? '' }),
      confirme: true,
    });
    if (!resultat.equipement) throw new ErreurDecision(resultat.erreur!);
    if (
      (c.equipements ?? []).some(
        (e) => e.id !== id && e.cle === equipement.cle && e.precision === equipement.precision,
      )
    )
      throw new ErreurDecision('Cet équipement existe déjà : modifie sa ligne.');
    const identifiant = id ?? crypto.randomUUID();
    ecrire((e) => {
      const c = e.campus[ecoleId]!;
      c.equipements = [
        ...(c.equipements ?? []).filter((e) => e.id !== identifiant),
        { ...resultat.equipement!, id: identifiant },
      ];
    });
    return identifiant;
  },
  async retirerEquipement(ecoleId, id) {
    await reseau();
    if (!(lireEtat().campus[ecoleId]?.equipements ?? []).some((e) => e.id === id))
      throw new ErreurDecision('Équipement introuvable.');
    ecrire((e) => {
      const c = e.campus[ecoleId]!;
      c.equipements = (c.equipements ?? []).filter((e) => e.id !== id);
    });
  },

  async enregistrerFraisEcole(ecoleId, frais, id) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c || !(c.niveaux ?? []).includes(frais.cycle))
      throw new ErreurDecision('Ce cycle doit être renseigné dans la fiche de l’école.');
    if (id && !(c.frais ?? []).some((f) => f.id === id))
      throw new ErreurDecision('Ligne de frais introuvable.');
    const resultat = lireFraisEcole({
      ...saisieDeFrais({ ...frais, id: id ?? '' }),
      declarationConfirmee: true,
    });
    if (!resultat.frais) throw new ErreurDecision(resultat.erreur!);
    if (
      (c.frais ?? []).some(
        (f) =>
          f.id !== id &&
          f.cycle === frais.cycle &&
          f.periode === frais.periode &&
          f.precisionPeriode === frais.precisionPeriode &&
          f.anneeScolaire === frais.anneeScolaire &&
          (f.classe ?? null) === (frais.classe ?? null),
      )
    )
      throw new ErreurDecision(
        'Une ligne existe déjà pour cette classe, cette période et cette année scolaire : modifie-la.',
      );
    const identifiant = id ?? crypto.randomUUID();
    // Comme `set_school_fee` (lot 1) : une ligne neuve attend le OUI de l'école ; une ligne modifiée le perd.
    const avant = (c.frais ?? []).find((f) => f.id === id);
    const garde =
      avant?.confirmeLe &&
      !ligneChangee(avant, resultat.frais) &&
      (avant.photoPreuve ?? null) === (resultat.frais.photoPreuve ?? null)
        ? avant.confirmeLe
        : null;
    ecrire((e) => {
      const c = e.campus[ecoleId]!;
      c.frais = [
        ...(c.frais ?? []).filter((f) => f.id !== identifiant),
        {
          ...resultat.frais!,
          id: identifiant,
          preuve: resultat.frais!.photoPreuve ? 'prospectus' : 'declaration',
          confirmeLe: garde,
        },
      ];
    });
    return identifiant;
  },
  async confirmerFraisEcole(ecoleId, confirmeLe) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    const oui = etatDuOui(c.frais ?? []);
    if (oui.etat !== 'attend')
      throw new ErreurDecision('Aucune ligne de frais n’attend le OUI de cette école.');
    const erreur = erreurDuOui(confirmeLe, oui.auPlusTot);
    if (erreur) throw new ErreurDecision(erreur);
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.frais = (campus.frais ?? []).map((f) => (f.confirmeLe ? f : { ...f, confirmeLe }));
    });
    return oui.lignes;
  },
  async enregistrerPlaces(ecoleId, places, id) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    if (id && !(c.places ?? []).some((p) => p.id === id))
      throw new ErreurDecision('Annonce introuvable.');
    const lu = lirePlaces(saisieDePlaces(places), c.niveaux ?? []);
    if (!lu.places) throw new ErreurDecision(lu.erreur!);
    if (
      (c.places ?? []).some(
        (p) => p.id !== id && p.cycle === places.cycle && p.classe === lu.places!.classe,
      )
    )
      throw new ErreurDecision('Une annonce existe déjà pour cette classe : modifie-la.');
    const identifiant = id ?? crypto.randomUUID();
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.places = [
        ...(campus.places ?? []).filter((p) => p.id !== identifiant),
        { ...lu.places!, id: identifiant, finLe: finDeLAnnonce(lu.places!.ditLe) },
      ];
    });
    return identifiant;
  },
  async retirerPlaces(ecoleId, id) {
    await reseau();
    if (!(lireEtat().campus[ecoleId]?.places ?? []).some((p) => p.id === id))
      throw new ErreurDecision('Annonce introuvable.');
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.places = (campus.places ?? []).filter((p) => p.id !== id);
    });
  },
  async enregistrerEffectif(ecoleId, effectif, id) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    if (id && !(c.effectifs ?? []).some((t) => t.id === id))
      throw new ErreurDecision('Effectif introuvable.');
    const lu = lireEffectif(saisieDEffectif(effectif), c.niveaux ?? []);
    if (!lu.effectif) throw new ErreurDecision(lu.erreur!);
    if (
      (c.effectifs ?? []).some(
        (t) => t.id !== id && t.cycle === effectif.cycle && t.classe === lu.effectif!.classe,
      )
    )
      throw new ErreurDecision('Un effectif existe déjà pour cette classe : modifie-le.');
    const identifiant = id ?? crypto.randomUUID();
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.effectifs = [
        ...(campus.effectifs ?? []).filter((t) => t.id !== identifiant),
        { ...lu.effectif!, id: identifiant },
      ];
    });
    return identifiant;
  },
  async retirerEffectif(ecoleId, id) {
    await reseau();
    if (!(lireEtat().campus[ecoleId]?.effectifs ?? []).some((t) => t.id === id))
      throw new ErreurDecision('Effectif introuvable.');
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.effectifs = (campus.effectifs ?? []).filter((t) => t.id !== id);
    });
  },
  async demandesDesFamilles(depuis) {
    await reseau();
    return (lireEtat().demandesFamilles ?? [])
      .filter((d) => d.jour >= depuis)
      .sort((a, b) => b.jour.localeCompare(a.jour));
  },
  async retirerFraisEcole(ecoleId, id) {
    await reseau();
    if (!(lireEtat().campus[ecoleId]?.frais ?? []).some((f) => f.id === id))
      throw new ErreurDecision('Ligne de frais introuvable.');
    ecrire((e) => {
      const c = e.campus[ecoleId]!;
      c.frais = (c.frais ?? []).filter((f) => f.id !== id);
    });
  },

  async enregistrerAgrement(ecoleId, agrement) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    const resultat = lireAgrement({
      ...agrement,
      formationId: agrement.formationId ?? '',
      precision: agrement.precision ?? '',
      sourceLien: agrement.sourceLien ?? '',
      documentVu: true,
    });
    if (!resultat.agrement) throw new ErreurDecision(resultat.erreur!);
    const deja = (c.agrements ?? []).find((a) => a.formationId === agrement.formationId);
    const id = deja?.id ?? crypto.randomUUID();
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.agrements = [
        ...(campus.agrements ?? []).filter((a) => a.id !== id),
        // Comme la base : modifier la référence garde sa preuve.
        {
          ...resultat.agrement!,
          id,
          preuve: deja?.preuve ?? null,
          preuveDetail: deja?.preuveDetail ?? null,
        },
      ];
    });
    return id;
  },
  async enregistrerPreuveAgrement(ecoleId, agrementId, preuve) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    const a = c?.agrements?.find((x) => x.id === agrementId);
    if (!c || !a) throw new ErreurDecision('Agrément introuvable.');
    if (preuve.genre !== 'photo' && (preuve.photoId || preuve.image))
      throw new ErreurDecision(
        'La preuve est une photo du document (d’un relevé ou téléversée), le document vu sur place, ou l’école qui le dit.',
      );
    if (preuve.genre === 'photo' && !preuve.photoId && !preuve.image)
      throw new ErreurDecision('Choisis la photo du document, ou ajoute-la.');
    // Le faux serveur ne garde pas le fichier : il garde son chemin, comme la base.
    const chemin = preuve.image ? `ecoles/${ecoleId}/preuves/${crypto.randomUUID()}.webp` : null;
    ecrire((e) => {
      const x = e.campus[ecoleId]!.agrements!.find((y) => y.id === agrementId)!;
      x.preuve = preuve.genre;
      x.preuveDetail = {
        genre: preuve.genre,
        photoId: chemin ? null : (preuve.photoId ?? null),
        chemin,
      };
    });
  },
  async adresseDePreuve(chemin) {
    await reseau();
    return chemin.includes('/preuves/') ? '/relais/icone-512.png' : null;
  },
  async ecolesSimilaires(nom, position, exclureReleve) {
    await reseau();
    void exclureReleve;
    // Les mêmes règles que `similar_schools`, sur les sites du faux serveur (le nom sans les mots génériques).
    return Object.values(lireEtat().campus)
      .filter((c) => c.publication !== 'retiree' && !c.corbeille)
      .flatMap((c) => {
        const distanceM =
          position && c.position ? Math.round(distanceMetres(position, c.position)) : null;
        const r = ressemblance(noyauDuNom(nom), noyauDuNom(c.nom));
        const verdict = verdictDeProximite(distanceM, r);
        return verdict
          ? [
              {
                genre: 'campus' as const,
                id: c.id,
                institutionId: c.institutionId,
                nom: c.etiquette ? `${c.nom} — ${c.etiquette}` : c.nom,
                sigle: null,
                etat: c.publication,
                distanceM,
                ressemblance: r,
                verdict,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          ['deja_la', 'autre_site', 'voisine'].indexOf(a.verdict) -
            ['deja_la', 'autre_site', 'voisine'].indexOf(b.verdict) ||
          (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9),
      )
      .slice(0, 10);
  },
  async formationsDeLEcole(ecoleId) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    return (c?.formations ?? [])
      .filter((f) => ['superieur', 'technique', 'autre_formation'].includes(f.cycle))
      .map((f) => {
        const id = `${f.cycle}|${f.titre}`;
        return {
          id,
          titre: f.titre,
          cycle: f.cycle,
          details: c?.detailsFormations?.[id] ?? detailsVides(),
          diplome: f.diplome,
          domaine: f.domaine,
          rythmes: f.rythmes,
          fraisParAn: c?.ficheFormations?.[id]?.fraisParAn ?? null,
          autorisation: c?.ficheFormations?.[id]?.autorisation ?? null,
          seriesAdmises: c?.ficheFormations?.[id]?.seriesAdmises ?? null,
        };
      });
  },
  async enregistrerDetailsFormation(formationId, d) {
    await reseau();
    const erreur = erreurDesDetails(d, jourDuCongo());
    if (erreur) throw new ErreurDecision(erreur);
    const c = Object.values(lireEtat().campus).find((x) =>
      (x.formations ?? []).some((f) => `${f.cycle}|${f.titre}` === formationId),
    );
    if (!c) throw new ErreurDecision('Formation introuvable.');
    ecrire((e) => {
      const campus = e.campus[c.id]!;
      campus.detailsFormations = {
        ...(campus.detailsFormations ?? {}),
        [formationId]: sansDetail(d) ? detailsVides() : d,
      };
    });
  },
  async ajouterFormation(ecoleId, cycle, titre) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    const nom = titre.trim();
    if (!nom) throw new ErreurDecision('Écris l’intitulé de la formation.');
    if (!['superieur', 'technique', 'autre_formation'].includes(cycle))
      throw new ErreurDecision('Ce cycle n’a pas de formations à détailler.');
    if (!(c.niveaux ?? []).includes(cycle))
      throw new ErreurDecision(
        'Ce site n’enseigne pas ce cycle : ajoute-le d’abord dans « En bref ».',
      );
    const id = `${cycle}|${nom}`;
    if (
      (c.formations ?? []).some((f) => `${f.cycle}|${f.titre}`.toLowerCase() === id.toLowerCase())
    )
      throw new ErreurDecision('Une formation de ce cycle porte déjà cet intitulé.');
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.formations = [
        ...(campus.formations ?? []),
        { cycle, titre: nom, domaine: null, serie: null, diplome: null, rythmes: [] },
      ];
    });
    return id;
  },
  async enregistrerFormation(formationId, fiche) {
    await reseau();
    const erreur = erreurDeLaFiche(fiche, jourDuCongo());
    if (erreur) throw new ErreurDecision(erreur);
    const c = Object.values(lireEtat().campus).find((x) =>
      (x.formations ?? []).some((f) => `${f.cycle}|${f.titre}` === formationId),
    );
    if (!c) throw new ErreurDecision('Formation introuvable.');
    const ancienne = (c.formations ?? []).find((f) => `${f.cycle}|${f.titre}` === formationId)!;
    const titre = fiche.titre.trim();
    const nouvelId = `${ancienne.cycle}|${titre}`;
    if (
      nouvelId !== formationId &&
      (c.formations ?? []).some(
        (f) => `${f.cycle}|${f.titre}`.toLowerCase() === nouvelId.toLowerCase(),
      )
    )
      throw new ErreurDecision('Une formation de ce cycle porte déjà cet intitulé.');
    const autorisation = fiche.autorisation
      ? { ...fiche.autorisation, id: fiche.autorisation.id ?? `autorisation-${nouvelId}` }
      : null;
    ecrire((e) => {
      const campus = e.campus[c.id]!;
      campus.formations = (campus.formations ?? []).map((f) =>
        f === ancienne || `${f.cycle}|${f.titre}` === formationId
          ? { ...f, titre, diplome: fiche.diplome, domaine: fiche.domaine, rythmes: fiche.rythmes }
          : f,
      );
      const fraisParAn = fiche.fraisParAn;
      const details: DetailsFormation = {
        dureeAnnees: fiche.dureeAnnees,
        niveauDemande: fiche.niveauDemande,
        selection: fiche.selection,
        fraisDossier: fiche.fraisDossier,
        delivrePar: fiche.delivrePar,
        ditLe: fiche.ditLe,
      };
      const detailsF = { ...(campus.detailsFormations ?? {}) };
      const fiches = { ...(campus.ficheFormations ?? {}) };
      delete detailsF[formationId];
      delete fiches[formationId];
      detailsF[nouvelId] = sansDetail(details) ? detailsVides() : details;
      // Comme `save_program_sheet` : une liste vide se lit « pas dit » ; absente, la fiche garde ce qu'elle avait.
      const series =
        fiche.seriesAdmises === undefined
          ? (campus.ficheFormations?.[formationId]?.seriesAdmises ?? null)
          : fiche.seriesAdmises.length
            ? [...new Set(fiche.seriesAdmises)]
            : null;
      fiches[nouvelId] = { fraisParAn, autorisation, seriesAdmises: series };
      campus.detailsFormations = detailsF;
      campus.ficheFormations = fiches;
    });
    return autorisation?.id ?? null;
  },
  async retirerAgrement(id) {
    await reseau();
    const ecole = Object.values(lireEtat().campus).find((c) =>
      (c.agrements ?? []).some((a) => a.id === id),
    );
    if (!ecole) throw new ErreurDecision('Agrément introuvable.');
    ecrire((e) => {
      const campus = e.campus[ecole.id]!;
      campus.agrements = (campus.agrements ?? []).filter((a) => a.id !== id);
    });
  },
  async enregistrerMotDirection(ecoleId, mot) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    if (mot) {
      const resultat = lireMotDirection({ ...mot, accord: true });
      if (resultat.erreur) throw new ErreurDecision(resultat.erreur);
    } else if (!c.motDirection) {
      throw new ErreurDecision('Cette école n’a pas de mot de la direction.');
    }
    ecrire((e) => {
      e.campus[ecoleId]!.motDirection = mot ? { texte: mot.texte, ditLe: mot.ditLe } : null;
    });
  },
  async enregistrerDateInscription(ecoleId, date, id) {
    await reseau();
    const c = lireEtat().campus[ecoleId];
    if (!c) throw new ErreurDecision('École introuvable.');
    const resultat = lireDateInscription(date);
    if (!resultat.date) throw new ErreurDecision(resultat.erreur!);
    if (id && !(c.inscriptions ?? []).some((d) => d.id === id))
      throw new ErreurDecision('Date d’inscription introuvable.');
    if (
      (c.inscriptions ?? []).some(
        (d) => d.id !== id && d.anneeScolaire === resultat.date!.anneeScolaire,
      )
    )
      throw new ErreurDecision('Une date existe déjà pour cette année scolaire : modifie-la.');
    const identifiant = id ?? crypto.randomUUID();
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.inscriptions = [
        ...(campus.inscriptions ?? []).filter((d) => d.id !== identifiant),
        { ...resultat.date!, id: identifiant },
      ];
    });
    return identifiant;
  },
  async retirerDateInscription(ecoleId, id) {
    await reseau();
    if (!(lireEtat().campus[ecoleId]?.inscriptions ?? []).some((d) => d.id === id))
      throw new ErreurDecision('Date d’inscription introuvable.');
    ecrire((e) => {
      const campus = e.campus[ecoleId]!;
      campus.inscriptions = (campus.inscriptions ?? []).filter((d) => d.id !== id);
    });
  },

  async enregistrerContactPublic(ecoleId, contact) {
    await reseau();
    if (!lireEtat().campus[ecoleId]) throw new ErreurDecision('École introuvable.');
    if (contact) {
      const resultat = lireAccordContactPublic({ ...contact, autorise: true });
      if (resultat.erreur) throw new ErreurDecision(resultat.erreur);
    }
    ecrire((e) => {
      e.campus[ecoleId]!.contactPublic = contact
        ? { numero: contact.numero, accordLe: contact.accordLe }
        : null;
    });
  },

  async enregistrerVerification(campusId, accordLe) {
    await reseau();
    const e = lireEtat();
    const accepte = Object.values(e.decisions).some(
      (d) => d.statut === 'accepte' && d.ecoleId === campusId,
    );
    if (!accepte) {
      throw new ErreurDecision(
        'Aucun relais n’a constaté ce campus sur place : le badge « Vérifié » exige les deux.',
      );
    }
    if (!accordLe || new Date(accordLe).getTime() > Date.now() + 86_400_000) {
      throw new ErreurDecision('Il faut la date de l’accord de la direction, pas dans le futur.');
    }
    ecrire((s) => {
      const c = s.campus[campusId];
      if (c) c.verifieeLe = accordLe;
    });
  },
  async noterMessageEnvoye(campusId) {
    await reseau();
    ecrire((e) => (e.messages[campusId] ??= new Date().toISOString()));
  },

  async soldesPaie() {
    await reseau();
    const e = lireEtat();
    const ids = new Set([
      ...(await apercuDuFaux()).map((l) => l.relaisId),
      ...(e.paieMissions?.length ? [MOI] : []),
      ...e.paie.semaines.flatMap((x) => x.lignes.map((l) => l.relaisId)),
      ...(e.paie.versements ?? []).map((v) => v.relaisId),
    ]);
    const soldes = await Promise.all(
      [...ids].map(async (id) => {
        const { gagne, recus } = await soldeDuFaux(id);
        const verse = recus.reduce((t, v) => t + v.montantXaf, 0);
        const n = e.paie.numeros[id];
        return {
          relaisId: id,
          prenom: prenomDuFaux(e, id),
          gagneXaf: gagne,
          verseXaf: verse,
          resteXaf: gagne - verse,
          operateur: n?.operateur ?? null,
          numero: n?.numero ?? null,
          titulaire: n?.titulaire ?? null,
          dernierLe: recus[0]?.verseLe ?? null,
          dernierXaf: recus[0]?.montantXaf ?? null,
        };
      }),
    );
    return soldes.sort((x, y) => y.resteXaf - x.resteXaf);
  },
  async noterVersement(relaisId, montantXaf, verseLe, reference) {
    await reseau();
    if (!Number.isInteger(montantXaf) || montantXaf <= 0)
      throw new ErreurDecision('Le montant versé doit être plus grand que 0.');
    if (verseLe > jourABrazzaville(new Date()))
      throw new ErreurDecision('La date du versement ne peut pas être dans le futur.');
    const { gagne, recus } = await soldeDuFaux(relaisId);
    const reste = gagne - recus.reduce((t, v) => t + v.montantXaf, 0);
    if (montantXaf > reste)
      throw new ErreurDecision(
        `Plus que le reste dû (${Math.max(reste, 0)} FCFA). Une avance n'est pas permise.`,
      );
    const id = crypto.randomUUID();
    ecrire((e) =>
      (e.paie.versements ??= []).push({
        id,
        relaisId,
        montantXaf,
        verseLe,
        reference: reference?.trim() || null,
        noteLe: new Date().toISOString(),
        annuleLe: null,
        motif: null,
      }),
    );
    return id;
  },
  async annulerVersement(versementId, motif) {
    await reseau();
    if (motif.trim().length < 2)
      throw new ErreurDecision('Dites pourquoi ce versement est annulé.');
    const v = (lireEtat().paie.versements ?? []).find((x) => x.id === versementId);
    if (!v || v.annuleLe) throw new ErreurDecision('Versement introuvable ou déjà annulé.');
    ecrire((e) => {
      const x = (e.paie.versements ?? []).find((y) => y.id === versementId);
      if (x) {
        x.annuleLe = new Date().toISOString();
        x.motif = motif.trim();
      }
    });
  },
  async versements() {
    await reseau();
    return [...(lireEtat().paie.versements ?? [])]
      .sort((x, y) => y.verseLe.localeCompare(x.verseLe) || y.noteLe.localeCompare(x.noteLe))
      .map((v) => ({
        id: v.id,
        relaisId: v.relaisId,
        prenom: prenomDuFaux(lireEtat(), v.relaisId),
        montantXaf: v.montantXaf,
        verseLe: v.verseLe,
        reference: v.reference,
        notePar: '[Prénom]',
        annuleLe: v.annuleLe,
        motifAnnulation: v.motif,
      }));
  },
  async enregistrerMobileMoney(relaisId, operateur, numero, titulaire) {
    await reseau();
    ecrire(
      (e) =>
        (e.paie.numeros[relaisId] = {
          operateur,
          numero,
          titulaire: titulaire?.trim() || e.paie.numeros[relaisId]?.titulaire || null,
        }),
    );
  },
};

export const faux: Adaptateurs = { nom: 'faux', session, relais, admin };
