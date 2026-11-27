/**
 * Corriger une fiche à la main, dans l'onglet « Écoles » de l'administration (ticket 12) :
 * le formulaire, ses contrôles, et ce qui part vers la base — seulement ce qui a changé.
 * L'administration tutoie le fondateur.
 */
import { z } from 'zod';
import { emailComplet } from './contacts';
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

// Ticket 203 (A4) : le sigle de l'école et le nom du site ; ticket 205 (A21) : l'année, le site web, la page Facebook --------

/**
 * Le sigle (commun à tous les sites de l'école) et le nom de ce site, dans « En bref » ; ticket 205 (A21) : l'année de création,
 * le site web et la page Facebook de l'école.
 */
export interface IdentiteDuSite {
  sigle: string;
  etiquette: string;
  anneeCreation?: string;
  siteWeb?: string;
  facebook?: string;
}

type AvantIdentite = Pick<
  EcoleVue,
  'sigle' | 'etiquette' | 'anneeCreation' | 'siteWeb' | 'facebook'
>;

export function identiteDe(e: AvantIdentite): IdentiteDuSite {
  return {
    sigle: e.sigle ?? '',
    etiquette: e.etiquette ?? '',
    anneeCreation: e.anneeCreation ? String(e.anneeCreation) : '',
    siteWeb: e.siteWeb ?? '',
    facebook: e.facebook ?? '',
  };
}

