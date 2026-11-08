/**
 * La carte d'une école dans une liste, la même partout où une liste d'écoles s'affiche (audit du 05/11/2026, D6 ; canevas
 * « Écoles et fiches NTanova », validé par le fondateur le 08/11/2026, ticket 146) : la page « Écoles », la page d'un lieu, le
 * tiroir de la carte.
 *
 * - le **disque** : la lettre et la couleur du cycle le plus élevé, comme l'épingle ;
 * - le **nom**, puis l'implantation quand l'institution en a plusieurs ;
 * - les **niveaux** : une puce par cycle, puis les niveaux en mots et le type d'école ;
 * - le **lieu** : le plus fin en gras, puis ce qui le contient ;
 * - le **repère**, avec le drapeau de la carte ; « Repère pas encore relevé » seulement pour une école vue sur place,
 *   déclarée ou confirmée dont le repère est vide, jamais avec « Ajoutée par NTanova » (arbitrage du fondateur du 08/11/2026 :
 *   ne pas empiler deux mentions négatives) ;
 * - la **preuve** : une seule, la plus forte, toujours datée quand la date est connue.
 *
 * Ce fichier ne dit QUE ce qu'on écrit : deux rendus le dessinent à l'identique, `ui/LigneEcole.astro` (à la construction)
 * et `ui/dom-pieces.ts` (dans le navigateur, pour les résultats de la recherche). Pur : ni DOM, ni Astro.
 */
import { cycleLePlusEleve, lettresDesCycles } from './carte/cycles';
import type { NomIcone } from './carte/icones';
import { lienEcole, ligneDeLieu } from './geo-divisions';
import {
  libelleNiveau,
  libelleTypeEcole,
  provenanceDe,
  typeInformatif,
  type Provenance,
} from './libelles';
import { listes, type Valeur } from './listes';
import { dateCourte } from './pointe-noire';
import type { EcolePubliee } from './ports';
import { ecrireDistance, type LigneRecherche } from './recherche';

type Niveau = Valeur<'niveau'>;

/** L'icône de chaque preuve : l'écusson de la direction, l'œil du passage, la feuille de la déclaration. */
export const iconeDeProvenance: Record<Provenance, NomIcone> = {
  verifiee: 'bouclier',
  relevee: 'oeil',
  declaree: 'document',
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
  /** Une puce par cycle, dans l'ordre M, P, C, L, T, S. */
  lettres: string[];
  /** « Maternelle et primaire · Privée », « Du primaire au lycée » : les niveaux en mots, puis le type quand il est connu. */
  niveaux: string;
  /** Le lieu le plus fin (en gras), puis ce qui le contient : « Ngoyo » et « Pointe-Noire ». */
  lieu: { fort: string; reste: string };
  repere: string | null;
  /** « Repère pas encore relevé » : une école vue, déclarée ou confirmée, sans repère. */
  repereManquant: boolean;
  preuve: Provenance;
  /** La preuve en mots : « Vue sur place le 2 nov. 2026 », « Confirmée par la direction », … */
  preuveTexte: string;
  /** La date d'une confirmation, à côté de sa pastille ; rien pour les autres preuves (la date est dans leur phrase). */
  preuveDate: string | null;
  /** « À 350 m », quand la liste est classée par distance. */
  distance: string | null;
}

// Les niveaux en mots ------------------------------------------------------------------------------------------------

/** Un niveau dans une énumération (« crèche, primaire et collège ») : le mot court. */
const MOT_COURT: Record<Niveau, string> = {
  creche: 'crèche',
  maternelle: 'maternelle',
  primaire: 'primaire',
  college: 'collège',
  lycee: 'lycée',
  technique: 'technique',
  superieur: 'supérieur',
  autre_formation: 'autre formation',
};
/** « De la maternelle au collège », « Du primaire au lycée » : les deux bouts d'une suite sans trou. */
const DEPUIS: Partial<Record<Niveau, string>> = {
  creche: 'de la crèche',
  maternelle: 'de la maternelle',
  primaire: 'du primaire',
  college: 'du collège',
  lycee: 'du lycée',
  technique: 'du technique',
};
const JUSQUA: Partial<Record<Niveau, string>> = {
  maternelle: 'à la maternelle',
  primaire: 'au primaire',
  college: 'au collège',
  lycee: 'au lycée',
  technique: 'au technique',
  superieur: 'au supérieur',
};
const majuscule = (texte: string) => texte.charAt(0).toLocaleUpperCase('fr') + texte.slice(1);

/**
 * Les niveaux d'une école en mots : un seul s'écrit en entier (« Crèche ou garderie ») ; deux se lient par « et »
 * (« Maternelle et primaire ») ; trois ou plus qui se suivent sans trou disent leurs deux bouts (« De la maternelle au
 * collège ») ; sinon, une énumération (« Crèche, primaire et lycée »).
 */
