/**
 * Les formations que le relais coche sur place, sans clavier (audit de la fiche relais, 08/11/2026) : debout, au soleil,
 * devant une pancarte qui liste quinze BTS et licences, on touche un diplôme, puis des domaines. Chaque toucher sur un
 * domaine ajoute une filière « diplôme + domaine » (« BTS Gestion »), qu'un toucher retire. Le texte libre n'est que
 * le dernier recours, et une ligne de plus dans la même page, jamais une fenêtre.
 *
 * Ce que le relais coche **préremplit** « À valider » : l'administration le corrige avant d'accepter, et rien ne se
 * publie seul. La forme est celle de `FormationSaisie`, que l'administration donne déjà à `accept_reviewed_submission`.
 *
 * Pur : ni base, ni écran.
 */
import {
  CYCLES_AVEC_FORMATIONS,
  formationSerie,
  memeFormation,
  SERIES_RAPIDES,
} from './formations';
import { libelleDiplome } from './libelles';
import { listes, type Valeur } from './listes';
import type { FormationSaisie } from './ports';

/** Vingt filières au plus par cycle : assez pour une pancarte chargée, pas assez pour un envoi qui n'en finit pas. */
export const FORMATIONS_PAR_CYCLE_MAX = 20;

export interface DomaineRapide {
  /** L'adresse du domaine dans la base (`education_domains.slug`). */
  slug: string;
  /** Le mot court de la puce, repris dans l'intitulé de la filière. */
  libelle: string;
}

/**
 * Les domaines de la base, avec un mot court pour une puce. Le téléphone les connaît **sans réseau** : c'est une copie
 * de `education_domains`, et `formations-rapides.test.ts` la compare aux migrations. Les dix premiers se voient
 * d'abord ; les autres sont derrière « Plus de domaines », dans la même page.
 */
export const DOMAINES_RAPIDES: readonly DomaineRapide[] = [
  { slug: 'informatique', libelle: 'Informatique' },
  { slug: 'gestion', libelle: 'Gestion' },
  { slug: 'comptabilite-finance', libelle: 'Comptabilité' },
  { slug: 'commerce-marketing', libelle: 'Commerce' },
  { slug: 'secretariat-administration', libelle: 'Secrétariat' },
  { slug: 'btp', libelle: 'BTP' },
  { slug: 'electricite-electronique', libelle: 'Électricité' },
  { slug: 'mecanique-maintenance', libelle: 'Mécanique' },
  { slug: 'sante', libelle: 'Santé' },
  { slug: 'droit', libelle: 'Droit' },
  { slug: 'energie-petrole-mines', libelle: 'Énergie et mines' },
  { slug: 'agriculture-environnement', libelle: 'Agriculture' },
  { slug: 'hotellerie-tourisme', libelle: 'Hôtellerie' },
  { slug: 'transport-logistique', libelle: 'Transport' },
  { slug: 'economie', libelle: 'Économie' },
  { slug: 'sciences-technologies', libelle: 'Sciences' },
  { slug: 'lettres-langues', libelle: 'Lettres et langues' },
  { slug: 'communication', libelle: 'Communication' },
  { slug: 'arts-mode', libelle: 'Arts et mode' },
  { slug: 'education', libelle: 'Éducation' },
  { slug: 'sciences-sociales', libelle: 'Sciences sociales' },
  { slug: 'sport', libelle: 'Sport' },
  { slug: 'autre', libelle: 'Autre domaine' },
];

/** Combien de domaines se voient avant « Plus de domaines ». */
export const DOMAINES_VISIBLES = 10;

const domaineDe = (slug: string | null) => DOMAINES_RAPIDES.find((d) => d.slug === slug);

/** Les diplômes qu'on propose d'abord, selon le niveau : on ne propose pas un doctorat devant un CAP. */
export const DIPLOMES_PAR_CYCLE: Readonly<
  Partial<Record<Valeur<'niveau'>, readonly Valeur<'diploma_kind'>[]>>
> = {
  technique: ['cap', 'bt', 'bts', 'certificat', 'autre'],
  superieur: ['bts', 'licence', 'master', 'doctorat', 'certificat', 'autre'],
  autre_formation: ['certificat', 'cap', 'autre'],
};

export const diplomesDuCycle = (cycle: Valeur<'niveau'>): readonly Valeur<'diploma_kind'>[] =>
  DIPLOMES_PAR_CYCLE[cycle] ?? [];

/** Le mot du diplôme dans un intitulé : « BTS », « Licence » ; « Formation » quand c'est un autre diplôme. */
const motDuDiplome = (diplome: Valeur<'diploma_kind'>): string =>
  diplome === 'autre' ? 'Formation' : libelleDiplome[diplome];

/** « BTS Gestion », « Licence Droit » : l'intitulé produit par deux touchers. L'administration le corrige avant d'accepter. */
export function titreDeFormation(diplome: Valeur<'diploma_kind'>, domaine: DomaineRapide): string {
  return `${motDuDiplome(diplome)} ${domaine.libelle}`;
}

