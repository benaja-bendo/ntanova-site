/**
 * Ce que la fiche publique d'une école écrit (canevas « Écoles et fiches NTanova », validé le 08/11/2026, ticket 148). Pur : ni
 * DOM, ni Astro.
 */
import type { NomIcone } from './carte/icones';
import { libelleDiplome, libelleRythme } from './libelles';
import { listes, type Valeur } from './listes';
import { dateCourte } from './pointe-noire';
import type { EcolePubliee, FormationPublique } from './ports';

type Niveau = Valeur<'niveau'>;

/** Le champ historique mêle programme et langues : seuls les noms de langue seuls sont identifiés. */
export function libelleProgramme(programme: string | null): string {
  return /^(français|anglais|lingala|kituba|munukutuba|portugais)$/i.test(programme?.trim() ?? '')
    ? 'Langue d’enseignement'
    : 'Programme et langues';
}

// Les preuves ----------------------------------------------------------------------------------------------------------

export interface PreuveDeFiche {
  /** `direction` : la pastille pleine ; `terrain` et `ecole` : le contour ; `vide` : les pointillés. */
  genre: 'direction' | 'terrain' | 'ecole' | 'vide';
  icone: NomIcone | null;
  texte: string;
}

/**
 * Les preuves d'une fiche, chacune sur sa pastille et jamais fusionnées (décision du 03/11/2026). « Pas encore confirmée »
 * s'ajoute à une école vue ou déclarée ; jamais à « Ajoutée par NTanova », pour ne pas empiler deux mentions négatives
 * (arbitrage du 08/11/2026).
 */
export function preuvesDeLaFiche(
  e: Pick<
    EcolePubliee,
    'etat' | 'verifieeLe' | 'origine' | 'declareeLe' | 'releveeLe' | 'situeeLe'
  >,
): PreuveDeFiche[] {
  const date = (jour: string | null | undefined) => (jour ? ` · ${dateCourte(jour)}` : '');
  const confirmee = e.etat === 'verifiee';
  const declaree = e.origine === 'school';
  const preuves: PreuveDeFiche[] = [];
  if (confirmee)
    preuves.push({
      genre: 'direction',
      icone: 'bouclier',
      texte: `Confirmée par la direction${date(e.verifieeLe)}`,
    });
  if (declaree)
    preuves.push({
      genre: 'ecole',
      icone: 'document',
      texte: `Déclarée par l’école${date(e.declareeLe)}`,
    });
  if (e.releveeLe)
    preuves.push({ genre: 'terrain', icone: 'oeil', texte: `Vue sur place${date(e.releveeLe)}` });
  if (!e.releveeLe && !declaree)
    preuves.push({ genre: 'vide', icone: null, texte: `Ajoutée par NTanova${date(e.situeeLe)}` });
  else if (!confirmee)
    preuves.push({
      genre: 'vide',
      icone: 'bouclierVide',
      texte: 'Pas encore confirmée par la direction',
    });
  return preuves;
}

// Les mots qui dépendent du nom -----------------------------------------------------------------------------------------

/** Le premier mot d'un nom d'établissement, quand il est masculin (« Institut Horizon », « Centre de formation »…). */
const NOM_MASCULIN =
  /^[^\p{L}]*(institut|centre|complexe|groupe|lyc[ée]e|coll[èe]ge|cours|[ée]tablissement|jardin|p[ôo]le|s[ée]minaire|cfa|cetp|ctp)(?=[^\p{L}]|$)/iu;

/** « Où la trouver » pour une école, « Où le trouver » pour un institut. */
export const titreOuTrouver = (nom: string): string =>
  NOM_MASCULIN.test(nom) ? 'Où le trouver' : 'Où la trouver';

/** « Vous dirigez cette école ? » pour une école, « cet établissement » pour le reste. */
export const invitationDirection = (nom: string): string =>
  `Vous dirigez ${NOM_MASCULIN.test(nom) ? 'cet établissement' : 'cette école'}\u00a0?`;

// Les formations --------------------------------------------------------------------------------------------------------

const CYCLES_A_FILIERES: readonly Niveau[] = ['technique', 'superieur', 'autre_formation'];

