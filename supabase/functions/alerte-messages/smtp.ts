/**
 * Le dialogue SMTP d'un envoi, sur une connexion déjà chiffrée (465, TLS d'emblée). Aucune bibliothèque : le service n'envoie que
 * de petits courriers en texte. La connexion est un paramètre ; les essais en donnent une fictive ou locale.
 *
 * Rien de ce que répond le serveur ne sort d'ici : seulement un code de la liste fermée.
 */
import { EchecCourrier, type CodeEchec, type Courrier, type SessionCourrier } from './service.ts';

export interface Fil {
  /** `null` : la connexion est fermée. */
  lire(): Promise<Uint8Array | null>;
  ecrire(octets: Uint8Array): Promise<void>;
  fermer(): void;
}

export interface ReglagesSmtp {
  utilisateur: string;
  motDePasse: string;
  expediteur: string;
  destinataire: string;
}

export interface DelaisSmtp {
  /** Une réponse ordinaire. */
  reponseMs: number;
  /** La réponse finale, après le point : le serveur range le courrier. */
  rangementMs: number;
}
export const DELAIS: DelaisSmtp = { reponseMs: 10_000, rangementMs: 30_000 };

const REPONSE_AU_PLUS = 16_384;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64 = (texte: string): string => {
  let binaire = '';
  for (const o of encoder.encode(texte)) binaire += String.fromCharCode(o);
  return btoa(binaire);
};

/** Une ligne d'en-tête ne porte jamais de fin de ligne : rien ne peut s'y glisser. */
const uneLigne = (texte: string): string => texte.replace(/[\r\n]+/g, ' ');

/** Un en-tête en français, en mots encodés (RFC 2047) de 45 octets au plus. */
export function enTete(texte: string): string {
  const propre = uneLigne(texte);
  if (/^[\x20-\x7e]*$/.test(propre)) return propre;
  const morceaux: string[] = [];
  let courant = '';
  for (const signe of propre) {
    if (encoder.encode(courant + signe).length > 45) {
      morceaux.push(courant);
      courant = '';
    }
    courant += signe;
  }
  if (courant !== '') morceaux.push(courant);
  return morceaux.map((m) => `=?UTF-8?B?${base64(m)}?=`).join('\r\n ');
}

/** Le courrier entier, tel qu'il part : texte seul, un seul destinataire, aucune pièce jointe. */
export function ecrireCourrier(
  c: Courrier,
  r: Pick<ReglagesSmtp, 'expediteur' | 'destinataire'>,
  le: Date,
): string {
  const corps = base64(c.corps).replace(/(.{76})(?=.)/g, '$1\r\n');
  return [
    `From: NTanova <${r.expediteur}>`,
    `To: <${r.destinataire}>`,
    `Subject: ${enTete(c.objet)}`,
    `Date: ${le.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${c.messageId}>`,
    'Auto-Submitted: auto-generated',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    corps,
    '',
  ].join('\r\n');
}

/** Le code d'un refus : 4xx se retente, 5xx est ferme. */
const refus = (code: number): CodeEchec =>
  code >= 400 && code < 500 ? 'refus_temporaire' : 'refus_definitif';

class Dialogue {
  private recu = '';
  private ferme = false;
  private readonly fil: Fil;
  private readonly signal: AbortSignal | undefined;
  private readonly annuler = () => this.fermer();
  constructor(fil: Fil, signal?: AbortSignal) {
    this.fil = fil;
    this.signal = signal;
    signal?.addEventListener('abort', this.annuler, { once: true });
    if (signal?.aborted) this.fermer();
  }

  fermer(): void {
    if (this.ferme) return;
    this.ferme = true;
    this.signal?.removeEventListener('abort', this.annuler);
    try {
      this.fil.fermer();
    } catch {
      // Déjà fermée.
    }
  }

  private async borner<T>(operation: Promise<T>, ms: number): Promise<T> {
    if (this.signal?.aborted) {
      void operation.catch(() => undefined);
      throw new EchecCourrier('delai', true);
    }
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const delai = new Promise<never>((_, rejeter) => {
      minuterie = setTimeout(() => {
        // La connexion ne sert plus : une réponse tardive ne doit pas être prise pour celle de la commande suivante.
        this.fermer();
        rejeter(new EchecCourrier('delai', true));
      }, ms);
    });
    try {
      return await Promise.race([operation, delai]);
    } finally {
      clearTimeout(minuterie);
    }
  }

