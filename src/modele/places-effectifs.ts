/**
 * Lot 2 du site public (15/11) : ce que l'école dit de ses classes, saisi par l'administration (jamais par un relais).
 *
 * - **Les places annoncées** (P3, `campus_openings`) : une ligne par classe, dite par l'école à une date ; le site ne la
 *   montre plus 30 jours après (`expires_on`), et une annonce plus ancienne ne s'enregistre pas.
 * - **L'effectif** (P4, `campus_class_sizes`) : en tranches, jamais le nombre exact ; facultatif.
 *
 * Les mêmes règles que `set_campus_opening` et `set_campus_class_size` : l'écran les dit avant la base.
 */
import { ajouterJours, dateDeclareeValide, jourDuCongo } from './date-declaration';
import { libelleNiveau } from './libelles';
import { listes, type Valeur } from './listes';

/** Le site ne montre plus une annonce de places ce nombre de jours après le jour où l'école l'a dite (base : `said_on + 30`). */
export const JOURS_D_UNE_ANNONCE = 30;

export interface PlacesASaisir {
  cycle: Valeur<'niveau'>;
  /** « CP1 », « 6e » ; nul : tout le cycle. */
  classe: string | null;
  etat: Valeur<'opening_state'>;
  precision: string | null;
  ditLe: string;
}
export interface PlacesAnnoncees extends PlacesASaisir {
  id: string;
  /** Le dernier jour où le site la montre. */
  finLe: string;
}

export interface EffectifASaisir {
  cycle: Valeur<'niveau'>;
  classe: string | null;
  tranche: Valeur<'class_size_band'>;
  precision: string | null;
  ditLe: string;
}
export interface EffectifClasse extends EffectifASaisir {
  id: string;
}

/** Une ligne telle qu'on la tape : `valeur` est l'état des places, ou la tranche d'effectif. */
export interface SaisieClasse {
  cycle: string;
  classe: string;
  valeur: string;
  precision: string;
  ditLe: string;
}

export const saisieClasseVide = (cycle = '', aujourdHui = jourDuCongo()): SaisieClasse => ({
  cycle,
  classe: '',
  valeur: '',
  precision: '',
  ditLe: aujourdHui,
});

export const saisieDePlaces = (p: PlacesASaisir): SaisieClasse => ({
  cycle: p.cycle,
  classe: p.classe ?? '',
  valeur: p.etat,
  precision: p.precision ?? '',
  ditLe: p.ditLe,
});

export const saisieDEffectif = (e: EffectifASaisir): SaisieClasse => ({
  cycle: e.cycle,
  classe: e.classe ?? '',
  valeur: e.tranche,
  precision: e.precision ?? '',
  ditLe: e.ditLe,
});

/** Le jour `ditLe` + 30 : le dernier jour où le site montre l'annonce. */
export const finDeLAnnonce = (ditLe: string): string => ajouterJours(ditLe, JOURS_D_UNE_ANNONCE);

/** Le site montre-t-il encore l'annonce aujourd'hui ? */
export const annonceEnCours = (p: Pick<PlacesAnnoncees, 'finLe'>, aujourdHui = jourDuCongo()) =>
  p.finLe >= aujourdHui;

/** « CP1 », ou le cycle quand la ligne vaut pour tout le cycle. */
export const nomDeClasse = (x: { cycle: string; classe: string | null }): string =>
  x.classe?.trim() || libelleNiveau[x.cycle as Valeur<'niveau'>] || 'cette classe';

/** Ce qui est commun aux deux saisies : le cycle, la classe, la précision, la date. L'erreur, ou null. */
function erreurCommune(
  s: SaisieClasse,
  cycles: readonly string[],
  aujourdHui: string,
): string | null {
  if (!cycles.includes(s.cycle) || !listes.niveau.includes(s.cycle as Valeur<'niveau'>))
    return 'Choisis le cycle de la classe (il doit être dans la fiche de l’école).';
  if (s.classe.trim().length > 40 || s.precision.trim().length > 120)
    return 'Raccourcis la classe (40 caractères) ou la précision (120).';
  if (!dateDeclareeValide(s.ditLe, aujourdHui))
    return 'Indique le jour réel où l’école l’a dit, pas une date future.';
  return null;
}

export function lirePlaces(
  s: SaisieClasse,
  cycles: readonly string[],
  aujourdHui = jourDuCongo(),
): { places: PlacesASaisir | null; erreur: string | null } {
  const erreur =
    erreurCommune(s, cycles, aujourdHui) ??
    (!listes.opening_state.includes(s.valeur as Valeur<'opening_state'>)
      ? 'Dis ce que l’école annonce : places disponibles, peu de places ou complet.'
      : s.valeur === 'autre' && !s.precision.trim()
        ? 'Précise ce que l’école annonce.'
        : finDeLAnnonce(s.ditLe) < aujourdHui
          ? `Une annonce de plus de ${JOURS_D_UNE_ANNONCE} jours ne se publie plus : redemande à l’école.`
          : null);
  return {
    erreur,
    places: erreur
      ? null
      : {
          cycle: s.cycle as Valeur<'niveau'>,
          classe: s.classe.trim() || null,
          etat: s.valeur as Valeur<'opening_state'>,
          precision: s.precision.trim() || null,
          ditLe: s.ditLe,
        },
  };
}

export function lireEffectif(
  s: SaisieClasse,
  cycles: readonly string[],
  aujourdHui = jourDuCongo(),
): { effectif: EffectifASaisir | null; erreur: string | null } {
  const erreur =
    erreurCommune(s, cycles, aujourdHui) ??
    (!listes.class_size_band.includes(s.valeur as Valeur<'class_size_band'>)
      ? 'Choisis une tranche : jamais le nombre exact d’élèves.'
      : s.valeur === 'autre' && !s.precision.trim()
        ? 'Précise l’effectif dit par l’école.'
        : null);
  return {
    erreur,
    effectif: erreur
      ? null
      : {
          cycle: s.cycle as Valeur<'niveau'>,
          classe: s.classe.trim() || null,
          tranche: s.valeur as Valeur<'class_size_band'>,
          precision: s.precision.trim() || null,
          ditLe: s.ditLe,
        },
  };
}

/** Les classes du cycle le plus bas d'abord, puis par nom : l'ordre d'une fiche d'école. */
export function trierParClasse<T extends { cycle: string; classe: string | null }>(
  lignes: readonly T[],
): T[] {
  const rang = (c: string) => listes.niveau.indexOf(c as Valeur<'niveau'>);
  return [...lignes].sort(
    (a, b) =>
      rang(a.cycle) - rang(b.cycle) ||
      (a.classe ?? '').localeCompare(b.classe ?? '', 'fr', { numeric: true }),
  );
}