const LIEN = /^https:\/\/[^\s/$.?#][^\s]{2,200}$/;
const FACEBOOK = /^https:\/\/([a-z]+\.)?facebook\.com\/[^\s]{1,200}$/;

/** Les limites de la base : `institutions.acronym` (20), `campuses.label` (120), l'année, les liens en https. */
export function erreursIdentite(
  champs: IdentiteDuSite,
  aujourdHui = new Date().toISOString().slice(0, 10),
): Erreurs {
  const erreurs: Erreurs = {};
  if (champs.sigle.trim().length > 20) erreurs['sigle'] = 'Le sigle tient en 20 caractères.';
  if (champs.etiquette.trim().length > 120)
    erreurs['etiquette'] = 'Le nom du site tient en 120 caractères.';
  const annee = (champs.anneeCreation ?? '').trim();
  const cetteAnnee = Number(aujourdHui.slice(0, 4));
  if (annee && !(/^\d{4}$/.test(annee) && Number(annee) >= 1800 && Number(annee) <= cetteAnnee))
    erreurs['anneeCreation'] = `L’année de création est passée : 1800 à ${cetteAnnee}.`;
  const site = (champs.siteWeb ?? '').trim();
  if (site && !LIEN.test(site))
    erreurs['siteWeb'] = 'Un lien commence par https:// et ne contient aucune espace.';
  const facebook = (champs.facebook ?? '').trim();
  if (facebook && !FACEBOOK.test(facebook))
    erreurs['facebook'] = 'Colle le lien de la page : https://www.facebook.com/…';
  return erreurs;
}

type CorrectionIdentite = Pick<
  CorrectionEcole,
  'sigle' | 'etiquette' | 'anneeCreation' | 'siteWeb' | 'facebook'
>;

/** Seulement ce qui a changé ; un champ vidé efface la valeur. */
export function versCorrectionIdentite(
  avant: AvantIdentite,
  champs: IdentiteDuSite,
): CorrectionIdentite {
  const correction: CorrectionIdentite = {};
  const sigle = champs.sigle.trim() || null;
  if (sigle !== (avant.sigle ?? null)) correction.sigle = sigle;
  const etiquette = champs.etiquette.trim() || null;
  if (etiquette !== (avant.etiquette ?? null)) correction.etiquette = etiquette;
  if (champs.anneeCreation !== undefined) {
    const brute = champs.anneeCreation.trim();
    const annee = brute ? Number(brute) : null;
    if (annee !== (avant.anneeCreation ?? null)) correction.anneeCreation = annee;
  }
  if (champs.siteWeb !== undefined) {
    const site = champs.siteWeb.trim() || null;
    if (site !== (avant.siteWeb ?? null)) correction.siteWeb = site;
  }
  if (champs.facebook !== undefined) {
    const facebook = champs.facebook.trim() || null;
    if (facebook !== (avant.facebook ?? null)) correction.facebook = facebook;
  }
  return correction;
}

// Ticket 236 (27/11) : les valeurs relues avant d'accepter ---------------------------------------------------------------

/**
 * Ce qu'on corrige avant d'accepter : une nouvelle école, un nouveau site d'une école connue, ou une fiche qu'on complète.
 * Un nouveau site ne change ni le nom ni le type de l'école ; le sigle et l'année ne remplissent que ce qu'elle n'a pas.
 */
export type ModeDeRelecture = 'nouvelle' | 'nouveau_site' | 'completer';

/** L'e-mail lu sur l'enseigne est privé : il devient un contact du site, jamais une donnée publique. */
export interface ValeursRelues extends FormulaireEcole {
  sigle: string;
  etiquette: string;
  anneeCreation: string;
  email: string;
}

export type AvantRelecture = Pick<
  EcoleVue,
  'nom' | 'typeEcole' | 'niveaux' | 'programme' | 'repere' | 'numeroEnseigne'
> & { sigle?: string | null | undefined };

/** Le formulaire part des valeurs retenues : celles du relevé, puis les corrections déjà préparées. */
export function formulaireDeRelecture(
  avant: AvantRelecture,
  correction: CorrectionEcole,
): ValeursRelues {
  const retenu = { ...avant, ...correction };
  return {
    ...formulaireDe(retenu),
    sigle: retenu.sigle ?? '',
    etiquette: correction.etiquette ?? '',
    anneeCreation: correction.anneeCreation ? String(correction.anneeCreation) : '',
    email: correction.email ?? '',
  };
}

export function erreursRelecture(champs: ValeursRelues, aujourdHui?: string): Erreurs {
  const email = champs.email.trim();
  return {
    ...erreursFormulaireEcole(champs),
    ...erreursIdentite(champs, aujourdHui),
    ...(email && !emailComplet(email)
      ? { email: 'Cette adresse e-mail ne semble pas complète.' }
      : {}),
  };
}

/** Ce qui diffère du relevé : seul cela part vers la base. Le sigle vidé efface celui que le relais a lu. */
export function versCorrectionDeRelecture(
  avant: AvantRelecture,
  champs: ValeursRelues,
): CorrectionEcole {
  const correction: CorrectionEcole = versCorrection(avant, champs);
  const sigle = champs.sigle.trim() || null;
  if (sigle !== (avant.sigle ?? null)) correction.sigle = sigle;
  const etiquette = champs.etiquette.trim();
  if (etiquette) correction.etiquette = etiquette;
  const annee = champs.anneeCreation.trim();
  if (annee) correction.anneeCreation = Number(annee);
  const email = champs.email.trim();
  if (email) correction.email = email;
  return correction;
}

/**
 * Les corrections qui partent avec la décision, selon son mode. Le nom du site voyage à part (`etiquette` de la décision) ;
 * le sigle et l'année d'une école déjà connue ne remplacent jamais les siens.
 */
export function correctionsDuMode(
  correction: CorrectionEcole,
  mode: ModeDeRelecture,
  ecole: { sigle?: string | null | undefined; anneeCreation?: number | null | undefined } | null,
): CorrectionEcole {
  const c: CorrectionEcole = { ...correction };
  delete c.etiquette;
  if (mode === 'nouvelle') return c;
  if (mode === 'nouveau_site') {
    delete c.nom;
    delete c.typeEcole;
  }
  if (ecole?.sigle?.trim()) delete c.sigle;
  if (ecole?.anneeCreation) delete c.anneeCreation;
  return c;
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
