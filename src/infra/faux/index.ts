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
import { niveauxConnus, typeConnu, type Valeur } from '../../modele/listes';
import { prochainVendredi } from '../../modele/paie';
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
  id: string;
  releveId: string;
  role: Valeur<'photo_role'>;
  mime: string;
  octets: number;
  publiable: boolean;
}

/** Une institution et son campus, réunis (le faux serveur n'a qu'un campus par institution, sauf ajout). */
interface CampusFaux {
  id: string;
  institutionId: string;
  nom: string;
  etiquette: string | null;
  quartier: string | null;
  publication: Valeur<'publication'>;
  origine: Valeur<'origin_kind'>;
  position: { latitude: number; longitude: number } | null;
  divisionId: string | null;
  confieeA: string | null;
  noteMission: string | null;
  genreMission: Valeur<'mission_kind'>;
  retrait?: {
    motif: Valeur<'motif_retrait'>;
    le: string;
    note: string | null;
    remplaceePar: string | null;
  } | null;
  /** Le lot du relevé qui a fait l'école (pour « Publier un lot »). */
  lotId?: string | null;
  /** Tels que la base les dit ; un parcours y met une valeur qu'un téléphone ne connaît pas encore. */
  typeEcole?: string;
  niveaux?: string[];
  programme?: string | null;
  repere?: string | null;
  numeroEnseigne?: string | null;
  formations?: FormationSaisie[];
  verifieeLe?: string | null;
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

interface Etat {
  utilisateur: { id: string; email: string } | null;
  statut: Profil['statut'];
  /** L'utilisateur du faux serveur est aussi administrateur. */
  admin: boolean;
  releves: Record<string, ReleveAEnvoyer>;
  photos: Record<string, PhotoFausse>;
  contacts: Record<string, ContactAEnvoyer>;
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
    numeros: Record<string, { operateur: string; numero: string }>;
    deja: string[];
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
  divisions: Object.fromEntries(DIVISIONS_INITIALES.map((d) => [d.id, d])),
  lots: LOTS_INITIAUX,
  messages: {},
  paie: { semaines: [], numeros: {}, deja: [] },
  autresReleves: [],
});

function lireEtat(): Etat {
  const garde = localStorage.getItem(CLE);
  return garde ? { ...etatInitial(), ...(JSON.parse(garde) as Partial<Etat>) } : etatInitial();
}

