/**
 * La porte du service : qui peut le réveiller, et ce qu'il répond. Seule la sonnette de la base (`ntanova_supabase.ring_public_request_notices`)
 * connaît le jeton. Sans jeton ou sans réglage, rien n'est réservé, rien n'est noté : l'administration voit un service qui ne passe
 * pas, jamais un faux « en marche ».
 */
import type { Bilan } from './service.ts';

export interface Configuration {
  jeton: string;
  url: string;
  cle: string;
  smtp: {
    hote: string;
    utilisateur: string;
    motDePasse: string;
    expediteur: string;
    destinataire: string;
  };
}

const ADRESSE = /^[^\s@<>()",;:\\]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Les réglages, tous nécessaires. Un manque ou une forme inattendue : `null`, jamais une valeur devinée. */
export function lireConfiguration(env: (nom: string) => string | undefined): Configuration | null {
  const lire = (nom: string) => env(nom)?.trim() || null;
  const jeton = lire('ALERTE_JETON');
  const url = lire('SUPABASE_URL');
  const cle = lireCle(lire('SUPABASE_SECRET_KEYS'), lire('ALERTE_NOM_DE_CLE') ?? 'alerte_messages');
  const hote = lire('ALERTE_SMTP_HOTE');
  const utilisateur = lire('ALERTE_SMTP_UTILISATEUR');
  const motDePasse = env('ALERTE_SMTP_MOT_DE_PASSE') || null;
  const destinataire = lire('ALERTE_DESTINATAIRE');
  const expediteur = lire('ALERTE_EXPEDITEUR') ?? utilisateur;
  if (
    jeton === null ||
    jeton.length < 32 ||
    url === null ||
    !/^https?:\/\//.test(url) ||
    cle === null ||
    hote === null ||
    !/^[a-z0-9.-]+$/i.test(hote) ||
    utilisateur === null ||
    motDePasse === null ||
    destinataire === null ||
    !ADRESSE.test(destinataire) ||
    expediteur === null ||
    !ADRESSE.test(expediteur)
  ) {
    return null;
  }
  return { jeton, url, cle, smtp: { hote, utilisateur, motDePasse, expediteur, destinataire } };
}

/** La clé secrète propre au service, par son nom : elle se révoque seule. Jamais la clé `default` à sa place. */
function lireCle(brut: string | null, nom: string): string | null {
  if (brut === null) return null;
  try {
    const cles = JSON.parse(brut) as Record<string, unknown>;
    const cle = Object.hasOwn(cles, nom) ? cles[nom] : null;
    return typeof cle === 'string' && cle !== '' ? cle : null;
  } catch {
    return null;
  }
}

/** Comparer sans que le temps de réponse n'apprenne rien : les deux empreintes ont la même longueur. */
async function memeJeton(recu: string, attendu: string): Promise<boolean> {
  const empreinte = async (t: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const [a, b] = await Promise.all([empreinte(recu), empreinte(attendu)]);
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a[i]! ^ b[i]!;
  return ecart === 0;
}

const repondre = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export function creerPorte(p: {
  jeton: string | null;
  configuration: Configuration | null;
  passer: (c: Configuration) => Promise<Bilan>;
  journal: (ligne: string) => void;
}): (requete: Request) => Promise<Response> {
  return async (requete) => {
    if (requete.method !== 'POST') return repondre(405, { code: 'methode' });
    if (p.jeton === null || p.jeton.length < 32) return repondre(503, { code: 'configuration' });
    const recu = requete.headers.get('x-ntanova-jeton') ?? '';
    if (!(await memeJeton(recu, p.jeton))) return repondre(401, { code: 'jeton' });
    if (p.configuration === null) {
      p.journal(JSON.stringify({ alerte: 'configuration' }));
      return repondre(503, { code: 'configuration' });
    }
    try {
      const bilan = await p.passer(p.configuration);
      p.journal(JSON.stringify({ alerte: 'passage', ...bilan }));
      return repondre(200, { code: 'passage', ...bilan });
    } catch {
      // La base n'a pas répondu : rien n'est réservé. L'erreur ne se recopie pas, elle pourrait porter une adresse ou une clé.
      p.journal(JSON.stringify({ alerte: 'base' }));
      return repondre(502, { code: 'base' });
    }
  };
}
