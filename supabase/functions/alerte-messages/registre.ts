/**
 * Les deux fonctions de la base données au service, et elles seules : réserver, marquer. Par l'API, avec la clé secrète du service.
 * Une erreur ne reprend jamais le corps d'une réponse.
 */
import { lireReservation, type Registre } from './service.ts';

export interface ReglagesRegistre {
  url: string;
  cle: string;
  delaiMs?: number;
}

export function creerRegistre(r: ReglagesRegistre, appel: typeof fetch = fetch): Registre {
  const rpc = async (nom: string, parametres: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> => {
    const reponse = await appel(`${r.url.replace(/\/+$/, '')}/rest/v1/rpc/${nom}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: r.cle,
        // Une clé `sb_secret_…` n'est pas un jeton : elle ne va que dans `apikey`. Une ancienne clé (locale) est un jeton.
        ...(r.cle.startsWith('sb_') ? {} : { authorization: `Bearer ${r.cle}` }),
      },
      body: JSON.stringify(parametres),
      signal: AbortSignal.any([AbortSignal.timeout(r.delaiMs ?? 10_000), ...(signal ? [signal] : [])]),
    });
    if (!reponse.ok) {
      await reponse.body?.cancel();
      throw new Error(`registre ${reponse.status}`);
    }
    return reponse.json();
  };
  return {
    async reserver(nombre, signal) {
      return lireReservation(await rpc('claim_public_request_notices', { p_limit: nombre }, signal));
    },
    async marquer(bail, resultat, signal) {
      return (
        (await rpc('report_public_request_notice', { p_lease: bail, p_result: resultat }, signal)) === true
      );
    },
  };
}
