/**
 * Les mentions datées d'une fiche, une seule grammaire pour tout le site public (refonte publique, lot 4, 24/11/2026 ;
 * canevas « Points de repère », planche « Fiabilité des informations ») : la fiche réelle, la démonstration, l'accueil,
 * Fiabilité des informations et Données de l'annuaire disent les mêmes mots, dans le même ordre, avec le même lien.
 *
 * Une mention dit qui a constaté ou déclaré quoi, et quand. Plusieurs peuvent coexister sur une fiche, chacune avec sa date :
 * ce n'est ni une note, ni un classement (décision du 03/11/2026 : « les preuves ne se fusionnent pas »). Une mention sans
 * date dans la base reste sans date : rien n'est déduit.
 *
 * Pur : ni DOM, ni Astro.
 */
import type { NomIcone } from './carte/icones';
import { libelleProvenance, type Provenance } from './libelles';
import { LIEN_METHODE } from './pages-de-confiance';
import type { EcolePubliee } from './ports';

/** L'ordre de lecture des mentions, celui de la planche : d'où vient la fiche, puis la confirmation. Pas un ordre de valeur. */
export const ORDRE_DES_MENTIONS: readonly Provenance[] = [
  'relevee',
  'declaree',
  'ajoutee',
  'verifiee',
];

/** L'ancre de `/methode/` qui explique les mentions : chaque lien d'explication y mène. */
export const ANCRE_MENTIONS = 'm-mentions';
export const LIEN_MENTIONS = `${LIEN_METHODE}#${ANCRE_MENTIONS}`;

/** Le genre visuel d'une mention, celui des classes `.mention-datee-…` et des pastilles de la fiche. */
export type GenreMention = 'terrain' | 'ecole' | 'ajoutee' | 'direction';
export const GENRE_DE_LA_MENTION: Readonly<Record<Provenance, GenreMention>> = {
  relevee: 'terrain',
  declaree: 'ecole',
  ajoutee: 'ajoutee',
  verifiee: 'direction',
};

/** L'icône de chaque mention, la même partout : l'œil du passage, le document de l'école, le bouclier de l'accord. */
export const ICONE_DE_LA_MENTION: Readonly<Record<Provenance, NomIcone | null>> = {
  relevee: 'oeil',
  declaree: 'document',
  ajoutee: null,
  verifiee: 'bouclier',
};

/**
 * Ce que dit chaque mention, en une phrase, partout où elle s'explique (accueil, démonstration, Fiabilité). Aucune ne se dit
 * plus forte ou plus faible qu'une autre ; « ne s'achète pas » est la règle de la confirmation (ligne rouge du 08/11).
 */
export const SENS_DES_MENTIONS: Readonly<Record<Provenance, string>> = {
  relevee: 'Un relais est passé devant l’école ce jour-là et a photographié son enseigne.',
  declaree: 'La direction a transmis ses informations, que l’équipe a saisies.',
  ajoutee: 'L’équipe a ajouté la fiche. Personne n’est encore passé, l’école ne l’a pas déclarée.',
  verifiee:
    'La direction a relu la fiche et donné son accord, à une date. Cette mention ne s’achète pas.',
};

type Fiche = Pick<EcolePubliee, 'etat' | 'origine' | 'verifieeLe' | 'releveeLe' | 'declareeLe'>;

export interface MentionDeFiche {
  mention: Provenance;
  libelle: string;
  /** Le jour de la mention à l'heure du Congo (`AAAA-MM-JJ`), ou rien quand la base ne le dit pas. */
  jour: string | null;
}

