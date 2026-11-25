/**
 * Les messages reçus par Contact et par l'annuaire (refonte publique, lot 3B1) : ce qu'une demande peut contenir, ce que
 * le serveur répond, ce que la page a le droit d'en dire. À ne pas confondre avec `demandes-familles.ts`, qui ne compte
 * que des recherches sans nom.
 *
 * Pur : ni réseau, ni écran. La base contrôle tout de nouveau (`prive.normalize_public_request`) ; ces règles servent à
 * dire une erreur avant d'envoyer, jamais à la remplacer. Un test compare les deux.
 */
import type { Valeur } from './listes';
import { listesDesDemandes } from './listes-demandes';
import { normaliserTelephone } from './telephone';

export type Nature = Valeur<'public_request_kind'>;
export type Decision = Valeur<'public_request_decision'>;

/** Les valeurs de départ de la base (`prive.public_request_settings`). Elles se changent par une migration. */
export const REGLAGES = {
  validiteJours: 7,
  indesirableJours: 30,
  closeMois: 12,
  ecrituresParCle: 8,
  suitesParCle: 3,
  creationsParHeure: 20,
  ecrituresParHeure: 60,
  creationsParJour: 300,
  ecrituresParJour: 1000,
} as const;

/** Le contenu entier d'un envoi, en octets. */
export const OCTETS_AU_PLUS = 8192;

// Ce qu'une demande contient ----------------------------------------------------------------------

export type NomDeChamp =
  | 'origine'
  | 'sujet'
  | 'message'
  | 'nomEcole'
  | 'ville'
  | 'repere'
  | 'autreChose'
  | 'niveaux'
  | 'deLEcole'
  | 'fiche'
  | 'information'
  | 'correction'
  | 'source'
  | 'aRetirer'
  | 'precision'
  | 'reponse'
  | 'coordonnee'
  | 'nomPersonne';

type Forme = 'texte' | 'ligne' | 'liste' | 'niveaux' | 'case' | 'fiche';

export interface Champ {
  readonly nom: NomDeChamp;
  readonly forme: Forme;
  readonly natures: readonly Nature[];
  /** Les natures où il est requis. */
  readonly requis: readonly Nature[];
  /** En signes, pour un texte. */
  readonly longueur?: number;
  readonly liste?: keyof typeof listesDesDemandes;
}

const TOUTES = listesDesDemandes.public_request_kind;

export const CHAMPS: readonly Champ[] = [
  {
    nom: 'origine',
    forme: 'liste',
    natures: TOUTES,
    requis: TOUTES,
    liste: 'public_request_origin',
  },
  {
    nom: 'sujet',
    forme: 'liste',
    natures: ['contact'],
    requis: [],
    liste: 'public_request_subject',
  },
  { nom: 'message', forme: 'texte', natures: ['contact'], requis: ['contact'], longueur: 2000 },
  {
    nom: 'nomEcole',
    forme: 'ligne',
    natures: ['absente', 'erreur', 'retrait'],
    requis: ['absente'],
    longueur: 120,
  },
  { nom: 'ville', forme: 'ligne', natures: ['absente'], requis: ['absente'], longueur: 80 },
  { nom: 'repere', forme: 'ligne', natures: ['absente'], requis: [], longueur: 160 },
  { nom: 'autreChose', forme: 'texte', natures: ['absente'], requis: [], longueur: 300 },
  {
    nom: 'niveaux',
    forme: 'niveaux',
    natures: ['absente'],
    requis: [],
    liste: 'public_request_level',
  },
  { nom: 'deLEcole', forme: 'case', natures: ['absente'], requis: [] },
  { nom: 'fiche', forme: 'fiche', natures: ['erreur', 'retrait'], requis: [] },
  {
    nom: 'information',
    forme: 'liste',
    natures: ['erreur'],
    requis: ['erreur'],
    liste: 'public_request_topic',
  },
  { nom: 'correction', forme: 'texte', natures: ['erreur'], requis: ['erreur'], longueur: 1000 },
  {
    nom: 'source',
    forme: 'liste',
    natures: ['erreur'],
    requis: [],
    liste: 'public_request_knowledge',
  },
  {
    nom: 'aRetirer',
    forme: 'liste',
    natures: ['retrait'],
    requis: ['retrait'],
    liste: 'public_request_removal',
  },
  { nom: 'precision', forme: 'texte', natures: ['retrait'], requis: [], longueur: 500 },
  {
    nom: 'reponse',
    forme: 'liste',
    natures: TOUTES,
    requis: TOUTES,
    liste: 'public_request_reply',
  },
  { nom: 'coordonnee', forme: 'ligne', natures: TOUTES, requis: [], longueur: 254 },
  { nom: 'nomPersonne', forme: 'ligne', natures: TOUTES, requis: [], longueur: 80 },
];

export type Contenu = Partial<Record<NomDeChamp, string | boolean | readonly string[]>>;

/** Une liste fermée, la même que celle de la base : jamais ce que la personne a écrit. */
export type ErreurDeChamp =
  'requis' | 'trop_long' | 'hors_liste' | 'format' | 'champ_inconnu' | 'illisible';
