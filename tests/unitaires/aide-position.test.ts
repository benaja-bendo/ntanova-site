import { describe, expect, it } from 'vitest';
import {
  aideDePosition,
  aideDePrecision,
  lireEnvironnement,
  lireErreurPosition,
  messageDeSupport,
  type Environnement,
} from '../../src/modele/aide-position';
import type { ErreurPosition } from '../../src/modele/geo';

// Quand la position est bloquée, le relais lit quoi faire sur SON téléphone (ticket #72). Chrome sur iPhone, le cas du
// fondateur et de beaucoup de relais, se règle dans les Réglages de l'iPhone : l'ancien message parlait d'un cadenas « à
// gauche de l'adresse » et d'un Mac, ce qui n'existe pas là. Les chaînes ci-dessous sont de vrais identifiants de
// navigateur ; les libellés des réglages sont ceux d'Apple et de l'aide de Chrome (en français).

const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const FIREFOX_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';
const EDGE_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/125.0.2535.67 Mobile/15E148 Safari/604.1';
// Le navigateur intégré d'une app (WhatsApp, Gmail…) : pas de « Safari/ » à la fin.
const APP_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const FACEBOOK_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.38.108;FBBV/600000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/fr_FR;FBOP/5]';
// Un iPad qui se présente comme un Mac : seul l'écran tactile le trahit.
const SAFARI_IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SAMSUNG_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 13; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0';
const OPERA_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 OPR/80.5.4244.77581';
const EDGE_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.2592.80';
// Le « wv » dit une WebView : le navigateur intégré d'une app.
const WEBVIEW_ANDROID =
  'Mozilla/5.0 (Linux; Android 12; SM-G991B Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';
const FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.38.108;]';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87';

const env = (userAgent: string, plus: Partial<Parameters<typeof lireEnvironnement>[0]> = {}) =>
  lireEnvironnement({ userAgent, ...plus });

describe('reconnaître le téléphone et le navigateur', () => {
  it.each<[string, string, Partial<Environnement>]>([
    ['Chrome sur iPhone', CHROME_IPHONE, { systeme: 'ios', navigateur: 'chrome' }],
    ['Safari sur iPhone', SAFARI_IPHONE, { systeme: 'ios', navigateur: 'safari' }],
    ['Firefox sur iPhone', FIREFOX_IPHONE, { systeme: 'ios', navigateur: 'firefox' }],
    ['Edge sur iPhone', EDGE_IPHONE, { systeme: 'ios', navigateur: 'edge' }],
    ['le navigateur d’une app sur iPhone', APP_IPHONE, { systeme: 'ios', navigateur: 'integre' }],
    ['Facebook sur iPhone', FACEBOOK_IPHONE, { systeme: 'ios', navigateur: 'integre' }],
    ['Chrome sur Android', CHROME_ANDROID, { systeme: 'android', navigateur: 'chrome' }],
    ['Samsung Internet', SAMSUNG_ANDROID, { systeme: 'android', navigateur: 'samsung' }],
    ['Firefox sur Android', FIREFOX_ANDROID, { systeme: 'android', navigateur: 'firefox' }],
    ['Opera sur Android', OPERA_ANDROID, { systeme: 'android', navigateur: 'opera' }],
    ['Edge sur Android', EDGE_ANDROID, { systeme: 'android', navigateur: 'edge' }],
    ['une WebView Android', WEBVIEW_ANDROID, { systeme: 'android', navigateur: 'integre' }],
    ['Facebook sur Android', FACEBOOK_ANDROID, { systeme: 'android', navigateur: 'integre' }],
    ['Chrome sur Mac', CHROME_MAC, { systeme: 'ordinateur', navigateur: 'chrome' }],
    ['Chrome sur Windows', CHROME_WINDOWS, { systeme: 'ordinateur', navigateur: 'chrome' }],
    ['Firefox sur Windows', FIREFOX_WINDOWS, { systeme: 'ordinateur', navigateur: 'firefox' }],
    ['Edge sur Windows', EDGE_WINDOWS, { systeme: 'ordinateur', navigateur: 'edge' }],
  ])('%s', (_nom, userAgent, attendu) => {
    expect(env(userAgent)).toMatchObject(attendu);
  });

  it('un iPad qui se présente comme un Mac est un appareil iOS', () => {
    expect(env(SAFARI_IPAD)).toMatchObject({ systeme: 'ordinateur' });
    expect(env(SAFARI_IPAD, { platform: 'MacIntel', maxTouchPoints: 5 })).toMatchObject({
      systeme: 'ios',
      navigateur: 'safari',
    });
  });

  it('dit si l’application est lancée depuis l’écran d’accueil', () => {
    expect(env(SAFARI_IPHONE).installee).toBe(false);
    expect(env(SAFARI_IPHONE, { installee: true }).installee).toBe(true);
  });

  it('un identifiant qu’on ne connaît pas reste lisible', () => {
    expect(env('')).toMatchObject({ systeme: 'ordinateur', navigateur: 'autre' });
    expect(env('curl/8.0')).toMatchObject({ systeme: 'ordinateur', navigateur: 'autre' });
  });
});

