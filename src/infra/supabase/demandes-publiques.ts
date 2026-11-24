/**
 * Envoyer un message depuis le site public (refonte, lot 3C) : les deux portes de la base, sans client Supabase.
 *
 * `send_public_request(json)` a UN paramètre, SANS NOM : son corps est le paramètre. Il part donc tel quel, en POST, par
 * `fetch` ; un appel `.rpc` avec des paramètres nommés ferait décoder le message par le serveur, qui en recopierait un bout
 * dans son journal sur un signe impossible (constaté au lot 3B1). Rien de ce qu'une personne a écrit ne passe dans une
 * adresse, une erreur ou la console.
 */
import type { NomDeChamp } from '../../modele/demandes';
import { lireIssue, type Contenu } from '../../modele/demandes';
import type { PortDemandes, ReponseLaissezPasser } from '../../modele/envoi-public';
import { CHAMP } from './champs-demandes';

/** Au-delà, on ne sait pas si le serveur a reçu : la page le dit et garde tout. */
export const DELAI_ENVOI_MS = 15_000;

/**
 * Les envois ne sont pas ouverts : `55000`, levé par la base tant qu'elle n'a pas de secret d'envoi (la pile locale le rend en
 * HTTP 500) ; `PGRST202`, la porte n'existe pas encore dans cette base. Le code fait foi, pas le numéro HTTP.
 */
const CODES_FERMES: readonly unknown[] = ['55000', 'PGRST202'];

interface Options {
  delaiMs?: number;
  fetch?: typeof fetch;
}

const objet = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/** Le contenu, sous les noms de la base. */
export function traduireContenu(contenu: Contenu): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(contenu).map(([nom, v]) => [CHAMP[nom as NomDeChamp], v]),
  );
}

/** La réponse de la base, sous les noms du modèle ; `lireIssue` décide ensuite de ce qu'elle veut dire. */
export function traduireReponse(brut: unknown): unknown {
  const r = objet(brut);
  const erreurs: Record<string, unknown> = {};
  for (const [nom, code] of Object.entries(objet(r.errors))) {
    const champ = Object.entries(CHAMP).find(([, base]) => base === nom)?.[0] ?? 'demande';
    erreurs[champ] = code;
  }
  return {
    code: r.code,
    reference: r.reference,
    precedente: r.previous_reference,
    ...(r.errors ? { erreurs } : {}),
  };
}

export function creerPortDemandes(url: string, cle: string, options: Options = {}): PortDemandes {
  const { delaiMs = DELAI_ENVOI_MS } = options;

  /** Le corps de la réponse et son numéro, ou rien : réseau coupé, délai passé, réponse illisible. */
  async function poster(
    fonction: string,
    corps: unknown,
  ): Promise<{ ok: boolean; corps: unknown } | null> {
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), delaiMs);
    try {
      const reponse = await (options.fetch ?? fetch)(`${url}/rest/v1/rpc/${fonction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cle,
          Authorization: `Bearer ${cle}`,
        },
        body: JSON.stringify(corps),
        signal: arret.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      return { ok: reponse.ok, corps: await reponse.json() };
    } catch {
      return null;
    } finally {
      clearTimeout(minuterie);
    }
  }

  return {
    async demanderLaissezPasser(): Promise<ReponseLaissezPasser> {
      const r = await poster('issue_public_request_pass', {});
      const { key, issued_at, seal, code } = objet(r?.corps);
      if (r && !r.ok && CODES_FERMES.includes(code)) return { genre: 'ferme' };
      if (
        !r?.ok ||
        typeof key !== 'string' ||
        typeof issued_at !== 'number' ||
        typeof seal !== 'string'
      ) {
        return { genre: 'non_confirme' };
      }
      return { genre: 'accorde', passe: { cle: key, emisLe: issued_at, sceau: seal } };
    },
    async envoyer({ passe, revision, nature, contenu, piege }) {
      const r = await poster('send_public_request', {
        key: passe.cle,
        issued_at: passe.emisLe,
        seal: passe.sceau,
        revision,
        kind: nature,
        request: traduireContenu(contenu),
        trap: piege,
      });
      return r?.ok ? lireIssue(traduireReponse(r.corps)) : { genre: 'non_confirme' };
    },
  };
}
