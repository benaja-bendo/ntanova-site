/**
 * Un faux serveur, gardé dans le navigateur, pour les parcours Playwright
 * (`PUBLIC_ADAPTATEUR=faux`). Il répond comme la base : « reçu », « déjà reçu »,
 * et refuse tout quand le navigateur est hors ligne. Jamais en ligne.
 */
import type { Adaptateurs } from '../index';
import type { Valeur } from '../../modele/listes';
import {
  ErreurDecision,
  ErreurReseau,
  type ContactAEnvoyer,
  type ErreurAEnvoyer,
  type PortAdministration,
  type PortRelais,
  type PortSession,
  type Profil,
  type Reponse,
  type ReleveAEnvoyer,
} from '../../modele/ports';

const CLE = 'ntanova-faux-serveur';

interface Decision {
  statut: Valeur<'statut_releve'>;
  motif: Valeur<'motif_decision'> | null;
  message: string | null;
  ecoleId: string | null;
  contactConfirmeLe: string | null;
  contactFonction: Valeur<'fonction_direction'> | null;
}

interface Etat {
  utilisateur: { id: string; email: string } | null;
  statut: Profil['statut'];
  /** L'utilisateur du faux serveur est aussi administrateur. */
  admin: boolean;
  releves: Record<string, ReleveAEnvoyer>;
  photos: Record<string, number>;
  contacts: Record<string, ContactAEnvoyer>;
  erreurs: ErreurAEnvoyer[];
  decisions: Record<string, Decision>;
  /** Un second relais, fictif, en attente d'activation. */
  autreRelais: { statut: Profil['statut']; lotId: string | null };
  /** Les écoles connues, dont une à situer (sans position). */
  ecoles: Record<string, EcoleFausse>;
}

interface EcoleFausse {
  id: string;
  nom: string;
  quartier: string | null;
  publication: Valeur<'publication'>;
  position: { latitude: number; longitude: number } | null;
  confieeA: string | null;
  note: string | null;
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
}

const ECOLE_A_SITUER = '40000000-0000-4000-8000-000000000001';

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
  ecoles: {
    [ECOLE_A_SITUER]: {
      id: ECOLE_A_SITUER,
      nom: '[École à situer]',
      quartier: 'Tié-Tié',
      publication: 'brouillon',
      position: null,
      confieeA: null,
      note: null,
    },
  },
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

function ajouter<T>(table: Record<string, T>, id: string, valeur: T): Reponse {
  if (id in table) return 'deja_recu';
  table[id] = valeur;
  return 'recu';
}

const LOT = { id: '00000000-0000-4000-8000-0000000000e1', nom: 'Tié-Tié', essai: false };
const LOTS = [
  LOT,
  { id: '00000000-0000-4000-8000-0000000000e2', nom: 'Ngoyo', essai: false },
  { id: '00000000-0000-4000-8000-0000000000e3', nom: 'Essai', essai: true },
];
const MOI = '00000000-0000-4000-8000-00000000000a';
const AUTRE = '00000000-0000-4000-8000-00000000000b';

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

const relais: PortRelais = {
  async monProfil() {
    await reseau();
    const e = lireEtat();
    if (!e.utilisateur) throw new Error('Aucune session');
    return {
      id: e.utilisateur.id,
      prenom: '[Prénom]',
      statut: e.statut,
      lotId: e.statut === 'actif' ? LOT.id : null,
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
    return lireEtat().statut === 'actif' ? { ...LOT, aRendreLe: null, contour } : null;
  },
  async ecolesPubliees() {
    await reseau();
    return [
      {
        id: '20000000-0000-4000-8000-000000000001',
        nom: '[École exemple publiée]',
        latitude: -4.79105,
        longitude: 11.925,
      },
    ];
  },
  async mesReleves() {
    await reseau();
    const e = lireEtat();
    return Object.values(e.releves).map((r) => {
      const d = e.decisions[r.id];
      return {
        id: r.id,
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
        ecoleId: d?.ecoleId ?? null,
      };
    });
  },
  async ecolesACompleter() {
    await reseau();
    return Object.values(lireEtat().ecoles)
      .filter((e) => e.confieeA === MOI)
      .map((e) => ({
        id: e.id,
        nom: e.nom,
        quartier: e.quartier,
        typeEcole: e.typeEcole ?? 'privee',
        niveaux: e.niveaux ?? ['primaire'],
        programme: e.programme ?? null,
        repere: null,
        numeroEnseigne: null,
        note: e.note,
      }));
  },
  async envoyerReleve(r) {
    await reseau();
    let reponse: Reponse = 'recu';
    ecrire((e) => (reponse = ajouter(e.releves, r.id, r)));
    return reponse;
  },
  async envoyerPhoto(releveId, photo) {
    await reseau();
    if (!(releveId in lireEtat().releves)) throw new Error('Relevé inconnu');
    let reponse: Reponse = 'recu';
    ecrire((e) => (reponse = ajouter(e.photos, releveId, photo.size)));
    return reponse;
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
    }
  );
}

