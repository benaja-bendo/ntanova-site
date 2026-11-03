/**
 * Quand la position est bloquée, le relais lit quoi faire sur SON téléphone (ticket #72). Des fonctions pures : le
 * navigateur est reconnu à son identifiant, l'aide est écrite pour ce téléphone-là, jamais pour un autre.
 *
 * Pourquoi : l'ancien message disait « Dans Chrome, touchez le cadenas à gauche de l'adresse » et parlait d'un Mac.
 * Sur un iPhone, Chrome n'a pas de réglage de position à lui : il utilise celui de l'iPhone (Réglages). Beaucoup de
 * relais sont sur iPhone, avec Chrome, et un lien ouvert depuis WhatsApp (ou Facebook, Gmail…) se lit dans un
 * navigateur intégré à l'app, qui ne donne pas la position.
 *
 * Les libellés viennent des pages d'aide d'Apple (« Contrôler les informations de localisation partagées sur
 * l'iPhone », FR) et de Google (« Gérer vos paramètres de localisation dans Chrome », iPhone et Android, FR) :
 * Réglages > Confidentialité et sécurité > Service de localisation ; l'app ; « Lorsque l'app est active » ; « Position
 * exacte » ; sur Android, l'icône à gauche de l'adresse puis « Autorisations ». Sur iPhone, l'API des autorisations de
 * Safari et de Chrome ment parfois (« prompt » après un refus) : on ne s'en sert pas pour décider, on propose les
 * réglages et on relance la mesure au retour du relais dans l'application.
 */
import type { ErreurPosition } from './geo';

export type Systeme = 'ios' | 'android' | 'ordinateur';

export type Navigateur =
  'chrome' | 'safari' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'integre' | 'autre';

export interface Environnement {
  systeme: Systeme;
  /** « iPhone », « iPad », « téléphone Android » ou « ordinateur » : pour le message à NTanova. */
  appareil: string;
  navigateur: Navigateur;
  /** L'application est lancée depuis l'écran d'accueil. */
  installee: boolean;
}

/** Ce que le navigateur dit de lui : l'identifiant, et de quoi reconnaître un iPad qui se présente comme un Mac. */
export interface Indices {
  userAgent: string;
  platform?: string | undefined;
  maxTouchPoints?: number | undefined;
  installee?: boolean | undefined;
}

/** Les apps qui ouvrent les liens dans leur propre fenêtre (WhatsApp ne se signale pas : voir plus bas). */
const APP_INTEGREE =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|GSA\//;

