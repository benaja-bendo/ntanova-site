/**
 * La ligne d'une école, la même partout où une liste d'écoles s'affiche (audit du 05/11/2026, D6) : une zone, un coin de la
 * carte, une formation, la recherche, « Autour de moi ». Le disque du cycle, le nom, les niveaux et le type, le lieu et le
 * repère, la preuve (jamais fusionnées : confirmée par la direction, vue sur place, déclarée par l'école, ou pas encore vue).
 *
 * Ce fichier ne dit QUE ce qu'on écrit : deux rendus le dessinent à l'identique, `ui/LigneEcole.astro` (à la construction)
 * et `ui/dom-pieces.ts` (dans le navigateur, pour les résultats de la recherche). Pur : ni DOM, ni Astro.
 */
import { cycleLePlusEleve } from './carte/cycles';
import type { NomIcone } from './carte/icones';
import { lienEcole, ligneDeLieu } from './geo-divisions';
import {
  libelleNiveau,
  libelleTypeEcole,
  provenanceDe,
  typeInformatif,
  type Provenance,
} from './libelles';
import type { Valeur } from './listes';
import type { EcolePubliee } from './ports';
import { ecrireDistance, type LigneRecherche } from './recherche';

/** L'icône de chaque preuve : l'écusson de la direction, l'œil du passage, le fanion de la déclaration. */
export const iconeDeProvenance: Record<Provenance, NomIcone> = {
  verifiee: 'bouclier',
  relevee: 'oeil',
  declaree: 'repere',
  ajoutee: 'oeil',
};

export interface LigneAffichee {
  /** L'adresse de la fiche. */
  url: string;
  nom: string;
  /** L'implantation (« Campus de Loandjili »), quand l'institution en a plusieurs. */
  etiquette: string | null;
  /** La lettre du cycle le plus élevé (celle de l'épingle), ou rien quand aucun niveau n'est noté. */
  lettre: string;
  /** Les niveaux, dans les mots du site. */
  niveaux: string[];
  /** Le type (« Privée »), rien quand il n'est pas connu. */
  type: string | null;
  /** « [Quartier] · Tié-Tié · Pointe-Noire » */
  lieu: string;
  repere: string | null;
  preuve: Provenance;
  /** « À 350 m », quand la liste est classée par distance. */
  distance: string | null;
}

/** Les niveaux et le type, sur une ligne : « Maternelle · Primaire · Privée ». */
export const niveauxEtType = (l: Pick<LigneAffichee, 'niveaux' | 'type'>): string =>
  [...l.niveaux, l.type].filter(Boolean).join(' · ');

/** Le lieu et le repère, sur une ligne. */
export const lieuEtRepere = (l: Pick<LigneAffichee, 'lieu' | 'repere'>): string =>
  [l.lieu, l.repere].filter(Boolean).join(' · ');

export function ligneDeEcole(e: EcolePubliee, distance: number | null = null): LigneAffichee {
  return {
    url: lienEcole(e),
    nom: e.nom,
    etiquette: e.etiquette,
    lettre: cycleLePlusEleve(e.niveaux)?.lettre ?? '',
    niveaux: e.niveaux.map((n) => libelleNiveau[n]),
    type: typeInformatif(e.typeEcole) ? libelleTypeEcole[e.typeEcole] : null,
    lieu: ligneDeLieu(e.quartier, e.divisionNoms),
    repere: e.repere,
    preuve: provenanceDe(e),
    distance: distance === null ? null : `À ${ecrireDistance(distance)}`,
  };
}

/** La même ligne, lue dans le fichier de recherche (`recherche.json`) : ce que la page construite et le navigateur partagent. */
export function ligneDeRecherche(l: LigneRecherche, distance: number | null): LigneAffichee {
  const preuve: Provenance = l.v ? 'verifiee' : l.o ? 'relevee' : l.g ? 'declaree' : 'ajoutee';
  return {
    url: l.u,
    nom: l.n,
    etiquette: l.e ?? null,
    lettre: cycleLePlusEleve(l.c)?.lettre ?? '',
    niveaux: l.c.map((n: Valeur<'niveau'>) => libelleNiveau[n]),
    type: l.k && typeInformatif(l.k) ? libelleTypeEcole[l.k] : null,
    lieu: ligneDeLieu(l.q ?? null, l.d.split(' › ')),
    repere: l.r ?? null,
    preuve,
    distance: distance === null ? null : `À ${ecrireDistance(distance)}`,
  };
}
