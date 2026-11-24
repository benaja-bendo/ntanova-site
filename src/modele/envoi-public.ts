/**
 * Envoyer un message depuis le site public (refonte publique, lot 3C) : le port que l'écran appelle, et le brouillon que
 * l'onglet garde. Ce qu'un message peut contenir et ce que le serveur répond sont dans `demandes.ts`.
 *
 * Pur : ni réseau, ni écran, ni stockage. Le brouillon est un confort du navigateur ; la seule limite qui protège est celle
 * du serveur (le laissez-passer daté et scellé, 7 jours).
 */
import type { Valeur } from './listes';
import { listesDesDemandes } from './listes-demandes';
import type { Contenu, DernierEnvoi, Issue, Nature } from './demandes';

export type Origine = Valeur<'public_request_origin'>;

// Le port ------------------------------------------------------------------------------------------

/** La clé de la demande, l'heure du serveur et son sceau : rien que le navigateur puisse avancer ou reculer. */
export interface LaissezPasser {
  cle: string;
  emisLe: number;
  sceau: string;
}

/**
 * `ferme` : le serveur dit que les envois ne sont pas ouverts ; réessayer ne sert à rien, la page propose une autre voie.
 * `non_confirme` : on ne sait pas (réseau, délai, réponse illisible). Rien n'est encore parti dans les deux cas.
 */
export type ReponseLaissezPasser =
  { genre: 'accorde'; passe: LaissezPasser } | { genre: 'ferme' } | { genre: 'non_confirme' };

export interface EnvoiPublic {
  passe: LaissezPasser;
  revision: number;
  nature: Nature;
  contenu: Contenu;
  /** Le champ piège : vide chez une personne. */
  piege: string;
}

/** Les deux portes publiques. Aucune ne lève d'erreur : l'absence de réponse est une réponse, « pas confirmé ». */
export interface PortDemandes {
  demanderLaissezPasser(): Promise<ReponseLaissezPasser>;
  envoyer(envoi: EnvoiPublic): Promise<Issue>;
}

// Le brouillon d'onglet ----------------------------------------------------------------------------

/** 24 h après la dernière saisie, dans l'onglet seulement. */
export const BROUILLON_MS = 24 * 3600 * 1000;

/** La fiche d'où vient la personne : des informations publiques, lues dans un fichier construit avec le site. */
export interface FicheConcernee {
  numero: string;
  id: string;
  nom: string;
  lieu: string;
  lien: string;
}

/** Une demande commencée : sa clé, ce qui est parti sous cette clé, et si l'on ignore encore son sort. */
export interface Enveloppe {
  passe: LaissezPasser;
  /** La fiche de cette demande, pour la reprendre telle qu'elle est partie. */
  fiche: FicheConcernee | null;
  dernier: DernierEnvoi | null;
  attente: boolean;
}

export interface Brouillon {
  ecritLe: number;
  nature: Nature | null;
  origine: Origine;
  fiche: FicheConcernee | null;
  /** Les champs de la page, par nom de champ du formulaire. */
  champs: Record<string, string | boolean>;
  /** Une enveloppe par demande (`cleDeDemande`) : changer de nature ou de fiche n'efface ni ne réutilise une clé. */
  enveloppes: Record<string, Enveloppe>;
}

/**
 * Deux natures, ou deux fiches, sont deux demandes : deux clés. Revenir à la première retrouve la sienne, donc jamais un
 * second exemplaire. Un nom d'école écrit à la main est du contenu : il change la révision, pas la clé.
 */
export function cleDeDemande(nature: Nature, fiche: FicheConcernee | null): string {
  return `${nature}:${fiche?.id ?? ''}`;
}

export function nouveauBrouillon(origine: Origine, nature: Nature | null = null): Brouillon {
  return { ecritLe: 0, nature, origine, fiche: null, champs: {}, enveloppes: {} };
}

/** Quelque chose à reprendre : un texte écrit, ou un envoi dont on ignore le sort. */
export function aReprendre(b: Brouillon): boolean {
  return (
    enAttente(b) !== null ||
    Object.values(b.champs).some((v) => v === true || (typeof v === 'string' && v.trim() !== ''))
  );
}