export type Erreurs = Partial<Record<NomDeChamp | 'demande', ErreurDeChamp>>;

const FICHE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COURRIEL = /^[^\s@<>()",;:]+@[^\s@<>()",;:.]+(\.[^\s@<>()",;:.]+)*\.[^\s@<>()",;:.]{2,}$/u;
/** Les signes de contrôle (sauf la fin de ligne et la tabulation) et ceux qui changent le sens d'écriture. */
const SIGNES_CACHES = /(?![\n\t])\p{Cc}|[\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/** Le texte tel que la base le gardera : fins de ligne unifiées, sans signe caché, sans blanc au bord. Vide : `null`. */
export function nettoyer(texte: string, uneLigne: boolean): string | null {
  let t = texte.replace(/\r\n?/g, '\n');
  if (uneLigne) t = t.replace(/[\n\t ]+/g, ' ');
  t = t.replace(SIGNES_CACHES, '').replace(/^[ \n\t\u00A0]+|[ \n\t\u00A0]+$/g, '');
  return t === '' ? null : t;
}

/**
 * Le contenu à envoyer et ses erreurs, champ par champ. Un numéro WhatsApp part au format de la base (`242060000000`) ;
 * une coordonnée sans réponse demandée ne part pas. Les champs d'une autre nature sont laissés de côté.
 */
export function controler(nature: Nature, saisie: Contenu): { contenu: Contenu; erreurs: Erreurs } {
  const contenu: Contenu = {};
  const erreurs: Erreurs = {};
  for (const champ of CHAMPS) {
    if (!champ.natures.includes(nature)) continue;
    const brut = saisie[champ.nom];
    if (champ.forme === 'case') {
      if (typeof brut === 'boolean') contenu[champ.nom] = brut;
      continue;
    }
    if (champ.forme === 'niveaux') {
      const choisis = Array.isArray(brut) ? (brut as readonly string[]) : [];
      if (choisis.some((n) => !dansLaListe('public_request_level', n)))
        erreurs[champ.nom] = 'hors_liste';
      else if (choisis.length > 0) contenu[champ.nom] = [...new Set(choisis)].sort();
      continue;
    }
    const texte = typeof brut === 'string' ? nettoyer(brut, champ.forme !== 'texte') : null;
    if (texte === null) {
      if (champ.requis.includes(nature)) erreurs[champ.nom] = 'requis';
    } else if (champ.longueur !== undefined) {
      // En signes, comme la base : un emoji compte pour un.
      if ([...texte].length > champ.longueur) erreurs[champ.nom] = 'trop_long';
      else contenu[champ.nom] = texte;
    } else if (champ.forme === 'fiche') {
      if (FICHE.test(texte)) contenu[champ.nom] = texte;
      else erreurs[champ.nom] = 'format';
    } else if (champ.liste !== undefined && dansLaListe(champ.liste, texte)) {
      contenu[champ.nom] = texte;
    } else {
      erreurs[champ.nom] = 'hors_liste';
    }
  }
  const connue = contenu.fiche ?? contenu.nomEcole ?? erreurs.fiche ?? erreurs.nomEcole;
  if ((nature === 'erreur' || nature === 'retrait') && connue === undefined) {
    erreurs.nomEcole = 'requis';
  }
  if (nature === 'retrait' && contenu.reponse === 'non') {
    erreurs.reponse = 'requis';
  } else if (contenu.reponse === 'non') {
    delete contenu.coordonnee;
    delete erreurs.coordonnee;
  } else if (contenu.reponse !== undefined && erreurs.coordonnee === undefined) {
    const donnee = contenu.coordonnee;
    if (typeof donnee !== 'string') {
      erreurs.coordonnee = 'requis';
    } else if (contenu.reponse === 'whatsapp') {
      const numero = normaliserTelephone(donnee);
      if (numero === null) erreurs.coordonnee = 'format';
      else contenu.coordonnee = numero;
    } else if (!COURRIEL.test(donnee)) {
      erreurs.coordonnee = 'format';
    }
  }
  if (new TextEncoder().encode(JSON.stringify(contenu)).length > OCTETS_AU_PLUS) {
    erreurs.demande = 'trop_long';
  }
  return { contenu, erreurs };
}

function dansLaListe(liste: keyof typeof listesDesDemandes, valeur: string): boolean {
  return (listesDesDemandes[liste] as readonly string[]).includes(valeur);
}

// L'envoi : la révision, puis ce que le serveur répond ---------------------------------------------

/** Ce qui est parti la dernière fois sous cette clé : la page le garde avec son brouillon. */
export interface DernierEnvoi {
  revision: number;
  contenu: Contenu;
}

/**
 * La révision du prochain envoi : la même pour le même contenu (double appui, Réessayer), une de plus dès que le contenu
 * change. Une révision déjà partie ne sert donc jamais à un autre texte.
 */
export function revisionDeLEnvoi(dernier: DernierEnvoi | null, contenu: Contenu): number {
  if (dernier === null) return 1;
  return empreinte(dernier.contenu) === empreinte(contenu)
    ? dernier.revision
    : dernier.revision + 1;
}

function empreinte(contenu: Contenu): string {
  return JSON.stringify(CHAMPS.map((c) => contenu[c.nom] ?? null));
}

const CODES_ENREGISTRES = [
  'enregistree',
  'deja_enregistree',
  'mise_a_jour',
  'suite',
  'version_ancienne',
] as const;
const CODES_REFUSES = [
  'refusee',
  'ecole_inconnue',
  'trop_d_envois',
  'plafond',
  'expiree',
  'limite_atteinte',
  'cle_deja_utilisee',
] as const;
export const CODES = [...CODES_ENREGISTRES, ...CODES_REFUSES] as const;
export type CodeEnregistre = (typeof CODES_ENREGISTRES)[number];
export type CodeRefuse = (typeof CODES_REFUSES)[number];

/**
 * Ce que la page peut dire d'un envoi. `enregistre` : ce texte est en base, et voici sa référence. `refuse` : ce texte
 * n'est PAS en base ; la référence, quand il y en a une, est celle de ce qui l'est déjà. `non_confirme` : on ne sait pas
 * (pas de réponse, réponse illisible, code inconnu) ; jamais « pas parti », jamais « enregistré ».
 */
export type Issue =
  | { genre: 'enregistre'; code: CodeEnregistre; reference: string; precedente: string | null }
  | {
      genre: 'refuse';
      code: CodeRefuse;
      dejaEnregistree: string | null;
      /** Les champs que le serveur refuse, quand il les dit (`refusee`) : jamais ce qui a été écrit. */
      erreurs?: Erreurs;
    }
  | { genre: 'non_confirme' };

const REFERENCE = /^[CAR]-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

const ERREURS_DE_CHAMP: readonly ErreurDeChamp[] = [
  'requis',
  'trop_long',
  'hors_liste',
  'format',
  'champ_inconnu',
  'illisible',
];

/** Les erreurs rendues par le serveur, déjà traduites : des champs connus et des codes connus, rien d'autre. */
function lireErreurs(brut: unknown): Erreurs | undefined {
  if (typeof brut !== 'object' || brut === null) return undefined;
  const lues: Erreurs = {};
  for (const nom of [...CHAMPS.map((c) => c.nom), 'demande' as const]) {
    const code = (brut as Record<string, unknown>)[nom];
    if (dans(ERREURS_DE_CHAMP, code)) lues[nom] = code;
  }
  return lues;
}

/**
 * La réponse du serveur, lue sans rien supposer. `brut` : `{ code, reference, precedente, erreurs }`, déjà traduit.
 */
export function lireIssue(brut: unknown): Issue {
  if (typeof brut !== 'object' || brut === null) return { genre: 'non_confirme' };
  const { code, reference, precedente, erreurs } = brut as Record<string, unknown>;
  const lue = typeof reference === 'string' && REFERENCE.test(reference) ? reference : null;
  if (dans(CODES_ENREGISTRES, code)) {
    // Sans référence, la confirmation ne vaut rien : la personne ne pourrait pas la rappeler.
    if (lue === null) return { genre: 'non_confirme' };
    const avant = typeof precedente === 'string' && REFERENCE.test(precedente) ? precedente : null;
    return { genre: 'enregistre', code, reference: lue, precedente: avant };
  }
  if (dans(CODES_REFUSES, code)) {
    const lues = lireErreurs(erreurs);
    return { genre: 'refuse', code, dejaEnregistree: lue, ...(lues ? { erreurs: lues } : {}) };
  }
  return { genre: 'non_confirme' };
}

function dans<T extends string>(valeurs: readonly T[], v: unknown): v is T {
  return (valeurs as readonly unknown[]).includes(v);
}

/** Les refus où un nouvel envoi, sur un appui, demande un laissez-passer neuf. Jamais automatique. */
export function proposeUnNouvelEnvoi(code: CodeRefuse): boolean {
  return code === 'expiree' || code === 'limite_atteinte' || code === 'cle_deja_utilisee';
}

// Le traitement -------------------------------------------------------------------------------------

/**
 * Les décisions que l'administration choisit, par nature. Un retrait n'en a pas : ses étapes la posent. Passer un message
 * dans une autre file est un geste à part (`reorientations`).
 */
export const DECISIONS: Readonly<Record<Nature, readonly Decision[]>> = {
  contact: ['traitee', 'indesirable'],
  absente: ['existe', 'deja_presente', 'introuvable', 'non_retenue'],
  erreur: ['retenue', 'fiche_juste', 'non_retenue'],
  retrait: [],
};

/** Vers quelles files une demande peut passer ; l'originale reste lisible. */
export const REORIENTATIONS: Readonly<Record<Nature, readonly Nature[]>> = {
  contact: ['absente', 'erreur', 'retrait'],
  absente: [],
  erreur: [],
  retrait: ['erreur'],
};
