/**
 * Corriger une fiche à la main, dans l'onglet « Écoles » de l'administration (ticket 12) :
 * le formulaire, ses contrôles, et ce qui part vers la base — seulement ce qui a changé.
 * L'administration tutoie le fondateur.
 */
import { z } from 'zod';
import { erreursDe, type Erreurs } from './fiche';
import { listes, niveauxConnus, type Valeur } from './listes';
import { lirePosition } from './coordonnees';
import type { Point } from './geo';
import type { CorrectionEcole, EcoleVue } from './ports';
import { afficherTelephone, normaliserTelephone } from './telephone';

export interface FormulaireEcole {
  nom: string;
  typeEcole: Valeur<'type_ecole'>;
  niveaux: Valeur<'niveau'>[];
  programme: string;
  repere: string;
  numeroEnseigne: string;
}

/** Le formulaire part de ce que la fiche dit aujourd'hui. */
export function formulaireDe(
  ecole: Pick<
    EcoleVue,
    'nom' | 'typeEcole' | 'niveaux' | 'programme' | 'repere' | 'numeroEnseigne'
  >,
): FormulaireEcole {
  return {
    nom: ecole.nom,
    typeEcole: ecole.typeEcole,
    niveaux: ecole.niveaux,
    programme: ecole.programme ?? '',
    repere: ecole.repere ?? '',
    numeroEnseigne: ecole.numeroEnseigne ? afficherTelephone(ecole.numeroEnseigne) : '',
  };
}

const formulaire = z.object({
  nom: z.string().trim().min(1, 'Écris le nom de l’école.').max(200, 'Ce nom est trop long.'),
  typeEcole: z.enum(listes.type_ecole, { message: 'Choisis un type d’école dans la liste.' }),
  niveaux: z.array(z.enum(listes.niveau, { message: 'Choisis les niveaux dans la liste.' })),
  programme: z.string().max(200, 'Cette ligne est trop longue.'),
  repere: z.string().max(300, 'Ce repère est trop long.'),
  numeroEnseigne: z.string().refine((v) => v.trim() === '' || normaliserTelephone(v) !== null, {
    message: 'Ce numéro ne semble pas complet.',
  }),
});

/** Les messages d'erreur, champ par champ. Vide : le formulaire peut partir. */
export function erreursFormulaireEcole(champs: FormulaireEcole): Erreurs {
  return erreursDe(formulaire.safeParse(champs));
}

const sansDoublon = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((valeur) => b.includes(valeur));

/**
 * Ce qui part vers la base : seulement ce qui a changé. Le reste de la fiche (et la date de
 * relevé) n'est pas touché, et une valeur que cette version ne connaît pas encore, laissée
 * telle quelle, n'est jamais réécrite.
 */
export function versCorrection(
  avant: Pick<
    EcoleVue,
    'nom' | 'typeEcole' | 'niveaux' | 'programme' | 'repere' | 'numeroEnseigne'
  >,
  champs: FormulaireEcole,
): CorrectionEcole {
  const correction: CorrectionEcole = {};
  const nom = champs.nom.trim();
  if (nom !== avant.nom) correction.nom = nom;
  if (champs.typeEcole !== avant.typeEcole) correction.typeEcole = champs.typeEcole;
  if (!sansDoublon(champs.niveaux, avant.niveaux))
    correction.niveaux = niveauxConnus(champs.niveaux);
  const programme = champs.programme.trim() || null;
  if (programme !== avant.programme) correction.programme = programme;
  const repere = champs.repere.trim() || null;
  if (repere !== avant.repere) correction.repere = repere;
  const numero = normaliserTelephone(champs.numeroEnseigne);
  if (numero !== avant.numeroEnseigne) correction.numeroEnseigne = numero;
  return correction;
}

// Ticket 203 (A4) : le sigle de l'école et le nom du site ---------------------------------

/** Le sigle (commun à tous les sites de l'école) et le nom de ce site, dans « En bref ». */
export interface IdentiteDuSite {
  sigle: string;
  etiquette: string;
}

export function identiteDe(e: Pick<EcoleVue, 'sigle' | 'etiquette'>): IdentiteDuSite {
  return { sigle: e.sigle ?? '', etiquette: e.etiquette ?? '' };
}

/** Les limites de la base : `institutions.acronym` (20) et `campuses.label` (120). */
export function erreursIdentite(champs: IdentiteDuSite): Erreurs {
  const erreurs: Erreurs = {};
  if (champs.sigle.trim().length > 20) erreurs['sigle'] = 'Le sigle tient en 20 caractères.';
  if (champs.etiquette.trim().length > 120)
    erreurs['etiquette'] = 'Le nom du site tient en 120 caractères.';
  return erreurs;
}

/** Seulement ce qui a changé ; un champ vidé efface la valeur. */
export function versCorrectionIdentite(
  avant: Pick<EcoleVue, 'sigle' | 'etiquette'>,
  champs: IdentiteDuSite,
): Pick<CorrectionEcole, 'sigle' | 'etiquette'> {
  const correction: Pick<CorrectionEcole, 'sigle' | 'etiquette'> = {};
  const sigle = champs.sigle.trim() || null;
  if (sigle !== (avant.sigle ?? null)) correction.sigle = sigle;
  const etiquette = champs.etiquette.trim() || null;
  if (etiquette !== (avant.etiquette ?? null)) correction.etiquette = etiquette;
  return correction;
}

// Le champ « Position » ----------------------------------------------------------------

/**
 * Ce que dit le champ « Position » : rien (facultatif quand on ajoute une école), la position
 * lue, ou une erreur à afficher.
 */
export function lireChampPosition(texte: string): {
  position: Point | null;
  erreur: string | undefined;
} {
  if (!texte.trim()) return { position: null, erreur: undefined };
  const position = lirePosition(texte);
  return position
    ? { position, erreur: undefined }
    : {
        position: null,
        erreur:
          'Position illisible : colle la latitude puis la longitude, par exemple -4.79105, 11.92500.',
      };
}