  /** Une réponse entière : `250-…` continue, `250 …` finit. */
  private async lireReponse(): Promise<{ code: number; lignes: string[] }> {
    const lignes: string[] = [];
    for (;;) {
      const fin = this.recu.indexOf('\n');
      if (fin >= 0) {
        const ligne = this.recu.slice(0, fin).replace(/\r$/, '');
        this.recu = this.recu.slice(fin + 1);
        const lu = /^(\d{3})([ -])?(.*)$/.exec(ligne);
        if (!lu) throw new EchecCourrier('connexion', true);
        lignes.push(lu[3] ?? '');
        if (lu[2] !== '-') return { code: Number(lu[1]), lignes };
        continue;
      }
      if (this.recu.length > REPONSE_AU_PLUS) throw new EchecCourrier('connexion', true);
      const octets = await this.fil.lire();
      if (octets === null) throw new EchecCourrier('connexion', true);
      this.recu += decoder.decode(octets, { stream: true });
    }
  }

  async reponse(ms: number): Promise<{ code: number; lignes: string[] }> {
    try {
      return await this.borner(this.lireReponse(), ms);
    } catch (e) {
      this.fermer();
      throw e instanceof EchecCourrier ? e : new EchecCourrier('connexion', true);
    }
  }

  async dire(texte: string, ms: number): Promise<void> {
    try {
      await this.borner(this.fil.ecrire(encoder.encode(`${texte}\r\n`)), ms);
    } catch (e) {
      this.fermer();
      throw e instanceof EchecCourrier ? e : new EchecCourrier('connexion', true);
    }
  }
}

/** Salue et s'identifie. Rend une session prête à envoyer. */
export async function ouvrirSession(
  fil: Fil,
  r: ReglagesSmtp,
  options: { delais?: DelaisSmtp; maintenant?: () => Date; signal?: AbortSignal } = {},
): Promise<SessionCourrier> {
  const d = options.delais ?? DELAIS;
  const maintenant = options.maintenant ?? (() => new Date());
  const dialogue = new Dialogue(fil, options.signal);
  const demander = async (commande: string, ms = d.reponseMs) => {
    await dialogue.dire(commande, ms);
    return dialogue.reponse(ms);
  };
  try {
    const accueil = await dialogue.reponse(d.reponseMs);
    if (accueil.code !== 220) throw new EchecCourrier(refus(accueil.code), true);
    const ehlo = await demander('EHLO alerte.ntanova.com');
    if (ehlo.code !== 250) throw new EchecCourrier(refus(ehlo.code), true);
    const moyens = ehlo.lignes
      .filter((l) => /^AUTH[ =]/i.test(l))
      .flatMap((l) => l.slice(5).toUpperCase().split(/\s+/));
    let code: number;
    if (moyens.includes('PLAIN')) {
      code = (await demander(`AUTH PLAIN ${base64(`\0${r.utilisateur}\0${r.motDePasse}`)}`)).code;
    } else if (moyens.includes('LOGIN')) {
      code = (await demander('AUTH LOGIN')).code;
      if (code === 334) code = (await demander(base64(r.utilisateur))).code;
      if (code === 334) code = (await demander(base64(r.motDePasse))).code;
    } else {
      throw new EchecCourrier('configuration', true);
    }
    if (code !== 235) {
      throw new EchecCourrier(code >= 400 && code < 500 ? 'refus_temporaire' : 'authentification', true);
    }
  } catch (e) {
    dialogue.fermer();
    throw e;
  }

  /** Un refus sur ce courrier : la session se remet à zéro, sauf si le serveur raccroche (421). */
  const refuser = async (code: number): Promise<never> => {
    if (code === 421) {
      dialogue.fermer();
      throw new EchecCourrier('refus_temporaire', true);
    }
    const remise = await demander('RSET');
    if (remise.code !== 250) {
      dialogue.fermer();
      throw new EchecCourrier(refus(code), true);
    }
    throw new EchecCourrier(refus(code), false);
  };

  return {
    async envoyer(courrier) {
      const de = await demander(`MAIL FROM:<${r.expediteur}>`);
      if (de.code !== 250) await refuser(de.code);
      const a = await demander(`RCPT TO:<${r.destinataire}>`);
      if (a.code !== 250 && a.code !== 251) await refuser(a.code);
      const donnees = await demander('DATA');
      if (donnees.code !== 354) await refuser(donnees.code);
      // Une ligne qui commence par un point se double : le base64 n'en a pas, la règle reste.
      const texte = ecrireCourrier(courrier, r, maintenant()).replace(/^\./gm, '..');
      const range = await demander(`${texte}.`, d.rangementMs);
      if (range.code !== 250) await refuser(range.code);
    },
    async fermer() {
      try {
        await dialogue.dire('QUIT', d.reponseMs);
      } finally {
        dialogue.fermer();
      }
    },
  };
}
