/**
 * Lot 2 du site public (15/11) : les demandes des familles, comptées sans nom ni numéro (P5, `family_demands`), lues par
 * l'administration. Une demande de **vérification** vise la fiche d'une école ; une demande d'**orientation** est un test
 * sans résultat (profil, domaine, lieu, rythme, série). Au plus une par téléphone, sujet et jour : la base le garde.
 * Des nombres, jamais un objectif.
 */
import { libelleProfilOrientation, libelleRythme, libelleSerie } from './libelles';
import type { Valeur } from './listes';

export interface DemandeFamille {
  genre: Valeur<'family_demand_kind'>;
  /** Le jour de la demande, à Brazzaville. */
  jour: string;
  /** La fiche dont la famille demande la vérification. */
  ecole: { id: string; nom: string } | null;
  profil: Valeur<'orientation_profile'> | null;
  /** Le nom du domaine, de la ville ou du quartier cherchés. */
  domaine: string | null;
  lieu: string | null;
  rythme: Valeur<'study_rhythm'> | null;
  serie: Valeur<'bac_track'> | null;
}

export interface DemandesResumees {
  total: number;
  /** Les fiches les plus demandées d'abord. `depuis` : le jour de la première demande. */
  verifications: { ecoleId: string; nom: string; nombre: number; depuis: string }[];
  /** Les recherches sans résultat, les plus fréquentes d'abord : « Au lycée, ou j'ai le bac · Informatique · Pointe-Noire ». */
  orientations: { sujet: string; nombre: number; depuis: string }[];
}

/** Ce qu'une famille cherchait au test d'orientation, en mots. */
export function sujetDOrientation(d: DemandeFamille): string {
  return (
    [
      d.profil ? libelleProfilOrientation[d.profil] : null,
      d.domaine,
      d.lieu,
      d.rythme ? libelleRythme[d.rythme] : null,
      d.serie ? libelleSerie[d.serie] : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Sans précision'
  );
}

function compter<T>(
  demandes: readonly DemandeFamille[],
  cle: (d: DemandeFamille) => string | null,
  premier: (d: DemandeFamille) => T,
) {
  const groupes = new Map<string, { valeur: T; nombre: number; depuis: string }>();
  for (const d of demandes) {
    const k = cle(d);
    if (k === null) continue;
    const g = groupes.get(k);
    if (!g) groupes.set(k, { valeur: premier(d), nombre: 1, depuis: d.jour });
    else {
      g.nombre++;
      if (d.jour < g.depuis) g.depuis = d.jour;
    }
  }
  return [...groupes.values()];
}

export function resumerDemandes(demandes: readonly DemandeFamille[]): DemandesResumees {
  const verifications = compter(
    demandes.filter((d) => d.genre === 'verification' && d.ecole),
    (d) => d.ecole!.id,
    (d) => d.ecole!,
  )
    .map((g) => ({ ecoleId: g.valeur.id, nom: g.valeur.nom, nombre: g.nombre, depuis: g.depuis }))
    .sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom, 'fr'));
  const orientations = compter(
    demandes.filter((d) => d.genre === 'orientation'),
    sujetDOrientation,
    sujetDOrientation,
  )
    .map((g) => ({ sujet: g.valeur, nombre: g.nombre, depuis: g.depuis }))
    .sort((a, b) => b.nombre - a.nombre || a.sujet.localeCompare(b.sujet, 'fr'));
  return { total: demandes.length, verifications, orientations };
}