const ERREURS: ErreurPosition[] = ['refusee', 'indisponible', 'trop_longue', 'absente'];
const TOUS = [
  CHROME_IPHONE,
  SAFARI_IPHONE,
  FIREFOX_IPHONE,
  EDGE_IPHONE,
  APP_IPHONE,
  FACEBOOK_IPHONE,
  CHROME_ANDROID,
  SAMSUNG_ANDROID,
  FIREFOX_ANDROID,
  OPERA_ANDROID,
  EDGE_ANDROID,
  WEBVIEW_ANDROID,
  FACEBOOK_ANDROID,
  CHROME_MAC,
  CHROME_WINDOWS,
  FIREFOX_WINDOWS,
  EDGE_WINDOWS,
];

const brut = (a: ReturnType<typeof aideDePosition>) =>
  [a.titre, a.cause, ...a.etapes, a.conseil ?? ''].join('\n');
// Les guillemets collent à ce qu'ils entourent (espace insécable) : on lit le texte avec des espaces ordinaires.
const texte = (a: ReturnType<typeof aideDePosition>) => brut(a).replace(/\u00a0/g, ' ');

describe('chaque blocage a une aide lisible, sur chaque téléphone', () => {
  it('dit ce qui se passe, pourquoi, et quoi faire, dans tous les cas', () => {
    for (const userAgent of TOUS) {
      for (const erreur of ERREURS) {
        const aide = aideDePosition(erreur, env(userAgent));
        const cas = `${erreur} · ${userAgent.slice(0, 60)}`;
        expect(aide.titre.trim(), cas).not.toBe('');
        expect(aide.cause.trim(), cas).not.toBe('');
        expect(aide.etapes.length, cas).toBeGreaterThanOrEqual(1);
        for (const etape of aide.etapes) expect(etape.trim(), cas).not.toBe('');
      }
    }
  });

  it('ne parle jamais de l’interface d’un autre système (ni « Mac » sur un téléphone, ni « iPhone » sur Android)', () => {
    for (const erreur of ERREURS) {
      for (const userAgent of [CHROME_IPHONE, SAFARI_IPHONE, FIREFOX_IPHONE, EDGE_IPHONE]) {
        const t = texte(aideDePosition(erreur, env(userAgent)));
        expect(t, `iPhone · ${erreur}`).not.toMatch(/\bMac\b|Windows|Android|cadenas/i);
      }
      for (const userAgent of [CHROME_ANDROID, SAMSUNG_ANDROID, FIREFOX_ANDROID]) {
        const t = texte(aideDePosition(erreur, env(userAgent)));
        expect(t, `Android · ${erreur}`).not.toMatch(
          /\bMac\b|Windows|iPhone|Réglages Système|Confidentialité et sécurité/i,
        );
      }
    }
  });
});

describe('Chrome sur iPhone : position refusée', () => {
  const aide = aideDePosition('refusee', env(CHROME_IPHONE));
  const t = texte(aide);

  it('envoie dans les Réglages de l’iPhone, avec les mots d’Apple', () => {
    expect(aide.etapes[0]).toMatch(/Réglages/);
    expect(t).toMatch(/Confidentialité et sécurité/);
    expect(t).toMatch(/Service de localisation/);
    expect(t).toMatch(/Lorsque l’app est active/);
    expect(t).toMatch(/Position exacte/);
  });

  it('nomme Chrome, là où l’on règle sa position', () => {
    expect(t).toMatch(/« Chrome »/);
    expect(aide.conseil).toMatch(/Réglages.*Chrome.*Position/);
  });

  it('ne parle ni du cadenas à gauche de l’adresse ni d’un Mac (l’ancien message)', () => {
    expect(t).not.toMatch(/cadenas|à gauche de l’adresse|Mac|Réglages Système/i);
  });

  it('dit de revenir et d’autoriser quand Chrome le demande', () => {
    expect(t).toMatch(/Autoriser/);
  });
});

