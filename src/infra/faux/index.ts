/**
 * Un faux serveur, gardé dans le navigateur, pour les parcours Playwright
 * (`PUBLIC_ADAPTATEUR=faux`). Il répond comme la base : « reçu », « déjà reçu »,
 * et refuse tout quand le navigateur est hors ligne. Jamais en ligne.
 */
import type { Adaptateurs } from '../index';
import {
  ErreurReseau,
  type ContactAEnvoyer,
  type ErreurAEnvoyer,
  type PortRelais,
  type PortSession,
  type Profil,
  type Reponse,
  type ReleveAEnvoyer,
} from '../../modele/ports';

const CLE = 'ntanova-faux-serveur';

interface Etat {
  utilisateur: { id: string; email: string } | null;
  statut: Profil['statut'];
  releves: Record<string, ReleveAEnvoyer>;
  photos: Record<string, number>;
  contacts: Record<string, ContactAEnvoyer>;
  erreurs: ErreurAEnvoyer[];
}

function lireEtat(): Etat {
  const garde = localStorage.getItem(CLE);
  return garde
    ? (JSON.parse(garde) as Etat)
    : { utilisateur: null, statut: 'actif', releves: {}, photos: {}, contacts: {}, erreurs: [] };
}

function ecrire(modifier: (etat: Etat) => void): void {
  const etat = lireEtat();
  modifier(etat);
  localStorage.setItem(CLE, JSON.stringify(etat));
}

async function reseau(): Promise<void> {
  await new Promise((fin) => setTimeout(fin, 50));
  if (!navigator.onLine) throw new ErreurReseau('hors ligne');
}

function ajouter<T>(table: Record<string, T>, id: string, valeur: T): Reponse {
  if (id in table) return 'deja_recu';
  table[id] = valeur;
  return 'recu';
}

const LOT = { id: '00000000-0000-4000-8000-0000000000e1', nom: 'Tié-Tié', essai: false };

const session: PortSession = {
  async utilisateur() {
    return lireEtat().utilisateur;
  },
  async connecterAvecGoogle() {
    await reseau();
    const utilisateur = {
      id: '00000000-0000-4000-8000-00000000000a',
      email: 'relais@exemple.test',
    };
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
    return Object.values(lireEtat().releves).map((r) => ({
      id: r.id,
      nomEnseigne: r.nomEnseigne,
      prisLe: r.prisLe,
      statut: 'a_valider' as const,
      motif: null,
      messageAuRelais: null,
      direction: r.direction,
      ficheLiaisonRemise: false,
      repasser: r.repasser,
      contactConfirmeLe: null,
      contactFonction: null,
      ecoleId: null,
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

export const faux: Adaptateurs = { nom: 'faux', session, relais };