function decider(id: string, champs: Partial<Decision>): void {
  const avant = decision(id);
  ecrire((e) => (e.decisions[id] = { ...avant, ...champs }));
}

/** Une ligne de la file « À valider », comme la vue `releves_a_valider`. */
function ligneDe(r: ReleveAEnvoyer, e: Etat) {
  return {
    id: r.id,
    recuLe: r.prisLe,
    type: r.type,
    nomEnseigne: r.nomEnseigne,
    relais: '[Prénom]',
    lot: LOT.nom,
    essai: false,
    horsLot: false,
    doublonPossible: r.reponseDoublon !== null,
    reponseDoublon: r.reponseDoublon,
    precisionM: r.precisionM,
    photoRecue: r.id in e.photos,
    contactRecu: r.id in e.contacts,
  };
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
    const r = lireEtat().releves[id];
    if (!r) throw new ErreurDecision('Relevé introuvable.');
    const ligne = ligneDe(r, lireEtat());
    const d = decision(id);
    return {
      ...ligne,
      prisLe: r.prisLe,
      position: r.position,
      niveaux: r.niveaux,
      typeEcole: r.typeEcole,
      programme: r.programme,
      repere: r.repere,
      numeroEnseigne: r.numeroEnseigne,
      direction: r.direction,
      repasser: r.repasser,
      doublonDe:
        r.doublonDe && lireEtat().ecoles[r.doublonDe]
          ? { id: r.doublonDe, nom: lireEtat().ecoles[r.doublonDe]?.nom ?? '' }
          : null,
      corrigeReleveId: r.corrigeReleveId,
      contactConfirmeLe: d.contactConfirmeLe,
      contactFonction: d.contactFonction,
    };
  },
  async photoReleve(id) {
    await reseau();
    return id in lireEtat().photos ? '/relais/icone-512.png' : null;
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
  async accepter(id, ecoleId = null) {
    await reseau();
    const releve = lireEtat().releves[id];
    if (decision(id).statut === 'refuse') {
      throw new ErreurDecision(
        'Relevé refusé : un refus est définitif. Le relais peut envoyer une nouvelle fiche.',
      );
    }
    const ecole = ecoleId ?? `ecole-${id}`;
    decider(id, { statut: 'accepte', ecoleId: ecole, motif: null, message: null });
    ecrire((e) => {
      const visee = e.ecoles[ecole];
      if (visee && releve) {
        // Comme la base : une école à situer devient prête, une école publiée le reste.
        visee.nom = releve.nomEnseigne;
        visee.position = releve.position ?? visee.position;
        if (visee.publication === 'brouillon') visee.publication = 'prete';
        visee.confieeA = null;
        visee.note = null;
      } else if (releve) {
        e.ecoles[ecole] = {
          id: ecole,
          nom: releve.nomEnseigne,
          quartier: null,
          publication: 'prete',
          position: releve.position,
          confieeA: null,
          note: null,
          lotId: releve.lotId,
        };
      }
    });
    return ecole;
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
  async relais() {
    await reseau();
    const e = lireEtat();
    const fiches = Object.keys(e.releves).length;
    return [
      {
        id: MOI,
        prenom: '[Prénom]',
        statut: e.statut,
        lotId: LOT.id,
        creeLe: '2026-10-31T08:00:00Z',
        activeLe: '2026-10-31T09:00:00Z',
        fiches,
      },
      {
        id: AUTRE,
        prenom: '[Relais en attente]',
        statut: e.autreRelais.statut,
        lotId: e.autreRelais.lotId,
        creeLe: '2026-11-01T08:00:00Z',
        activeLe: null,
        fiches: 0,
      },
    ];
  },
  async lots() {
    await reseau();
    return LOTS.map((l) => ({ ...l, aRendreLe: null }));
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
  async ecoles() {
    await reseau();
    return Object.values(lireEtat().ecoles).map((e) => ({
      id: e.id,
      nom: e.nom,
      quartier: e.quartier,
      arrondissement: e.position ? LOT.nom : null,
      arrondissementId: e.position ? 1 : null,
      publication: e.publication,
      retrait: e.retrait ?? null,
      aSituer: e.position === null,
      confiee: e.confieeA
        ? {
            relaisId: e.confieeA,
            prenom: e.confieeA === MOI ? '[Prénom]' : '[Relais en attente]',
            note: e.note,
          }
        : null,
    }));
  },
  async confierEcole(ecoleId, relaisId, note) {
    await reseau();
    const e = lireEtat();
    const actif = relaisId === MOI ? e.statut === 'actif' : e.autreRelais.statut === 'actif';
    if (!actif) throw new ErreurDecision('Ce relais n’est pas actif : l’activer d’abord.');
    ecrire((etat) => {
      const ecole = etat.ecoles[ecoleId];
      if (ecole) Object.assign(ecole, { confieeA: relaisId, note });
    });
  },
  async reprendreEcole(ecoleId) {
    await reseau();
    ecrire((etat) => {
      const ecole = etat.ecoles[ecoleId];
      if (ecole) Object.assign(ecole, { confieeA: null, note: null });
    });
  },
  async arrondissements() {
    await reseau();
    return [
      { id: 1, slug: 'tie-tie', nom: 'Tié-Tié' },
      { id: 2, slug: 'ngoyo', nom: 'Ngoyo' },
    ];
  },
  async publierEcole(ecoleId) {
    await reseau();
    const ecole = lireEtat().ecoles[ecoleId];
    if (
      !ecole ||
      !['prete', 'retiree'].includes(ecole.publication) ||
      ecole.retrait?.remplaceePar
    ) {
      throw new ErreurDecision('Seule une école prête ou retirée se publie.');
    }
    ecrire((e) =>
      Object.assign(e.ecoles[ecoleId] ?? {}, { publication: 'publiee', retrait: null }),
    );
  },
  async publierArrondissement() {
    await reseau();
    let n = 0;
    ecrire((e) => {
      for (const ecole of Object.values(e.ecoles)) {
        if (ecole.publication === 'prete' && ecole.position) {
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
      for (const ecole of Object.values(e.ecoles)) {
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
    const ecole = lireEtat().ecoles[ecoleId];
    if (!ecole || !['prete', 'publiee'].includes(ecole.publication)) {
      throw new ErreurDecision('Seule une école prête ou publiée se retire.');
    }
    ecrire((e) =>
      Object.assign(e.ecoles[ecoleId] ?? {}, {
        publication: 'retiree',
        retrait: { motif, le: new Date().toISOString(), note, remplaceePar: null },
        confieeA: null,
      }),
    );
  },
  async fusionnerEcoles(doublonId, gardeeId) {
    await reseau();
    ecrire((e) =>
      Object.assign(e.ecoles[doublonId] ?? {}, {
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
  async effacerContact(releveId) {
    await reseau();
    if (!(releveId in lireEtat().contacts))
      throw new ErreurDecision('Aucun contact pour ce relevé.');
    ecrire((e) => delete e.contacts[releveId]);
  },
  async effacerPhoto(releveId) {
    await reseau();
    ecrire((e) => delete e.photos[releveId]);
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
          lot: LOT.nom,
          type: r.type,
          statut: d?.statut ?? 'a_valider',
          decideLe: new Date().toISOString(),
          motif: d?.motif ?? null,
          messageAuRelais: d?.message ?? null,
        };
      });
  },
};

export const faux: Adaptateurs = { nom: 'faux', session, relais, admin };