export function lireEnvironnement(indices: Indices): Environnement {
  const ua = indices.userAgent ?? '';
  const iphone = /iPhone|iPod/.test(ua);
  // Un iPad récent se présente comme un Mac : seul son écran tactile le trahit.
  const ipad =
    /iPad/.test(ua) ||
    (!iphone && indices.platform === 'MacIntel' && (indices.maxTouchPoints ?? 0) > 1);
  const android = /Android/.test(ua);
  const systeme: Systeme = iphone || ipad ? 'ios' : android ? 'android' : 'ordinateur';
  const appareil = iphone ? 'iPhone' : ipad ? 'iPad' : android ? 'téléphone Android' : 'ordinateur';

  let navigateur: Navigateur;
  if (APP_INTEGREE.test(ua)) navigateur = 'integre';
  else if (systeme === 'ios') {
    if (/CriOS\//.test(ua)) navigateur = 'chrome';
    else if (/FxiOS\//.test(ua)) navigateur = 'firefox';
    else if (/EdgiOS\//.test(ua)) navigateur = 'edge';
    else if (/OPiOS\//.test(ua)) navigateur = 'opera';
    // Safari signe « Safari/… » ; une app qui affiche une page dans sa fenêtre (WhatsApp, Gmail…) ne le signe pas.
    else navigateur = /Safari\//.test(ua) ? 'safari' : 'integre';
  } else if (systeme === 'android') {
    // « wv » : une WebView, le navigateur intégré d'une app.
    if (/;\s*wv\)/.test(ua)) navigateur = 'integre';
    else if (/SamsungBrowser\//.test(ua)) navigateur = 'samsung';
    else if (/EdgA\//.test(ua)) navigateur = 'edge';
    else if (/OPR\/|Opera/.test(ua)) navigateur = 'opera';
    else if (/Firefox\//.test(ua)) navigateur = 'firefox';
    else if (/Chrome\//.test(ua)) navigateur = 'chrome';
    else navigateur = 'autre';
  } else if (/Edg\//.test(ua)) navigateur = 'edge';
  else if (/OPR\//.test(ua)) navigateur = 'opera';
  else if (/Firefox\//.test(ua)) navigateur = 'firefox';
  else if (/Chrome\//.test(ua)) navigateur = 'chrome';
  else if (/Safari\//.test(ua)) navigateur = 'safari';
  else navigateur = 'autre';

  return { systeme, appareil, navigateur, installee: indices.installee ?? false };
}

/** Le nom que le relais voit dans ses réglages. */
export function nomDuNavigateur(env: Environnement): string {
  return {
    chrome: 'Chrome',
    safari: 'Safari',
    firefox: 'Firefox',
    edge: 'Edge',
    samsung: 'Samsung Internet',
    opera: 'Opera',
    integre: 'un navigateur intégré à une app',
    autre: 'votre navigateur',
  }[env.navigateur];
}

const BLOCAGES: readonly ErreurPosition[] = ['refusee', 'indisponible', 'trop_longue', 'absente'];

/**
 * Le blocage lu dans le message d'une mesure qui échoue (c'est le code du blocage). Tout autre message (une panne de la
 * base du téléphone, par exemple) devient « introuvable » : l'écran ne tombe jamais pour un message inattendu.
 */
export function lireErreurPosition(message: string | undefined): ErreurPosition {
  return BLOCAGES.find((b) => b === message) ?? 'indisponible';
}

export interface AideDePosition {
  /** Ce qui se passe, en une phrase. */
  titre: string;
  /** Pourquoi, en une phrase. */
  cause: string;
  /** Quoi faire, dans l'ordre. */
  etapes: string[];
  /** Un conseil de plus, ou rien. */
  conseil: string | null;
}

const REPRENDRE = 'Touchez « Reprendre la position ».';
const A_DECOUVERT =
  'Sortez devant l’entrée de l’école, à découvert (pas sous un toit, ni entre deux murs).';

/**
 * Les guillemets français collent à ce qu'ils entourent (espace insécable) : « Lorsque l'app est active » ne se coupe
 * jamais en bout de ligne, avec le « » » resté seul au début de la suivante.
 */
const typographie = (texte: string): string =>
  texte.replace(/« /g, '«\u00A0').replace(/ »/g, '\u00A0»');

export function aideDePosition(erreur: ErreurPosition, env: Environnement): AideDePosition {
  const aide = rediger(erreur, env);
  return {
    titre: typographie(aide.titre),
    cause: typographie(aide.cause),
    etapes: aide.etapes.map(typographie),
    conseil: aide.conseil === null ? null : typographie(aide.conseil),
  };
}

function rediger(erreur: ErreurPosition, env: Environnement): AideDePosition {
  if (env.navigateur === 'integre' && (erreur === 'refusee' || erreur === 'absente')) {
    return dansUneAutreApp();
  }
  switch (erreur) {
    case 'refusee':
      return refusee(env);
    case 'indisponible':
      return introuvable(env);
    case 'trop_longue':
      return tarde(env);
    case 'absente':
      return nonGeree(env);
  }
}

/** Le lien est ouvert dans la fenêtre d'une autre app : elle ne donne pas la position. */
function dansUneAutreApp(): AideDePosition {
  return {
    titre: 'Cette page est ouverte dans une autre app, qui ne donne pas la position.',
    cause:
      'WhatsApp, Facebook, Gmail et d’autres affichent les liens dans leur propre fenêtre, sans accès à la position.',
    etapes: [
      'Cherchez « Ouvrir dans Chrome », « Ouvrir dans Safari » ou « Ouvrir dans le navigateur » : dans le menu (trois points) ou en bas de cette fenêtre.',
      'Sinon, copiez l’adresse de la page et collez-la dans Chrome.',
      'Une fois dans Chrome, touchez « Reprendre la position ».',
    ],
    conseil: null,
  };
}

function refusee(env: Environnement): AideDePosition {
  if (env.systeme === 'ios') return refuseeSurIos(env);
  if (env.systeme === 'android') return refuseeSurAndroid(env);
  return refuseeSurOrdinateur();
}

const REGLAGES_IOS = [
  'Ouvrez l’app « Réglages » du téléphone.',
  'Touchez « Confidentialité et sécurité », puis « Service de localisation ».',
  'Vérifiez que « Service de localisation » est activé (en haut de l’écran).',
];

function refuseeSurIos(env: Environnement): AideDePosition {
  const nav = nomDuNavigateur(env);
  const fermer = `Si rien ne change, fermez ${nav} complètement (glissez-le vers le haut dans le sélecteur d’apps), puis rouvrez NTanova.`;
  if (env.navigateur === 'safari') {
    return {
      titre: 'La position est bloquée.',
      cause:
        'Safari n’a pas le droit d’utiliser la position du téléphone, ou ce site a été refusé.',
      etapes: [
        ...REGLAGES_IOS,
        'Dans la liste, touchez « Safari » (ou « Sites web de Safari ») et choisissez « Lorsque l’app est active ».',
        'Dans Safari, touchez « aA » à gauche de l’adresse, puis « Réglages du site web », puis « Position », et choisissez « Autoriser ».',
        REPRENDRE,
      ],
      conseil: env.installee
        ? `Depuis l’écran d’accueil, le téléphone peut redemander l’autorisation à chaque ouverture : touchez « Autoriser ». ${fermer}`
        : fermer,
    };
  }
  return {
    titre: 'La position est bloquée.',
    cause: `${env.navigateur === 'autre' ? 'Votre navigateur' : nav} n’a pas le droit d’utiliser la position du téléphone, ou l’autorisation a été refusée.`,
    etapes: [
      ...REGLAGES_IOS,
      `Dans la liste, touchez « ${nav} » et choisissez « Lorsque l’app est active ». Laissez « Position exacte » activée.`,
      `Revenez dans ${nav}. S’il demande l’autorisation, touchez « Autoriser », puis « Reprendre la position ».`,
    ],
    conseil:
      env.navigateur === 'chrome'
        ? `Autre chemin : dans « Réglages », descendez jusqu’à « Chrome », puis touchez « Position ». ${fermer}`
        : fermer,
  };
}

function refuseeSurAndroid(env: Environnement): AideDePosition {
  const nav = nomDuNavigateur(env);
  return {
    titre: 'La position est bloquée.',
    cause: `${env.navigateur === 'autre' ? 'Votre navigateur' : nav} n’a pas le droit d’utiliser la position, ou l’autorisation a été refusée.`,
    etapes: [
      'Touchez l’icône à gauche de l’adresse (un cadenas ou deux curseurs), puis « Autorisations ».',
      'Touchez « Position » et choisissez « Autoriser ».',
      'Vérifiez aussi que la localisation du téléphone est activée : glissez depuis le haut de l’écran et activez « Position ».',
      'Revenez ici et touchez « Reprendre la position ».',
    ],
    conseil: `Si « Position » n’apparaît pas dans les autorisations : Réglages du téléphone, Applications, ${nav}, Autorisations, Position, puis autorisez-la quand l’application est utilisée.`,
  };
}

function refuseeSurOrdinateur(): AideDePosition {
  return {
    titre: 'La position est bloquée.',
    cause: 'Le navigateur n’a pas le droit d’utiliser la position de l’ordinateur.',
    etapes: [
      'Cliquez sur l’icône à gauche de l’adresse (un cadenas ou deux curseurs), puis autorisez « Position ».',
      'Sur Mac : Réglages Système, Confidentialité et sécurité, Service de localisation, puis activez-le pour le navigateur. Sur Windows : Paramètres, Confidentialité et sécurité, Localisation.',
      'Rechargez la page, puis cliquez sur « Reprendre la position ».',
    ],
    conseil: null,
  };
}

function introuvable(env: Environnement): AideDePosition {
  const reglage =
    env.systeme === 'ios'
      ? 'Vérifiez que le « Service de localisation » est activé : Réglages, Confidentialité et sécurité, Service de localisation.'
      : env.systeme === 'android'
        ? 'Vérifiez que la localisation du téléphone est activée : glissez depuis le haut de l’écran et activez « Position ».'
        : 'Vérifiez que l’ordinateur est connecté à Internet (sa position vient du Wi-Fi) et que sa localisation est activée : Mac, Réglages Système, Confidentialité et sécurité, Service de localisation ; Windows, Paramètres, Confidentialité et sécurité, Localisation.';
  return {
    titre: 'Le téléphone ne trouve pas votre position.',
    cause: 'Le signal est trop faible, ou la localisation du téléphone est éteinte.',
    etapes: [A_DECOUVERT, reglage, `Attendez quelques secondes. ${REPRENDRE}`],
    conseil: 'Si le mode avion est activé, désactivez-le.',
  };
}

function tarde(env: Environnement): AideDePosition {
  return {
    titre: 'La position tarde.',
    cause:
      env.systeme === 'ordinateur'
        ? 'L’ordinateur cherche encore sa position.'
        : 'Le téléphone cherche encore le signal.',
    etapes: [
      'Sortez devant l’entrée, à découvert.',
      'Patientez une trentaine de secondes sans éteindre l’écran.',
      REPRENDRE,
    ],
    conseil: 'Un téléphone sans réseau, ou à peine allumé, met plus de temps la première fois.',
  };
}

function nonGeree(env: Environnement): AideDePosition {
  const ou =
    env.systeme === 'ios'
      ? 'Safari ou dans Chrome'
      : env.systeme === 'android'
        ? 'Chrome'
        : 'Chrome ou dans Safari';
  return {
    titre: 'Ce navigateur ne donne pas la position.',
    cause: 'Il ne sait pas lire la position de l’appareil.',
    etapes: [`Ouvrez NTanova dans ${ou}.`, REPRENDRE],
    conseil: null,
  };
}

/** Au-delà, la position est si large qu'elle vient d'une position « approximative » plutôt que du GPS. */
const PRECISION_TRES_LARGE_M = 500;

/**
 * Une position de plusieurs centaines de mètres : sur iPhone c'est presque toujours « Position exacte » éteinte pour le
 * navigateur ; sur Android, la position précise non autorisée. Sinon, rien : la précision se règle en se plaçant
 * devant l'entrée (déjà dit par l'écran).
 */
export function aideDePrecision(precisionM: number, env: Environnement): string | null {
  if (precisionM < PRECISION_TRES_LARGE_M) return null;
  const nav = nomDuNavigateur(env);
  const mesure = `La position est très approximative (${Math.round(precisionM)} m).`;
  if (env.systeme === 'ios') {
    return typographie(
      `${mesure} Vérifiez que « Position exacte » est activée pour ${nav} : Réglages, Confidentialité et sécurité, Service de localisation, ${nav}.`,
    );
  }
  if (env.systeme === 'android') {
    return `${mesure} Autorisez la position précise (et pas seulement approximative) pour ${nav} dans les réglages du téléphone.`;
  }
  return null;
}

/** Le message prérempli pour écrire à NTanova : le téléphone, le navigateur, le blocage. Rien de personnel. */
export function messageDeSupport(erreur: ErreurPosition, env: Environnement): string {
  const blocage: Record<ErreurPosition, string> = {
    refusee: 'position refusée',
    indisponible: 'position introuvable',
    trop_longue: 'position trop longue',
    absente: 'position non gérée par le navigateur',
  };
  return `Bonjour NTanova, la position est bloquée dans l’application relais. Téléphone : ${env.appareil}. Navigateur : ${nomDuNavigateur(env)}. Problème : ${blocage[erreur]}.`;
}
