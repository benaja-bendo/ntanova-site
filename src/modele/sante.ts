/**
 * « Santé des envois » (ticket #77) : le journal des erreurs des téléphones, lisible par l'administration.
 *
 * Le téléphone écrit des codes courts et un détail brut (« Error : PGRST205 : Could not find the table… »). Ici on en
 * fait une phrase, et on regroupe ce qui se répète : soixante-quinze lignes identiques de trois relais sont trois
 * lignes, pas un mur. Un code que ce fichier ne connaît pas encore s'affiche tel quel : une nouveauté du téléphone ne
 * casse jamais l'écran.
 */
import { lireEnvironnement, nomDuNavigateur } from './aide-position';

/** Une ligne du journal, avec le prénom du relais qui l'a envoyée. */
export interface LigneJournal {
  id: string;
  relaisPrenom: string;
  survenueLe: string;
  ecran: string | null;
  code: string;
  detail: string | null;
  versionApp: string | null;
  appareil: string | null;
}

/** Ce qui se répète : un relais, un signal, une version de l'application, un appareil. */
export interface GroupeJournal {
  cle: string;
  relaisPrenom: string;
  code: string;
  explication: string;
  appareil: string;
  versionApp: string | null;
  nombre: number;
  premiere: string;
  derniere: string;
  /** Le détail brut de la dernière ligne, pour qui veut creuser. */
  detail: string | null;
}

/** Une application d'avant la bascule du 02/11 cherche des tables ou des liens qui n'existent plus. */
const ANCIENNE_VERSION = /PGRST(200|205)|Could not find the/;

const ANCIENNE_VERSION_PHRASE =
  "Ancienne version de l'application : elle cherche des données qui n'existent plus. La mise à jour n'est pas passée sur ce téléphone.";

const PHRASES: Record<string, string> = {
  position_refusee:
    'La position est refusée : le relais doit l’autoriser dans les Réglages de son téléphone.',
  position_indisponible:
    'Le téléphone ne donne pas sa position (signal faible, ou service de localisation coupé).',
  position_trop_longue: 'La mesure de la position a pris trop de temps.',
  position_absente: 'Ce téléphone, ou ce navigateur, ne sait pas donner sa position.',
  position_introuvable: 'La position n’a pas pu être lue.',
  photo_illisible: 'Une photo n’est plus lisible sur le téléphone.',
  photo_trop_lourde: 'Une photo est trop lourde pour être allégée.',
  reseau_releve: 'La connexion a échoué pendant l’envoi du relevé.',
  reseau_photo: 'La connexion a échoué pendant l’envoi d’une photo.',
  reseau_contact: 'La connexion a échoué pendant l’envoi du contact de la direction.',
  delai_depasse: 'Un envoi a dépassé le temps limite : il reprend tout seul plus tard.',
  envoi_echoue: 'Un envoi a échoué, sans raison connue.',
  zones_illisibles: 'Les zones ouvertes n’ont pas pu être lues.',
  paie_illisible: 'La paie du relais n’a pas pu être lue.',
  inattendue: 'Une erreur inattendue pendant la synchronisation.',
  adaptateurs: 'L’application n’a pas pu démarrer correctement.',
  echec: 'La déconnexion a échoué.',
};

/** Ce que le signal veut dire, en une phrase. */
export function expliquerCode(code: string, detail: string | null): string {
  if (code === 'lecture_refusee' || code === 'envoi_refuse') {
    if (detail && ANCIENNE_VERSION.test(detail)) return ANCIENNE_VERSION_PHRASE;
    return code === 'lecture_refusee'
      ? 'La lecture des données de NTanova a échoué.'
      : 'NTanova a refusé un envoi.';
  }
  if (code === 'rejet_photo_absente') {
    return 'Une fiche a été refusée : la photo de l’enseigne n’était plus dans le téléphone.';
  }
  if (code.startsWith('rejet_')) {
    return `Une fiche a été refusée par la base (${code.slice('rejet_'.length)}).`;
  }
  return PHRASES[code] ?? `Signal inconnu : ${code}`;
}

/** « Chrome sur iPhone », « Safari sur iPhone », « Chrome sur téléphone Android »… */
export function appareilLisible(userAgent: string | null): string {
  if (!userAgent) return 'Appareil inconnu';
  const env = lireEnvironnement({ userAgent });
  if (env.navigateur === 'integre') return `Navigateur intégré à une autre app sur ${env.appareil}`;
  return `${nomDuNavigateur(env)} sur ${env.appareil}`;
}

/** Regroupe ce qui se répète ; le plus récent d'abord. */
export function regrouper(lignes: readonly LigneJournal[]): GroupeJournal[] {
  const groupes = new Map<string, GroupeJournal>();
  for (const l of lignes) {
    const explication = expliquerCode(l.code, l.detail);
    const appareil = appareilLisible(l.appareil);
    const cle = [l.relaisPrenom, l.code, explication, l.versionApp ?? '', appareil].join('|');
    const existant = groupes.get(cle);
    if (!existant) {
      groupes.set(cle, {
        cle,
        relaisPrenom: l.relaisPrenom,
        code: l.code,
        explication,
        appareil,
        versionApp: l.versionApp,
        nombre: 1,
        premiere: l.survenueLe,
        derniere: l.survenueLe,
        detail: l.detail,
      });
      continue;
    }
    existant.nombre += 1;
    if (Date.parse(l.survenueLe) < Date.parse(existant.premiere)) existant.premiere = l.survenueLe;
    if (Date.parse(l.survenueLe) >= Date.parse(existant.derniere)) {
      existant.derniere = l.survenueLe;
      existant.detail = l.detail;
    }
  }
  return [...groupes.values()].sort((a, b) => Date.parse(b.derniere) - Date.parse(a.derniere));
}

/** Les périodes que l'écran propose. `null` : tout le journal. */
export const periodes: { jours: number | null; libelle: string }[] = [
  { jours: 1, libelle: '24 heures' },
  { jours: 7, libelle: '7 jours' },
  { jours: 30, libelle: '30 jours' },
  { jours: null, libelle: 'Tout' },
];

/** 7 jours : le bruit d'une nuit de bascule sort de la vue, sans filtre écrit en dur. */
export const periodeParDefaut = 7;

/** Le début d'une période, en date ISO ; `null` pour « tout ». */
export function debutDePeriode(jours: number | null, maintenant: Date): string | null {
  if (jours === null) return null;
  return new Date(maintenant.getTime() - jours * 86_400_000).toISOString();
}
