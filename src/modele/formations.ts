/**
 * Les formations lues sur un panneau, une affiche ou un prospectus : série de bac, diplôme, domaine, rythme.
 * C'est ce qui rend les lycées, les écoles techniques et le supérieur cherchables. Pur : ni base ni écran.
 */
import { libelleDiplome, libelleSerie } from './libelles';
import { listes, type Valeur } from './listes';
import type { FormationSaisie } from './ports';

/** Les cycles qui ont des formations à saisir (les mêmes que ceux pour lesquels le relais note les filières). */
export const CYCLES_AVEC_FORMATIONS: readonly Valeur<'niveau'>[] = [
  'lycee',
  'technique',
  'superieur',
  'autre_formation',
];

export const cycleAvecFormations = (cycle: Valeur<'niveau'>): boolean =>
  CYCLES_AVEC_FORMATIONS.includes(cycle);

/** Les séries qu'on coche d'un geste pour un lycée : chacune devient une formation « Série C » (baccalauréat). */
export const SERIES_RAPIDES: readonly Valeur<'bac_track'>[] = [
  'a',
  'c',
  'd',
  'e',
  'f1',
  'f2',
  'f3',
  'f4',
  'g1',
  'g2',
  'g3',
  'h',
];

export function formationSerie(
  cycle: Valeur<'niveau'>,
  serie: Valeur<'bac_track'>,
): FormationSaisie {
  return {
    cycle,
    titre: libelleSerie[serie],
    domaine: null,
    serie,
    diplome: 'bac',
    rythmes: [],
  };
}

/** Le formulaire d'une formation libre (BTS, licence, certificat, métier…) : vide. */
export function formationVide(cycle: Valeur<'niveau'>): FormationSaisie {
  return { cycle, titre: '', domaine: null, serie: null, diplome: null, rythmes: [] };
}

/** Deux formations sont la même quand elles ont le même cycle et le même titre, à l'accent et à la casse près. */
export function memeFormation(
  a: Pick<FormationSaisie, 'cycle' | 'titre'>,
  b: Pick<FormationSaisie, 'cycle' | 'titre'>,
) {
  const norme = (t: string) =>
    t
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  return a.cycle === b.cycle && norme(a.titre) === norme(b.titre);
}

/** Ajoute une formation si elle n'y est pas déjà (même cycle, même titre). */
export function avecFormation(
  liste: readonly FormationSaisie[],
  f: FormationSaisie,
): FormationSaisie[] {
  return liste.some((x) => memeFormation(x, f)) ? [...liste] : [...liste, f];
}

/** Retire la formation de ce cycle et de ce titre. */
export function sansFormation(
  liste: readonly FormationSaisie[],
  f: Pick<FormationSaisie, 'cycle' | 'titre'>,
) {
  return liste.filter((x) => !memeFormation(x, f));
}

/** Les formations qui restent quand on décoche un cycle : celles de ce cycle partent avec lui. */
export function sansCycle(
  liste: readonly FormationSaisie[],
  cycle: Valeur<'niveau'>,
): FormationSaisie[] {
  return liste.filter((f) => f.cycle !== cycle);
}

/** Les formations d'un cycle. */
export const duCycle = (liste: readonly FormationSaisie[], cycle: Valeur<'niveau'>) =>
  liste.filter((f) => f.cycle === cycle);

/** Une ligne lisible : « BTS Informatique de gestion · BTS · jour, soir ». */
export function resume(
  f: Pick<FormationSaisie, 'titre' | 'serie' | 'diplome' | 'rythmes'>,
): string {
  const parties = [f.titre];
  if (f.diplome) parties.push(libelleDiplome[f.diplome]);
  if (f.rythmes.length > 0) {
    parties.push(f.rythmes.map((r) => (r === 'weekend' ? 'week-end' : r)).join(', '));
  }
  return parties.join(' · ');
}

/** Les messages d'une formation à envoyer : vide si elle peut partir. */
export function erreurFormation(f: FormationSaisie): string | null {
  if (f.titre.trim() === '') return 'Écris ce qui est affiché (« Série C », « BTS Gestion »…).';
  if (f.titre.trim().length > 160) return 'Ce titre est trop long.';
  if (f.serie !== null && !listes.bac_track.includes(f.serie))
    return 'Cette série n’est pas dans la liste.';
  if (f.diplome !== null && !listes.diploma_kind.includes(f.diplome))
    return 'Ce diplôme n’est pas dans la liste.';
  return null;
}