/** La filière que produit un toucher sur un domaine, le diplôme en cours étant posé. */
export function formationRapide(
  cycle: Valeur<'niveau'>,
  diplome: Valeur<'diploma_kind'>,
  domaineSlug: string,
): FormationSaisie | null {
  const domaine = domaineDe(domaineSlug);
  if (!domaine) return null;
  return {
    cycle,
    titre: titreDeFormation(diplome, domaine),
    domaine: domaine.slug,
    serie: null,
    diplome,
    rythmes: [],
  };
}

/** « Autre filière… » : un texte court, avec le diplôme en cours s'il y en a un (« CAP Pâtisserie »). */
export function formationLibre(
  cycle: Valeur<'niveau'>,
  diplome: Valeur<'diploma_kind'> | null,
  texte: string,
): FormationSaisie | null {
  const propre = texte.replace(/\s+/g, ' ').trim();
  if (propre === '') return null;
  const titre = diplome ? `${motDuDiplome(diplome)} ${propre}` : propre;
  if (titre.length > 160) return null;
  return { cycle, titre, domaine: null, serie: null, diplome, rythmes: [] };
}

export const formationsDuCycle = (liste: readonly FormationSaisie[], cycle: Valeur<'niveau'>) =>
  liste.filter((f) => f.cycle === cycle);

export const estCochee = (liste: readonly FormationSaisie[], f: FormationSaisie): boolean =>
  liste.some((x) => memeFormation(x, f));

/**
 * Un toucher : la formation s'ajoute, ou se retire si elle y est déjà. Au plafond du cycle, rien ne s'ajoute (la liste
 * rendue est la même) ; retirer reste toujours possible.
 */
export function basculerFormation(
  liste: readonly FormationSaisie[],
  f: FormationSaisie,
): FormationSaisie[] {
  if (estCochee(liste, f)) return liste.filter((x) => !memeFormation(x, f));
  if (formationsDuCycle(liste, f.cycle).length >= FORMATIONS_PAR_CYCLE_MAX) return [...liste];
  return [...liste, f];
}

/** Les séries cochées pour le lycée, dans l'ordre de la liste. */
export const seriesCochees = (liste: readonly FormationSaisie[]): Valeur<'bac_track'>[] =>
  SERIES_RAPIDES.filter((s) => estCochee(liste, formationSerie('lycee', s)));

/** Une série du lycée, touchée ou retouchée. */
export const basculerSerie = (
  liste: readonly FormationSaisie[],
  serie: Valeur<'bac_track'>,
): FormationSaisie[] => basculerFormation(liste, formationSerie('lycee', serie));

/** Ce qui reste quand on décoche un niveau : ses filières partent avec lui. */
export const sansLesFormationsDuCycle = (
  liste: readonly FormationSaisie[],
  cycle: Valeur<'niveau'>,
): FormationSaisie[] => liste.filter((f) => f.cycle !== cycle);

/**
 * Ce qu'on garde à l'envoi : seulement les filières d'un niveau coché qui en annonce. La base **refuse d'accepter** une
 * filière dont le cycle n'est pas dans les niveaux de la fiche : une filière orpheline bloquerait l'administration.
 */
export function formationsDesNiveaux(
  liste: readonly FormationSaisie[],
  niveaux: readonly Valeur<'niveau'>[],
): FormationSaisie[] {
  return liste.filter((f) => niveaux.includes(f.cycle) && CYCLES_AVEC_FORMATIONS.includes(f.cycle));
}

/**
 * Lire ce que le téléphone ou la base rend, **sans jamais planter** : un brouillon d'avant n'a pas la liste, une version
 * plus récente peut avoir des valeurs que celle-ci ne connaît pas. Une ligne illisible est laissée de côté, une valeur
 * inconnue devient « non indiqué » ; on garde au plus vingt filières par cycle, sans doublon.
 */
export function lireFormationsVues(
  valeur: unknown,
  niveaux?: readonly string[],
): FormationSaisie[] {
  if (!Array.isArray(valeur)) return [];
  const lues: FormationSaisie[] = [];
  for (const brut of valeur) {
    if (typeof brut !== 'object' || brut === null) continue;
    const e = brut as Record<string, unknown>;
    const cycle = listes.niveau.find((n) => n === e['cycle']);
    if (!cycle || !CYCLES_AVEC_FORMATIONS.includes(cycle)) continue;
    if (niveaux && !niveaux.includes(cycle)) continue;
    const titre = typeof e['titre'] === 'string' ? e['titre'].replace(/\s+/g, ' ').trim() : '';
    if (titre === '' || titre.length > 160) continue;
    const f: FormationSaisie = {
      cycle,
      titre,
      domaine: typeof e['domaine'] === 'string' && domaineDe(e['domaine']) ? e['domaine'] : null,
      serie: listes.bac_track.find((s) => s === e['serie']) ?? null,
      diplome: listes.diploma_kind.find((d) => d === e['diplome']) ?? null,
      rythmes: [],
    };
    if (estCochee(lues, f)) continue;
    if (formationsDuCycle(lues, cycle).length >= FORMATIONS_PAR_CYCLE_MAX) continue;
    lues.push(f);
  }
  return lues;
}

/** Ce que le relais envoie : la forme que la base garde (`observed_formations`), sans rien d'autre. */
export const versLaBase = (liste: readonly FormationSaisie[]) =>
  liste.map((f) => ({
    cycle: f.cycle,
    titre: f.titre,
    serie: f.serie,
    diplome: f.diplome,
    domaine: f.domaine,
  }));