function ecrire(modifier: (etat: Etat) => void): void {
  const etat = lireEtat();
  modifier(etat);
  localStorage.setItem(CLE, JSON.stringify(etat));
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
        repere: r.repere,
        numeroEnseigne: r.numeroEnseigne,
        position: r.position,
        precisionM: r.precisionM,
        photos: rolesDesPhotos(e, [r.id]),
        aContact: r.id in e.contacts,
      };
    });
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
        };
      });
  },
  async maPaie() {
    await reseau();
    const e = lireEtat();
    // Comme `my_payout` : l'acquis du prochain vendredi (le calcul de l'administration, pour le seul relais), puis les
    // semaines closes. Les montants sont ceux de l'administration : le faux serveur n'en invente pas d'autres.
    const vendredi = prochainVendredi();
    const [ligne] = await admin.apercuPaie(vendredi);
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
          },
        ];
      });
    return {
      acquis: {
        vendredi,
        etat: 'acquis' as const,
        fiches: ligne?.fiches ?? 0,
        contacts: ligne?.contacts ?? 0,
        essais: ligne?.essais ?? 0,
        totalXaf: ligne?.totalXaf ?? 0,
        nonPayables,
        payeLe: null,
        reference: null,
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
    if (photo.role !== 'signboard' && siennes.filter((p) => p.role !== 'signboard').length >= 3) {
      throw new ErreurRejet('22023', 'Au plus trois photos en plus de l’enseigne.');
    }
    if (photo.octets >= 200_000) throw new Error('photo trop lourde');
    ecrire((s) => {
      s.photos[photo.id] = {
        id: photo.id,
        releveId,
        role: photo.role,
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
    ecrire((e) => (reponse = ajouter(e.contacts, c.releveId, c)));
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
    relais: '[Prénom]',
    lot: lot.nom,
    essai: lot.essai,
    horsLot: r.position ? !dansLeCarre(r.position, CARRE_DU_LOT) : null,
    enZoneOuverte: enZoneOuverte(r.position, e),
    doublonPossible: r.reponseDoublon !== null,
    reponseDoublon: r.reponseDoublon,
    precisionM: r.precisionM,
    photos: photos.length,
    enseigneRecue: photos.some((p) => p.role === 'signboard'),
    indiceFormations: Boolean(r.programmesVus) || r.programmesEnPhoto,
    contactRecu: r.id in e.contacts,
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
    quartier: c.quartier,
    division: division?.nom ?? null,
    divisionId: division?.id ?? null,
    publication: c.publication,
    origine: c.origine,
    retrait: c.retrait ?? null,
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
    formations: (c.formations ?? []).length,
    verifieeLe: c.verifieeLe ?? null,
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
    return {
      ...ligne,
      prisLe: r.prisLe,
      position: r.position,
      divisionId: (r.position ? divisionDeLaPosition(r.position, e)?.id : null) ?? null,
      niveaux: r.niveaux,
      typeEcole: r.typeEcole,
      programme: r.programme,
      programmesVus: r.programmesVus,
      programmesEnPhoto: r.programmesEnPhoto,
      repere: r.repere,
      numeroEnseigne: r.numeroEnseigne,
      direction: r.direction,
      repasser: r.repasser,
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
        adresse: '/relais/icone-512.png',
        octets: p.octets,
        largeur: 1280,
        hauteur: 960,
        prisLe: null,
        publiable: p.publiable,
      }));
  },
  async contactReleve(id) {
    await reseau();
    const c = lireEtat().contacts[id];
    return c
      ? {
          fonction: c.fonction,
          nom: c.nom,
          whatsapp: c.whatsapp,
          accord: c.accord,
          accordLe: c.accordLe,
          note: c.note,
          recuLe: c.accordLe ?? new Date().toISOString(),
        }
      : null;
  },
  async accepter(id, choix: DecisionAcceptation = {}) {
    await reseau();
    const e0 = lireEtat();
    const releve = e0.releves[id];
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
    if ((mode === 'update_campus' || mode === 'add_cycle') && !cible) {
      throw new ErreurDecision('Il faut dire quel campus mettre à jour.');
    }
    if (mode === 'new_campus' && !choix.institutionId) {
      throw new ErreurDecision('Il faut dire à quelle institution rattacher le nouveau campus.');
    }
    // Comme la base : la division choisie par l'administration, sinon celle de la position, sinon (sans position seulement)
    // celle du lot du relais. Une position qu'aucun contour ne contient n'est plus rattachée d'office au lot.
    const choisie = choix.divisionId ? (e0.divisions[choix.divisionId] ?? null) : null;
    if (choix.divisionId && (!choisie || choisie.niveau < 2)) {
      throw new ErreurDecision(
        'Division introuvable : choisissez une ville, un arrondissement ou un quartier.',
      );
    }
    const lotDuReleve = releve?.lotId ? e0.lots.find((l) => l.id === releve.lotId) : undefined;
    const division =
      choisie ??
      (releve?.position
        ? divisionDeLaPosition(releve.position, e0)
        : lotDuReleve
          ? (e0.divisions[lotDuReleve.divisionId] ?? null)
          : null);
    if ((mode === 'new_institution' || mode === 'new_campus') && !division) {
      throw new ErreurDecision(
        'Division inconnue : la position n’est dans aucune division connue (ou le relevé n’a ni position ni lot). Choisissez la division de l’école.',
      );
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
            if (releve.typeEcole !== 'non_indique') visee.typeEcole = releve.typeEcole;
            visee.programme = releve.programme ?? visee.programme ?? null;
          }
          visee.niveaux = [...new Set([...(visee.niveaux ?? []), ...releve.niveaux])];
          visee.repere = visee.repere ?? releve.repere;
          visee.numeroEnseigne = visee.numeroEnseigne ?? releve.numeroEnseigne;
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
          position: releve.position,
          divisionId: division?.id ?? null,
          confieeA: null,
          noteMission: null,
          genreMission: 'verify',
          lotId: releve.lotId,
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
        statut: 'accepte',
        ecoleId: campusId,
        motif: null,
        message: null,
        payable: releve?.type !== 'correction' && !dejaAcceptee,
      };
      if (releve?.corrigeReleveId && e.decisions[releve.corrigeReleveId]) {
        const o = e.decisions[releve.corrigeReleveId];
        if (o) o.statut = 'accepte';
      }
    });
    return campusId;
  },
  async demanderCorrection(id, motif, message) {
    await reseau();
    decider(id, { statut: 'a_corriger', motif, message });
  },
  async refuser(id, motif, message) {
    await reseau();
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
  async effacerContact(releveId) {
    await reseau();
    if (!(releveId in lireEtat().contacts))
      throw new ErreurDecision('Aucun contact pour ce relevé.');
    ecrire((e) => delete e.contacts[releveId]);
  },
  async effacerPhoto(photoId) {
    await reseau();
    if (!(photoId in lireEtat().photos)) throw new ErreurDecision('Photo introuvable.');
    ecrire((e) => delete e.photos[photoId]);
  },
  async marquerPhotoPubliable(photoId, publiable) {
    await reseau();
    ecrire((e) => {
      const p = e.photos[photoId];
      if (p) p.publiable = publiable;
    });
  },

  async erreursRecentes(depuis) {
    await reseau();
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

  async relais() {
    await reseau();
    const e = lireEtat();
    const siennes = Object.values(e.releves);
    const d = (id: string) => e.decisions[id]?.statut ?? 'a_valider';
    return [
      {
        id: MOI,
        prenom: '[Prénom]',
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
        },
      },
      {
        id: AUTRE,
        prenom: '[Relais en attente]',
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
        slug: d.slug,
        chemin: d.chemin,
        ouverte: d.ouverte,
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

  async ecoles() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.campus).map((c) => vueDeCampus(c, e));
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
  async creerEcole(entree) {
    await reseau();
    // D'abord sur une copie : les erreurs de validation remontent sans rien écrire.
    const resultat = creerEntree(lireEtat(), entree, 'admin');
    ecrire((e) => void creerEntree(e, entree, 'admin'));
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
  async confierEcole(ecoleId, relaisId, genre, note) {
    await reseau();
    const e = lireEtat();
    const actif = relaisId === MOI ? e.statut === 'actif' : e.autreRelais.statut === 'actif';
    if (!actif) throw new ErreurDecision('Ce relais n’est pas actif : l’activer d’abord.');
    ecrire((etat) => {
      const ecole = etat.campus[ecoleId];
      if (ecole)
        Object.assign(ecole, { confieeA: relaisId, noteMission: note, genreMission: genre });
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

  async apercuPaie(vendredi) {
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
    void vendredi;
    return [...lignes.entries()].map(([relaisId, l]) => ({
      relaisId,
      prenom: '[Prénom]',
      fiches: l.fiches,
      contacts: l.contacts,
      essais: l.essais,
      totalXaf: l.fiches * 500 + l.contacts * 300 + l.essais * 1500,
      numeroConnu: relaisId in e.paie.numeros,
    }));
  },
  async cloturerPaie(vendredi) {
    await reseau();
    const e0 = lireEtat();
    if (new Date(`${vendredi}T12:00:00Z`).getUTCDay() !== 5)
      throw new ErreurDecision('La semaine se clôt un vendredi.');
    if (e0.paie.semaines.some((s) => s.vendredi === vendredi)) {
      throw new ErreurDecision(`La semaine du ${vendredi} est déjà clôturée.`);
    }
    const lignes = (await admin.apercuPaie(vendredi)).map((l) => ({
      relaisId: l.relaisId,
      prenom: l.prenom,
      fiches: l.fiches,
      contacts: l.contacts,
      essais: l.essais,
      totalXaf: l.totalXaf,
    }));
    const id = crypto.randomUUID();
    ecrire((e) => {
      e.paie.semaines.push({ id, vendredi, lignes, payes: {} });
      for (const r of Object.values(e.releves)) {
        if (e.decisions[r.id]?.statut === 'accepte')
          e.paie.deja.push(`${r.id}|fiche`, `${r.id}|contact`);
      }
      if (lignes.some((l) => l.essais > 0)) e.paie.deja.push('essai');
    });
    return id;
  },
  async semainesPaie() {
    await reseau();
    return lireEtat().paie.semaines.map((s) => ({
      id: s.id,
      vendredi: s.vendredi,
      totalXaf: s.lignes.reduce((t, l) => t + l.totalXaf, 0),
      relais: s.lignes.length,
      payes: Object.keys(s.payes).length,
    }));
  },
  async paiementsDeLaSemaine(semaineId) {
    await reseau();
    const e = lireEtat();
    const semaine = e.paie.semaines.find((s) => s.id === semaineId);
    if (!semaine) throw new ErreurDecision('Semaine introuvable.');
    return semaine.lignes.map((l) => ({
      relaisId: l.relaisId,
      prenom: l.prenom,
      totalXaf: l.totalXaf,
      fiches: l.fiches,
      contacts: l.contacts,
      essais: l.essais,
      operateur: e.paie.numeros[l.relaisId]?.operateur ?? null,
      numero: e.paie.numeros[l.relaisId]?.numero ?? null,
      payeLe: semaine.payes[l.relaisId]?.le ?? null,
      reference: semaine.payes[l.relaisId]?.reference ?? null,
    }));
  },
  async noterPaye(semaineId, relaisId, reference) {
    await reseau();
    if (reference.trim() === '')
      throw new ErreurDecision('Il faut la référence de l’opération Mobile Money.');
    const semaine = lireEtat().paie.semaines.find((s) => s.id === semaineId);
    if (!semaine || relaisId in semaine.payes)
      throw new ErreurDecision('Paiement introuvable ou déjà noté.');
    ecrire((e) => {
      const s = e.paie.semaines.find((x) => x.id === semaineId);
      if (s) s.payes[relaisId] = { le: new Date().toISOString(), reference: reference.trim() };
    });
  },
  async enregistrerMobileMoney(relaisId, operateur, numero) {
    await reseau();
    ecrire((e) => (e.paie.numeros[relaisId] = { operateur, numero }));
  },
};

export const faux: Adaptateurs = { nom: 'faux', session, relais, admin };