describe('les autres cas, chacun avec ses mots', () => {
  it('Safari sur iPhone : le réglage du site, et celui de Safari', () => {
    const t = texte(aideDePosition('refusee', env(SAFARI_IPHONE)));
    expect(t).toMatch(/Réglages du site web/);
    expect(t).toMatch(/Safari/);
    expect(t).toMatch(/Service de localisation/);
  });

  it('un navigateur d’app (WhatsApp…) : il faut ouvrir la page dans Chrome ou Safari', () => {
    for (const userAgent of [APP_IPHONE, FACEBOOK_IPHONE, WEBVIEW_ANDROID, FACEBOOK_ANDROID]) {
      const aide = aideDePosition('refusee', env(userAgent));
      expect(aide.titre, userAgent.slice(0, 40)).toMatch(/autre app|WhatsApp|Facebook/i);
      expect(texte(aide), userAgent.slice(0, 40)).toMatch(/Ouvrir dans/);
      expect(texte(aide), userAgent.slice(0, 40)).toMatch(/Chrome/);
    }
  });

  it('Chrome sur Android : l’icône à gauche de l’adresse, « Autorisations », « Position »', () => {
    const t = texte(aideDePosition('refusee', env(CHROME_ANDROID)));
    expect(t).toMatch(/à gauche de l’adresse/);
    expect(t).toMatch(/Autorisations/);
    expect(t).toMatch(/Position/);
    expect(t).toMatch(/Autoriser/);
  });

  it('un ordinateur : l’icône de l’adresse, et les réglages du Mac ou de Windows', () => {
    const t = texte(aideDePosition('refusee', env(CHROME_MAC)));
    expect(t).toMatch(/Réglages Système/);
    expect(t).toMatch(/Windows/);
  });

  it('position introuvable : sortir à découvert et vérifier la localisation du téléphone', () => {
    const ios = texte(aideDePosition('indisponible', env(CHROME_IPHONE)));
    expect(ios).toMatch(/à découvert/);
    expect(ios).toMatch(/Service de localisation/);
    const android = texte(aideDePosition('indisponible', env(CHROME_ANDROID)));
    expect(android).toMatch(/à découvert/);
    expect(android).toMatch(/Position/);
  });

  it('position qui tarde : patienter, à découvert', () => {
    const t = texte(aideDePosition('trop_longue', env(CHROME_IPHONE)));
    expect(t).toMatch(/à découvert/);
    expect(t).toMatch(/Patientez/);
  });

  it('navigateur sans position : ouvrir dans Chrome ou Safari', () => {
    const t = texte(aideDePosition('absente', env(FIREFOX_WINDOWS)));
    expect(t).toMatch(/Chrome/);
  });

  it('depuis l’écran d’accueil d’un iPhone, le téléphone peut redemander l’autorisation', () => {
    const aide = aideDePosition('refusee', env(SAFARI_IPHONE, { installee: true }));
    expect(aide.conseil).toMatch(/écran d’accueil/);
  });
});

describe('une position très approximative', () => {
  it('sur iPhone, c’est souvent « Position exacte » éteinte', () => {
    const conseil = aideDePrecision(3000, env(CHROME_IPHONE));
    expect(conseil).toMatch(/Position exacte/);
    expect(conseil).toMatch(/Chrome/);
  });

  it('sur Android, la position précise doit être autorisée', () => {
    expect(aideDePrecision(3000, env(CHROME_ANDROID))).toMatch(/précise/);
  });

  it('une précision correcte, ou seulement moyenne, ne déclenche rien', () => {
    expect(aideDePrecision(8, env(CHROME_IPHONE))).toBeNull();
    expect(aideDePrecision(120, env(CHROME_IPHONE))).toBeNull();
  });
});

describe('le message pour NTanova', () => {
  it('dit le téléphone, le navigateur et le blocage, sans rien de personnel', () => {
    const message = messageDeSupport('refusee', env(CHROME_IPHONE));
    expect(message).toMatch(/iPhone/);
    expect(message).toMatch(/Chrome/);
    expect(message).toMatch(/refusée/);
    expect(message).not.toMatch(/\d{6,}/);
  });

  it('se lit pour chaque blocage', () => {
    for (const erreur of ERREURS) {
      expect(messageDeSupport(erreur, env(CHROME_ANDROID)).length).toBeGreaterThan(40);
    }
  });
});

describe('l’erreur de position lue dans un message', () => {
  // La mesure échoue avec un message qui est le code du blocage ; une autre panne (la base du téléphone, par exemple)
  // arrive avec son propre texte et ne doit jamais faire tomber l'écran.
  it('reconnaît les quatre blocages', () => {
    for (const erreur of ERREURS) expect(lireErreurPosition(erreur)).toBe(erreur);
  });

  it('ramène tout le reste à « introuvable »', () => {
    expect(lireErreurPosition('Failed to execute transaction')).toBe('indisponible');
    expect(lireErreurPosition('')).toBe('indisponible');
    expect(lireErreurPosition(undefined)).toBe('indisponible');
  });
});

describe('la typographie', () => {
  // « Lorsque l'app est active » ne doit pas se couper en bout de ligne : le “ » ” restait seul au début de la suivante.
  it('colle les guillemets français à ce qu’ils entourent, partout', () => {
    for (const userAgent of TOUS) {
      for (const erreur of ERREURS) {
        const t = brut(aideDePosition(erreur, env(userAgent)));
        expect(t, `${erreur} · ${userAgent.slice(0, 40)}`).not.toMatch(/«(?!\u00a0)/);
        expect(t, `${erreur} · ${userAgent.slice(0, 40)}`).not.toMatch(/(?<!\u00a0)»/);
      }
    }
    const conseil = aideDePrecision(3000, env(CHROME_IPHONE)) ?? '';
    expect(conseil).not.toMatch(/«(?!\u00a0)/);
    expect(conseil).not.toMatch(/(?<!\u00a0)»/);
  });
});
