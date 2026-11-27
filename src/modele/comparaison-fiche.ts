/**
 * « Compléter sa fiche » (ticket 236, 27/11) : ce que l'acceptation changerait à une école déjà créée, valeur par valeur,
 * et ce que l'administration garde. Rien d'existant n'est remplacé sans un choix : une valeur déjà là reste telle quelle
 * tant qu'on ne choisit pas « Remplacer » ; un vide se remplit, sauf choix contraire. Les mêmes règles que la base
 * (`accept_reviewed_submission`, mode `update_campus`, clé `keep`). Pur : ni DOM, ni réseau.
 */
import { ecrirePosition } from './coordonnees';
import { distanceEnMots } from './deja-sur-ntanova';
import { distanceMetres, type Point } from './geo';
import { libelleNiveau, libelleTypeEcole } from './libelles';
import { listes, type Valeur } from './listes';
import type { EcoleVue } from './ports';
import { afficherTelephone } from './telephone';

export type ChampCompare =
  | 'nom'
  | 'sigle'
  | 'typeEcole'
  | 'niveaux'
  | 'programme'
  | 'repere'
  | 'numeroEnseigne'
  | 'position'
  | 'etiquette'
  | 'anneeCreation';

/** Les valeurs que la base sait garder (`keep`) ; le nom du site et l'année ne partent que s'ils sont pris. */
export const CLES_A_GARDER = {
  nom: 'sign_name',
  sigle: 'acronym',
  typeEcole: 'school_kind',
  niveaux: 'levels',
  programme: 'curriculum_note',
  repere: 'landmark',
  numeroEnseigne: 'sign_phone',
  position: 'position',
} as const;
export type ChampAGarder = keyof typeof CLES_A_GARDER;

export interface Difference {
  champ: ChampCompare;
  libelle: string;
  /** Ce que la fiche dit aujourd'hui ; nul : rien. */
  actuel: string | null;
  /** Ce qu'elle dirait avec le relevé (corrigé au besoin). */
  propose: string;
  /** Vrai : rien n'est remplacé, la valeur remplit un vide. */
  ajout: boolean;
}

export type ChoixDeFiche = Partial<Record<ChampCompare, 'garder' | 'prendre'>>;

/** Les valeurs retenues du relevé, après les corrections de l'administration. */
export interface ValeursProposees {
  nom: string;
  sigle: string | null;
  typeEcole: Valeur<'type_ecole'>;
  niveaux: Valeur<'niveau'>[];
  programme: string | null;
  repere: string | null;
  numeroEnseigne: string | null;
  position: Point | null;
  etiquette: string | null;
  anneeCreation: number | null;
}

export type EcoleComparee = Pick<
  EcoleVue,
  | 'nom'
  | 'sigle'
  | 'typeEcole'
  | 'niveaux'
  | 'programme'
  | 'repere'
  | 'numeroEnseigne'
  | 'position'
  | 'etiquette'
  | 'anneeCreation'
  | 'verifieeLe'
>;

const texte = (v: string | null | undefined) => v?.trim() || null;
const niveauxEnMots = (n: readonly Valeur<'niveau'>[]) =>
  n.length === 0 ? 'Aucun niveau' : n.map((x) => libelleNiveau[x]).join(', ');
const ordonnes = (n: readonly Valeur<'niveau'>[]) => listes.niveau.filter((x) => n.includes(x));

/**
 * Les niveaux après l'acceptation : ceux de la fiche et ceux du relevé ; une correction de relais dit la vérité, un niveau
 * qu'elle ne coche plus disparaît (sauf s'il porte des formations, que la base garde).
 */
export function niveauxApres(
  actuels: readonly Valeur<'niveau'>[],
  releves: readonly Valeur<'niveau'>[],
  correction: boolean,
): Valeur<'niveau'>[] {
  if (releves.length === 0) return ordonnes(actuels);
  return ordonnes(correction ? releves : [...new Set([...actuels, ...releves])]);
}