export function niveauxEnMots(niveaux: readonly Niveau[]): string {
  const tries = listes.niveau.filter((n) => niveaux.includes(n));
  const [premier] = tries;
  const dernier = tries[tries.length - 1];
  if (!premier || !dernier) return '';
  if (tries.length === 1) return libelleNiveau[premier];
  if (tries.length === 2) return majuscule(`${MOT_COURT[premier]} et ${MOT_COURT[dernier]}`);
  const rangs = tries.map((n) => listes.niveau.indexOf(n));
  const sansTrou = rangs.every((r, i) => i === 0 || r === (rangs[i - 1] ?? -2) + 1);
  const depuis = DEPUIS[premier];
  const jusqua = JUSQUA[dernier];
  if (sansTrou && depuis && jusqua) return majuscule(`${depuis} ${jusqua}`);
  const mots = tries.map((n) => MOT_COURT[n]);
  return majuscule(`${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`);
}

// La preuve -------------------------------------------------------------------------------------------------------------

/** La preuve en mots, datée quand la date est connue (la date d'une confirmation va à côté de sa pastille). */
export function preuveDeLaLigne(
  preuve: Provenance,
  date: string | null,
): { texte: string; date: string | null } {
  const jour = date ? dateCourte(date) : null;
  switch (preuve) {
    case 'verifiee':
      return { texte: 'Confirmée par la direction', date: jour };
    case 'relevee':
      return { texte: jour ? `Vue sur place le ${jour}` : 'Vue sur place', date: null };
    case 'declaree':
      return {
        texte: jour ? `Déclarée par l’école le ${jour}` : 'Déclarée par l’école',
        date: null,
      };
    case 'ajoutee':
      return { texte: 'Ajoutée par NTanova, pas encore vue sur place', date: null };
  }
}

/** La date de la preuve d'une école : celle de l'accord, du passage ou de la déclaration. */
export function dateDeLaPreuve(
  e: Pick<EcolePubliee, 'verifieeLe' | 'releveeLe' | 'declareeLe'>,
  preuve: Provenance,
): string | null {
  if (preuve === 'verifiee') return e.verifieeLe;
  if (preuve === 'relevee') return e.releveeLe;
  if (preuve === 'declaree') return e.declareeLe ?? null;
  return null;
}

// La ligne --------------------------------------------------------------------------------------------------------------

function composer(d: {
  url: string;
  nom: string;
  etiquette: string | null;
  niveaux: readonly Niveau[];
  type: Valeur<'type_ecole'> | null | undefined;
  lieu: string;
  repere: string | null;
  preuve: Provenance;
  date: string | null;
  distance: number | null;
}): LigneAffichee {
  const [fort = '', ...reste] = d.lieu.split(' · ');
  const type = d.type && typeInformatif(d.type) ? libelleTypeEcole[d.type] : null;
  const { texte, date } = preuveDeLaLigne(d.preuve, d.date);
  return {
    url: d.url,
    nom: d.nom,
    etiquette: d.etiquette,
    lettre: cycleLePlusEleve(d.niveaux)?.lettre ?? '',
    lettres: [...lettresDesCycles(d.niveaux)],
    niveaux: [niveauxEnMots(d.niveaux), type].filter(Boolean).join(' · '),
    lieu: { fort, reste: reste.join(' · ') },
    repere: d.repere,
    repereManquant: !d.repere && d.preuve !== 'ajoutee',
    preuve: d.preuve,
    preuveTexte: texte,
    preuveDate: date,
    distance: d.distance === null ? null : `À ${ecrireDistance(d.distance)}`,
  };
}

export function ligneDeEcole(e: EcolePubliee, distance: number | null = null): LigneAffichee {
  const preuve = provenanceDe(e);
  return composer({
    url: lienEcole(e),
    nom: e.nom,
    etiquette: e.etiquette,
    niveaux: e.niveaux,
    type: e.typeEcole,
    lieu: ligneDeLieu(e.quartier, e.divisionNoms),
    repere: e.repere,
    preuve,
    date: dateDeLaPreuve(e, preuve),
    distance,
  });
}

/** La même ligne, lue dans le fichier de recherche (`recherche.json`) : ce que la page construite et le navigateur partagent. */
export function ligneDeRecherche(l: LigneRecherche, distance: number | null): LigneAffichee {
  const preuve: Provenance = l.v ? 'verifiee' : l.o ? 'relevee' : l.g ? 'declaree' : 'ajoutee';
  return composer({
    url: l.u,
    nom: l.n,
    etiquette: l.e ?? null,
    niveaux: l.c,
    type: l.k,
    lieu: ligneDeLieu(l.q ?? null, l.d.split(' › ')),
    repere: l.r ?? null,
    preuve,
    date: l.t ?? null,
    distance,
  });
}