/** Ce que sont les formations d'une école : des filières, des séries (un lycée seul), ou des formations. */
function natureDesFormations(cycles: readonly Niveau[]): 'filières' | 'séries' | 'formations' {
  if (cycles.some((c) => CYCLES_A_FILIERES.includes(c))) return 'filières';
  return cycles.length > 0 && cycles.every((c) => c === 'lycee') ? 'séries' : 'formations';
}

/** « Filières et frais », « Séries », « Formations et frais » : le titre du bloc. */
export function titreDesFormations(cycles: readonly Niveau[], avecFrais: boolean): string {
  const nature = natureDesFormations(cycles);
  const titre = nature.charAt(0).toLocaleUpperCase('fr') + nature.slice(1);
  return avecFrais ? `${titre} et frais` : titre;
}

/** « Filière », « Série », « Formation » : l'en-tête de la colonne. */
export function nomDUneFormation(cycles: readonly Niveau[]): string {
  const nature = natureDesFormations(cycles).slice(0, -1);
  return nature.charAt(0).toLocaleUpperCase('fr') + nature.slice(1);
}

/** « 4 filières », « 1 série ». */
export function compteDesFormations(nombre: number, cycles: readonly Niveau[]): string {
  const nature = natureDesFormations(cycles);
  return `${nombre} ${nombre > 1 ? nature : nature.slice(0, -1)}`;
}

/** « Cours du jour et du soir » : les rythmes d'une école, ou rien quand aucun n'est noté. */
export function rythmesEnMots(
  formations: readonly Pick<FormationPublique, 'rythmes'>[],
): string | null {
  const presents = listes.study_rhythm.filter((r) => formations.some((f) => f.rythmes.includes(r)));
  const [premier] = presents;
  if (!premier) return null;
  if (presents.length === 1) return libelleRythme[premier];
  const mots = presents.map((r) => libelleRythme[r].replace(/^Cours /, ''));
  return `Cours ${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

/** « BTS, Licence » : les diplômes préparés, sans répétition, ou rien. */
export function diplomesEnMots(
  formations: readonly Pick<FormationPublique, 'diplome'>[],
): string | null {
  const presents = listes.diploma_kind.filter((d) => formations.some((f) => f.diplome === d));
  return presents.length > 0 ? presents.map((d) => libelleDiplome[d]).join(', ') : null;
}

/** En dessous, chercher dans la liste à l'œil va plus vite que filtrer. */
export const FORMATIONS_POUR_FILTRER = 4;
/** Autant de filtres que `FormationsEcole.astro` a de règles. */
export const FILTRES_MAX = 5;

export interface FiltreDeFormations {
  libelle: string;
  /** Les rangs, dans la liste reçue, des formations qu'il garde. */
  membres: ReadonlySet<number>;
}

/**
 * Les pastilles « BTS », « Licence », « Cours du soir » d'une liste de filières. Un filtre qui garderait tout ne sert à rien,
 * deux filtres qui gardent les mêmes lignes non plus.
 */
export function filtresDesFormations(
  formations: readonly Pick<FormationPublique, 'diplome' | 'rythmes'>[],
): FiltreDeFormations[] {
  if (formations.length < FORMATIONS_POUR_FILTRER) return [];
  const rangs = (garde: (f: (typeof formations)[number]) => boolean) =>
    new Set(formations.flatMap((f, i) => (garde(f) ? [i] : [])));
  const candidats: FiltreDeFormations[] = [
    ...listes.diploma_kind.map((d) => ({
      libelle: libelleDiplome[d],
      membres: rangs((f) => f.diplome === d),
    })),
    ...listes.study_rhythm.map((r) => ({
      libelle: libelleRythme[r],
      membres: rangs((f) => f.rythmes.includes(r)),
    })),
  ].filter((c) => c.membres.size > 0 && c.membres.size < formations.length);
  const empreintes = new Set<string>();
  return candidats
    .filter((c) => {
      const empreinte = [...c.membres].join(',');
      if (empreintes.has(empreinte)) return false;
      empreintes.add(empreinte);
      return true;
    })
    .slice(0, FILTRES_MAX);
}

/** Le message prêt du bouton WhatsApp d'une filière (arbitrage du 08/11/2026). */
export const messageFiliere = (titre: string): string =>
  `Bonjour, je vous contacte depuis NTanova au sujet de la filière ${titre} : `;

/** Le message prêt du bouton WhatsApp de la fiche. */
export const messageEcole = (nom: string): string =>
  `Bonjour, je vous contacte depuis NTanova au sujet de ${nom} : `;