export function differencesAvecLaFiche(
  ecole: EcoleComparee,
  p: ValeursProposees,
  options: { sitesDeLEcole: number; correction: boolean },
): Difference[] {
  const d: Difference[] = [];
  const ajouter = (champ: ChampCompare, libelle: string, actuel: string | null, propose: string) =>
    d.push({ champ, libelle, actuel, propose, ajout: actuel === null });
  const remplir = () => {
    // Le sigle et l'année de l'école, le nom du site : ils ne remplissent qu'un vide, jamais ils ne remplacent.
    const sigle = texte(p.sigle);
    if (sigle && !texte(ecole.sigle)) ajouter('sigle', 'Sigle', null, sigle);
    if (p.anneeCreation !== null && !ecole.anneeCreation)
      ajouter('anneeCreation', 'Année de création', null, String(p.anneeCreation));
  };
  // La base ne modifie plus la fiche d'une école confirmée par la direction : seuls les vides de l'école se remplissent.
  if (ecole.verifieeLe) {
    remplir();
    return d;
  }
  // Le nom de l'école ne suit le relevé que si elle n'a qu'un site (sinon il vaut pour tous).
  const nom = p.nom.trim();
  if (options.sitesDeLEcole <= 1 && nom && nom !== ecole.nom.trim())
    ajouter('nom', 'Nom de l’école', ecole.nom, nom);
  remplir();
  const etiquette = texte(p.etiquette);
  if (etiquette && !texte(ecole.etiquette)) ajouter('etiquette', 'Nom de ce site', null, etiquette);
  if (p.typeEcole !== 'non_indique' && p.typeEcole !== ecole.typeEcole)
    ajouter(
      'typeEcole',
      'Type',
      ecole.typeEcole === 'non_indique' ? null : libelleTypeEcole[ecole.typeEcole],
      libelleTypeEcole[p.typeEcole],
    );
  const apres = niveauxApres(ecole.niveaux, p.niveaux, options.correction);
  const memes =
    apres.length === ecole.niveaux.length && apres.every((n) => ecole.niveaux.includes(n));
  if (!memes)
    d.push({
      champ: 'niveaux',
      libelle: 'Niveaux',
      actuel: niveauxEnMots(ecole.niveaux),
      propose: niveauxEnMots(apres),
      ajout: ecole.niveaux.every((n) => apres.includes(n)),
    });
  const textes: [ChampCompare, string, string | null, string | null][] = [
    ['programme', 'Programme et langues', texte(ecole.programme), texte(p.programme)],
    ['repere', 'Repère', texte(ecole.repere), texte(p.repere)],
  ];
  for (const [champ, libelle, actuel, propose] of textes)
    if (propose !== null && propose !== actuel) ajouter(champ, libelle, actuel, propose);
  if (p.numeroEnseigne && p.numeroEnseigne !== ecole.numeroEnseigne)
    ajouter(
      'numeroEnseigne',
      'Numéro sur l’enseigne',
      ecole.numeroEnseigne ? afficherTelephone(ecole.numeroEnseigne) : null,
      afficherTelephone(p.numeroEnseigne),
    );
  if (p.position) {
    const ecart = ecole.position ? distanceMetres(ecole.position, p.position) : null;
    // À moins d'un mètre, c'est la même position.
    if (ecart === null || ecart >= 1)
      ajouter(
        'position',
        'Position',
        ecole.position ? ecrirePosition(ecole.position) : null,
        ecart === null
          ? ecrirePosition(p.position)
          : `${ecrirePosition(p.position)} · ${distanceEnMots(ecart)} de l’actuelle`,
      );
  }
  return d;
}

/** La valeur du relevé sera-t-elle écrite ? Sans choix : un vide se remplit, une valeur déjà là reste. */
export const seraPris = (d: Difference, choix: ChoixDeFiche): boolean =>
  (choix[d.champ] ?? (d.ajout ? 'prendre' : 'garder')) === 'prendre';

/** Ce que la base doit garder tel quel : chaque différence non prise, dans les mots de la base. */
export function aGarder(differences: readonly Difference[], choix: ChoixDeFiche): ChampAGarder[] {
  return differences
    .filter((d) => !seraPris(d, choix) && d.champ in CLES_A_GARDER)
    .map((d) => d.champ as ChampAGarder);
}

/** Les valeurs déjà là pour lesquelles rien n'est encore choisi : elles seront gardées, et l'écran le dit. */
export const sansChoix = (differences: readonly Difference[], choix: ChoixDeFiche): number =>
  differences.filter((d) => !d.ajout && choix[d.champ] === undefined).length;
