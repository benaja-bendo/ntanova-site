/**
 * L'alerte e-mail des messages reçus (refonte publique, lot 3B2) : un passage du service. Pur, sans Deno ni réseau : les essais le
 * jouent avec un registre et un transport fictifs.
 *
 * Ce que l'alerte dit : une référence, une nature, un lien. Jamais le message, un nom, une école ou une coordonnée : le service ne
 * les reçoit pas. Au moins un essai jusqu'au succès ou à l'abandon visible, jamais « exactement une fois » : un doublon porte le
 * même Message-ID et ne crée pas de second message.
 */

export const NATURES = {
  contact: 'contact',
  absente: 'école absente',
  erreur: 'erreur sur une fiche',
  retrait: 'retrait',
} as const;
export type Nature = keyof typeof NATURES;

/** Les codes que la base garde : une liste fermée, jamais le texte du serveur de courrier. */
export type CodeEchec =
  | 'connexion'
  | 'authentification'
  | 'refus_temporaire'
  | 'refus_definitif'
  | 'delai'
  | 'configuration';

export interface Annonce {
  bail: string;
  reference: string;
  nature: Nature;
  messageId: string;
}

export interface Reservation {
  annonces: Annonce[];
  /** Des baux dont l'annonce ne se lit pas : marqués `configuration`, jamais envoyés. */
  illisibles: string[];
  envoyeesDansLHeure: number;
}

/** Les deux seules fonctions de la base que le service appelle. */
export interface Registre {
  reserver(nombre: number, signal?: AbortSignal): Promise<Reservation>;
  /** Faux : le bail est périmé et repris par un autre passage, rien n'est marqué. */
  marquer(bail: string, resultat: 'envoyee' | CodeEchec, signal?: AbortSignal): Promise<boolean>;
}

export interface Courrier {
  objet: string;
  corps: string;
  messageId: string;
}

export class EchecCourrier extends Error {
  override name = 'EchecCourrier';
  readonly code: CodeEchec;
  /** La session ne sert plus : les annonces suivantes attendront le prochain passage. */
  readonly fatal: boolean;
  constructor(code: CodeEchec, fatal: boolean) {
    super(code);
    this.code = code;
    this.fatal = fatal;
  }
}

export interface SessionCourrier {
  /** Rend quand le serveur a accepté le courrier (250) ; lève `EchecCourrier` sinon. */
  envoyer(courrier: Courrier): Promise<void>;
  fermer(): Promise<void>;
}
export interface Transport {
  ouvrir(signal?: AbortSignal): Promise<SessionCourrier>;
}

// Ce que l'alerte contient ---------------------------------------------------------------------------

const ADMIN = 'https://ntanova.com/admin/#demandes/';
const DOMAINE = 'ntanova.com';
/** Au-delà, dans l'heure, un seul courrier regroupe les références suivantes. */
export const PAR_HEURE = 20;
/** Par passage : autant que la base en réserve. */
export const PAR_PASSAGE = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFERENCE = /^[CAR]-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

export const lienDuMessage = (reference: string): string => `${ADMIN}${reference}`;

/** Ce que la base rend, lu sans rien supposer : une ligne qui sort de la forme attendue ne devient jamais un courrier. */
export function lireReservation(brut: unknown): Reservation {
  const o = (typeof brut === 'object' && brut !== null ? brut : {}) as Record<string, unknown>;
  if (!Array.isArray(o.notices)) throw new Error('reservation');
  const annonces: Annonce[] = [];
  const illisibles: string[] = [];
  for (const n of o.notices as Record<string, unknown>[]) {
    const bail = typeof n?.lease === 'string' && UUID.test(n.lease) ? n.lease : null;
    if (bail === null) continue;
    const { reference, kind, message_id: messageId } = n;
    if (
      typeof reference === 'string' &&
      REFERENCE.test(reference) &&
      typeof kind === 'string' &&
      Object.hasOwn(NATURES, kind) &&
      typeof messageId === 'string' &&
      UUID.test(messageId)
    ) {
      annonces.push({ bail, reference, nature: kind as Nature, messageId });
    } else {
      illisibles.push(bail);
    }
  }
  const heure = o.sent_last_hour;
  return {
    annonces,
    illisibles,
    envoyeesDansLHeure: typeof heure === 'number' && heure >= 0 ? heure : 0,
  };
}

const ligne = (a: Annonce) => `${a.reference} (${NATURES[a.nature]})\n${lienDuMessage(a.reference)}`;

function courrierSeul(a: Annonce): Courrier {
  return {
    objet: `NTanova · nouveau message ${a.reference} (${NATURES[a.nature]})`,
    corps: `Un message est arrivé. Ouvrir dans l'administration :\n\n${ligne(a)}\n`,
    // Le même à chaque essai : un second envoi se reconnaît.
    messageId: `${a.messageId}@${DOMAINE}`,
  };
}

async function courrierGroupe(annonces: readonly Annonce[]): Promise<Courrier> {
  // Le même groupe a le même Message-ID ; un groupe différent en a un autre, sinon une boîte pourrait prendre le second pour un
  // doublon et cacher des références.
  const octets = new TextEncoder().encode(annonces.map((a) => a.messageId).sort().join('\n'));
  const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', octets)), (o) =>
    o.toString(16).padStart(2, '0'),
  ).join('');
  return {
    objet: `NTanova · ${annonces.length} nouveaux messages`,
    corps:
      `${annonces.length} messages sont arrivés. Plus de ${PAR_HEURE} alertes sont parties dans l'heure : celles-ci sont regroupées, ` +
      `une ligne par message.\n\n${annonces.map(ligne).join('\n\n')}\n`,
    messageId: `groupe-${empreinte.slice(0, 32)}@${DOMAINE}`,
  };
}