/** Une demande partie sans confirmation, s'il y en a une ; celle de la page d'abord. */
export function enAttente(b: Brouillon): { cle: string; nature: Nature } | null {
  const cles = Object.keys(b.enveloppes).filter((c) => b.enveloppes[c]?.attente);
  const ici = b.nature ? cleDeDemande(b.nature, b.fiche) : '';
  const cle = cles.includes(ici) ? ici : cles[0];
  const nature = cle?.split(':')[0];
  return cle !== undefined && estNature(nature) ? { cle, nature } : null;
}

export function estNature(v: unknown): v is Nature {
  return (listesDesDemandes.public_request_kind as readonly unknown[]).includes(v);
}
export function estOrigine(v: unknown): v is Origine {
  return (listesDesDemandes.public_request_origin as readonly unknown[]).includes(v);
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const textes = (o: Record<string, unknown>, ...noms: string[]) =>
  noms.every((n) => typeof o[n] === 'string');
const estFiche = (v: unknown) =>
  v === null || (estObjet(v) && textes(v, 'numero', 'id', 'nom', 'lieu', 'lien'));

/** Le brouillon gardé, ou rien : expiré, d'une autre version, abîmé. Une lecture ne suppose jamais ce qui manque. */
export function lireBrouillon(brut: string | null, maintenant: number): Brouillon | null {
  if (brut === null) return null;
  let b: unknown;
  try {
    b = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!estObjet(b) || typeof b.ecritLe !== 'number') return null;
  // Une heure à venir (horloge du téléphone changée) ne prolonge pas le brouillon.
  if (maintenant - b.ecritLe >= BROUILLON_MS || b.ecritLe > maintenant + 60_000) return null;
  if (b.nature !== null && !estNature(b.nature)) return null;
  if (!estOrigine(b.origine) || !estObjet(b.champs) || !estObjet(b.enveloppes)) return null;
  if (!estFiche(b.fiche)) return null;
  for (const e of Object.values(b.enveloppes)) {
    if (!estObjet(e) || !estObjet(e.passe) || typeof e.attente !== 'boolean') return null;
    if (!estFiche(e.fiche)) return null;
    if (!textes(e.passe, 'cle', 'sceau') || typeof e.passe.emisLe !== 'number') return null;
    const d = e.dernier;
    if (d !== null && !(estObjet(d) && typeof d.revision === 'number' && estObjet(d.contenu))) {
      return null;
    }
  }
  return b as unknown as Brouillon;
}

// D'où vient la personne ----------------------------------------------------------------------------

const TYPES: Readonly<Record<string, Nature>> = {
  manque: 'absente',
  erreur: 'erreur',
  retrait: 'retrait',
};

/** Ce qu'une adresse d'arrivée peut dire : des codes d'une liste fermée et le numéro public d'une fiche. Rien d'autre. */
export interface ArriveeLue {
  nature: Nature | null;
  sujet: Valeur<'public_request_subject'> | null;
  /** Le numéro public d'une fiche, à vérifier auprès du fichier construit avec le site. */
  ecole: string | null;
  origine: Origine;
}

export function lireArrivee(parametres: URLSearchParams): ArriveeLue {
  const sujet = parametres.get('sujet');
  const ecole = parametres.get('ecole');
  const depuis = parametres.get('depuis');
  return {
    nature: TYPES[parametres.get('type') ?? ''] ?? null,
    sujet: (listesDesDemandes.public_request_subject as readonly unknown[]).includes(sujet)
      ? (sujet as ArriveeLue['sujet'])
      : null,
    ecole: /^\d{1,12}$/.test(ecole ?? '') ? ecole : null,
    origine: estOrigine(depuis) ? depuis : 'direct',
  };
}

// Ce que la confirmation rappelle --------------------------------------------------------------------

/**
 * Assez pour reconnaître sa coordonnée, pas assez pour la lire par-dessus une épaule. Un numéro tient sur une ligne (espaces
 * insécables) : coupé en fin de ligne, « 06 » seul ne se reconnaît plus.
 */
export function coordonneeMasquee(canal: 'whatsapp' | 'email', coordonnee: string): string {
  if (canal === 'email') {
    const arobase = coordonnee.indexOf('@');
    return `${coordonnee.slice(0, 1)}•••${coordonnee.slice(Math.max(arobase, 0))}`;
  }
  const national = coordonnee.replace(/^242(?=\d{9}$)/, '');
  return `${national.slice(0, 2)}\u00a0•••\u00a0••\u00a0${national.slice(-2)}`;
}