const FORMAT_JOUR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Brazzaville',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Un jour `AAAA-MM-JJ` à l'heure du Congo, d'un jour déjà écrit ou d'un instant. */
export function jourDuCongoDe(valeur: string | Date): string {
  if (typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur;
  return FORMAT_JOUR.format(new Date(valeur));
}

const jourOuRien = (v: string | null | undefined): string | null => (v ? jourDuCongoDe(v) : null);

/**
 * Les mentions que porte une fiche, dans l'ordre de lecture, chacune avec son jour : elles coexistent, aucune n'en remplace une
 * autre. Mêmes règles que les pastilles de la fiche (`preuvesDeLaFiche`) :
 * - « Vue sur place » se lit sur le jour du relevé accepté, jamais ailleurs ;
 * - « Déclarée par l'école » sur l'origine de la fiche ;
 * - « Ajoutée par NTanova » quand ni l'un ni l'autre : la fiche ne porte alors aucune date de mention ;
 * - « Confirmée par la direction » sur l'accord daté.
 */
export function mentionsDe(e: Fiche): MentionDeFiche[] {
  const vue = !!e.releveeLe;
  const declaree = e.origine === 'school';
  const porte: Record<Provenance, boolean> = {
    relevee: vue,
    declaree,
    ajoutee: !vue && !declaree,
    verifiee: e.etat === 'verifiee',
  };
  const jour: Record<Provenance, string | null> = {
    relevee: jourOuRien(e.releveeLe),
    declaree: jourOuRien(e.declareeLe),
    ajoutee: null,
    verifiee: jourOuRien(e.verifieeLe),
  };
  return ORDRE_DES_MENTIONS.filter((m) => porte[m]).map((mention) => ({
    mention,
    libelle: libelleProvenance[mention],
    jour: jour[mention],
  }));
}

// Les comptes, pour Fiabilité et Données ----------------------------------------------------------------------------------

export interface CompteDesMentions {
  /** Les fiches comptées. */
  fiches: number;
  /** Les fiches qui portent chaque mention : une fiche compte dans chacune des siennes, les lignes ne s'additionnent pas. */
  parMention: { mention: Provenance; libelle: string; fiches: number }[];
  /** Les fiches confirmées par leur direction qui sont aussi vues sur place. */
  confirmeesEtVues: number;
}

export function compterLesMentions(ecoles: readonly Fiche[]): CompteDesMentions {
  const portees = ecoles.map((e) => new Set(mentionsDe(e).map((m) => m.mention)));
  return {
    fiches: ecoles.length,
    parMention: ORDRE_DES_MENTIONS.map((mention) => ({
      mention,
      libelle: libelleProvenance[mention],
      fiches: portees.filter((p) => p.has(mention)).length,
    })),
    confirmeesEtVues: portees.filter((p) => p.has('verifiee') && p.has('relevee')).length,
  };
}

/**
 * « 2 fiches vues sur place, 1 ajoutée par NTanova, 1 confirmée par sa direction, qui est aussi vue sur place » : la phrase de
 * Fiabilité. Une mention que personne ne porte n'est pas dite ; rien du tout : `null`.
 */
export function phraseDesMentions(c: CompteDesMentions): string | null {
  const pluriel = (n: number, un: string, plusieurs: string) =>
    `${n.toLocaleString('fr-FR')} ${n > 1 ? plusieurs : un}`;
  const n = (m: Provenance) => c.parMention.find((x) => x.mention === m)?.fiches ?? 0;
  const morceaux: string[] = [];
  if (n('relevee') > 0)
    morceaux.push(pluriel(n('relevee'), 'fiche vue sur place', 'fiches vues sur place'));
  if (n('declaree') > 0)
    morceaux.push(pluriel(n('declaree'), 'déclarée par l’école', 'déclarées par l’école'));
  if (n('ajoutee') > 0)
    morceaux.push(pluriel(n('ajoutee'), 'ajoutée par NTanova', 'ajoutées par NTanova'));
  const confirmees = n('verifiee');
  if (confirmees > 0) {
    const et = c.confirmeesEtVues;
    const aussi =
      et === 0
        ? ''
        : et === confirmees
          ? confirmees > 1
            ? ', qui sont aussi vues sur place'
            : ', qui est aussi vue sur place'
          : `, dont ${et.toLocaleString('fr-FR')} aussi ${et > 1 ? 'vues' : 'vue'} sur place`;
    morceaux.push(
      `${pluriel(confirmees, 'confirmée par sa direction', 'confirmées par leur direction')}${aussi}`,
    );
  }
  return morceaux.length > 0 ? morceaux.join(', ') : null;
}

export interface DatesDUneMention {
  mention: Provenance;
  libelle: string;
  /** Les fiches qui portent la mention. */
  fiches: number;
  laPlusRecente: string | null;
  laPlusAncienne: string | null;
  /** Les fiches qui portent la mention sans jour connu. */
  sansDate: number;
}

/**
 * Les dates de chaque mention qui en porte : la plus récente, la plus ancienne, et combien de fiches n'en ont pas. « Ajoutée
 * par NTanova » n'a pas de date sur la fiche : elle n'en a pas ici non plus.
 */
export function datesDesMentions(ecoles: readonly Fiche[]): DatesDUneMention[] {
  const toutes = ecoles.flatMap(mentionsDe);
  return ORDRE_DES_MENTIONS.filter((m) => m !== 'ajoutee').map((mention) => {
    const siennes = toutes.filter((x) => x.mention === mention);
    const jours = siennes.map((x) => x.jour).filter((j): j is string => j !== null);
    return {
      mention,
      libelle: libelleProvenance[mention],
      fiches: siennes.length,
      laPlusRecente: jours.length > 0 ? jours.reduce((a, b) => (a > b ? a : b)) : null,
      laPlusAncienne: jours.length > 0 ? jours.reduce((a, b) => (a < b ? a : b)) : null,
      sansDate: siennes.length - jours.length,
    };
  });
}

/**
 * Les jours où des fiches ont reçu une mention, du plus récent au plus ancien : une fiche compte une fois par jour, et à chacun
 * des jours où elle a reçu une mention (vue un jour, confirmée un autre : deux jours). La colonne ne s'additionne pas.
 */
export function fichesParJourDeMention(
  ecoles: readonly Fiche[],
): { jour: string; fiches: number }[] {
  const parJour = new Map<string, number>();
  for (const e of ecoles) {
    const jours = new Set(
      mentionsDe(e)
        .map((m) => m.jour)
        .filter((j): j is string => j !== null),
    );
    for (const j of jours) parJour.set(j, (parJour.get(j) ?? 0) + 1);
  }
  return [...parJour.entries()]
    .map(([jour, fiches]) => ({ jour, fiches }))
    .sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0));
}

/** Les fiches qui ne portent aucune mention datée (par exemple, seulement « Ajoutée par NTanova »). */
export function fichesSansMentionDatee(ecoles: readonly Fiche[]): number {
  return ecoles.filter((e) => mentionsDe(e).every((m) => m.jour === null)).length;
}
