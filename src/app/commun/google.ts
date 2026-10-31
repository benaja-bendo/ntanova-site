/**
 * La connexion Google (Google Identity Services) : Google donne un jeton
 * d'identité, que le port Session échange contre une session. Le nonce empêche
 * de rejouer un jeton volé : Google reçoit son empreinte, la base le nonce lui-même.
 */

interface ReponseGoogle {
  credential: string;
}

interface Gis {
  accounts: {
    id: {
      initialize(options: Record<string, unknown>): void;
      renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

let chargement: Promise<Gis> | null = null;

function chargerGoogle(): Promise<Gis> {
  chargement ??= new Promise<Gis>((resoudre, rejeter) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => (window.google ? resoudre(window.google) : rejeter(new Error('gsi')));
    script.onerror = () => {
      chargement = null;
      rejeter(new Error('gsi'));
    };
    document.head.append(script);
  });
  return chargement;
}

async function empreinte(texte: string): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Affiche le bouton de Google dans `element` ; `surJeton` reçoit le jeton et le nonce. */
export async function afficherBoutonGoogle(
  element: HTMLElement,
  clientId: string,
  surJeton: (jeton: string, nonce: string) => void,
): Promise<void> {
  const gis = await chargerGoogle();
  const nonce = crypto.randomUUID();
  gis.accounts.id.initialize({
    client_id: clientId,
    nonce: await empreinte(nonce),
    callback: (r: ReponseGoogle) => surJeton(r.credential, nonce),
    ux_mode: 'popup',
    auto_select: false,
    use_fedcm_for_button: true,
  });
  gis.accounts.id.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    locale: 'fr',
    width: Math.min(element.clientWidth || 320, 400),
  });
}

/**
 * Un navigateur intégré (WhatsApp, Facebook…) : Google y refuse la connexion.
 * On propose alors d'ouvrir la page dans Chrome.
 */
export function navigateurIntegre(agent = navigator.userAgent): boolean {
  return /; wv\)|FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|TikTok/i.test(agent);
}

/** Le lien qui ouvre la page courante dans Chrome, sur Android. */
export function lienChrome(adresse = location.href): string {
  const url = new URL(adresse);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;end`;
}