/** Un courrier par annonce tant que l'heure n'en a pas vu vingt ; le reste ensemble, aucune référence perdue. */
export async function composer(
  annonces: readonly Annonce[],
  envoyeesDansLHeure: number,
): Promise<{ annonces: readonly Annonce[]; courrier: Courrier }[]> {
  const libres = Math.max(0, PAR_HEURE - envoyeesDansLHeure);
  const seules = annonces.slice(0, libres);
  const reste = annonces.slice(libres);
  const groupes = seules.map((a) => ({ annonces: [a], courrier: courrierSeul(a) }));
  if (reste.length === 1) return [...groupes, { annonces: reste, courrier: courrierSeul(reste[0]!) }];
  if (reste.length > 1) {
    return [...groupes, { annonces: reste, courrier: await courrierGroupe(reste) }];
  }
  return groupes;
}

// Un passage -----------------------------------------------------------------------------------------------

/** Ce qu'un passage a fait : des nombres et des codes, rien d'autre. C'est tout ce qui va au journal. */
export interface Bilan {
  reservees: number;
  envoyees: number;
  echecs: Partial<Record<CodeEchec, number>>;
  /** Résultats que la base n'a pas reçus : le bail expire, l'annonce repartira avec le même Message-ID. */
  nonMarquees: number;
}

/** Un passage entier, sous cette limite : loin du bail de cinq minutes, sous la limite d'une fonction Edge. */
export const DUREE_MAX_MS = 100_000;
/** Ce qu'il faut au moins pour tenter un courrier de plus. */
const RESTE_MIN_MS = 15_000;

export async function passer(
  registre: Registre,
  transport: Transport,
  options: { maintenant?: () => number; dureeMaxMs?: number } = {},
): Promise<Bilan> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), options.dureeMaxMs ?? DUREE_MAX_MS);
  try {
    return await executerPassage(registre, transport, options, controle.signal);
  } finally {
    clearTimeout(minuterie);
    controle.abort();
  }
}

/** Une attente muette respecte aussi la limite globale ; les adaptateurs reçoivent l'annulation pour couper le réseau. */
async function borner<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => undefined);
    throw new EchecCourrier('delai', true);
  }
  let annuler: () => void = () => undefined;
  const fin = new Promise<never>((_, rejeter) => {
    annuler = () => rejeter(new EchecCourrier('delai', true));
    signal.addEventListener('abort', annuler, { once: true });
  });
  try {
    return await Promise.race([operation, fin]);
  } finally {
    signal.removeEventListener('abort', annuler);
  }
}

async function executerPassage(
  registre: Registre,
  transport: Transport,
  options: { maintenant?: () => number; dureeMaxMs?: number },
  signal: AbortSignal,
): Promise<Bilan> {
  const maintenant = options.maintenant ?? (() => Date.now());
  const fin = maintenant() + (options.dureeMaxMs ?? DUREE_MAX_MS);
  const reservation = await borner(registre.reserver(PAR_PASSAGE, signal), signal);
  const bilan: Bilan = {
    reservees: reservation.annonces.length + reservation.illisibles.length,
    envoyees: 0,
    echecs: {},
    nonMarquees: 0,
  };
  const marquer = async (bail: string, resultat: 'envoyee' | CodeEchec) => {
    if (resultat === 'envoyee') bilan.envoyees += 1;
    else bilan.echecs[resultat] = (bilan.echecs[resultat] ?? 0) + 1;
    // Deux essais : marquer est sans risque à rejouer, le bail ne vaut qu'une fois.
    for (let essai = 0; essai < 2; essai++) {
      if (signal.aborted) break;
      try {
        await borner(registre.marquer(bail, resultat, signal), signal);
        return;
      } catch {
        // Le prochain passage reprendra cette annonce ; rien du serveur n'est recopié ici.
      }
    }
    bilan.nonMarquees += 1;
  };
  for (const bail of reservation.illisibles) await marquer(bail, 'configuration');
  if (reservation.annonces.length === 0) return bilan;

  const groupes = await composer(reservation.annonces, reservation.envoyeesDansLHeure);
  let session: SessionCourrier | null = null;
  let arret: CodeEchec | null = null;
  try {
    session = await borner(transport.ouvrir(signal), signal);
  } catch (e) {
    arret = e instanceof EchecCourrier ? e.code : 'connexion';
  }
  for (const { annonces, courrier } of groupes) {
    let resultat: 'envoyee' | CodeEchec;
    if (arret !== null || session === null) {
      resultat = arret ?? 'connexion';
    } else if (signal.aborted || fin - maintenant() < RESTE_MIN_MS) {
      resultat = arret = 'delai';
    } else {
      try {
        await borner(session.envoyer(courrier), signal);
        resultat = 'envoyee';
      } catch (e) {
        resultat = e instanceof EchecCourrier ? e.code : 'connexion';
        if (!(e instanceof EchecCourrier) || e.fatal) arret = resultat;
      }
    }
    // Marquer tout de suite : une coupure plus loin ne doit pas faire repartir ce qui est déjà accepté.
    for (const a of annonces) await marquer(a.bail, resultat);
  }
  try {
    if (session !== null) await borner(session.fermer(), signal);
  } catch {
    // La session est finie de toute façon.
  }
  return bilan;
}
