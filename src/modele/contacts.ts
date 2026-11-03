/**
 * Les personnes à contacter pour une fiche (ticket #96) : le relais en rencontre plusieurs (la direction, un secrétariat,
 * un propriétaire, un enseignant), et l'administration en ajoute, en corrige, en efface une par une. Les numéros sont
 * privés, jamais publiés, jamais relus par le relais ; chaque personne a son propre accord.
 *
 * Les mêmes règles servent au relais (la personne en plus) et à l'administration.
 */
import type { Erreurs } from './fiche';
import { libelleFonction } from './libelles';
import type { Valeur } from './listes';
import type { ContactASaisir, ContactDirection } from './ports';
import { afficherTelephone, normaliserTelephone } from './telephone';

/** Trois personnes au plus par fiche : la base le garde aussi. */
export const PERSONNES_MAX = 3;

export function peutAjouterUnePersonne(dejaNotees: number): boolean {
  return dejaNotees < PERSONNES_MAX;
}

/** Ce qu'on tape pour une personne, avant de l'envoyer. */
export interface PersonneSaisie {
  fonction: Valeur<'fonction_direction'> | null;
  /** « Autre : … » : de quoi il s'agit (propriétaire, enseignant…). Sans objet pour une autre fonction. */
  precision: string;
  nom: string;
  whatsapp: string;
  accord: boolean;
  note: string;
}

export function personneVide(): PersonneSaisie {
  return { fonction: null, precision: '', nom: '', whatsapp: '', accord: false, note: '' };
}

const vide = (texte: string) => (texte.trim() === '' ? null : texte.trim());

/** Les messages d'erreur, champ par champ. Vide : la personne peut être enregistrée. */
export function erreursPersonne(personne: PersonneSaisie): Erreurs {
  const erreurs: Erreurs = {};
  if (personne.fonction === null) erreurs['fonction'] = 'Choisissez sa fonction.';
  if (personne.nom.length > 120) erreurs['nom'] = 'Ce nom est trop long.';
  if (personne.fonction === 'autre' && personne.precision.trim().length > 80) {
    erreurs['precision'] = 'Cette précision est trop longue.';
  }
  if (personne.note.length > 1000) erreurs['note'] = 'Ce texte est trop long.';
  if (personne.whatsapp.trim() !== '') {
    if (!personne.accord) {
      erreurs['whatsapp'] = 'Sans son accord, ne notez pas son numéro.';
    } else if (normaliserTelephone(personne.whatsapp) === null) {
      erreurs['whatsapp'] = 'Ce numéro ne semble pas complet.';
    }
  }
  return erreurs;
}

/** Ce qui part vers la base. Le numéro ne part jamais sans l'accord, même s'il est resté dans le champ. */
export function versContactASaisir(personne: PersonneSaisie): ContactASaisir {
  return {
    fonction: personne.fonction,
    precisionFonction: personne.fonction === 'autre' ? vide(personne.precision) : null,
    nom: vide(personne.nom),
    whatsapp: personne.accord ? normaliserTelephone(personne.whatsapp) : null,
    accord: personne.accord,
    note: vide(personne.note),
  };
}

/** La personne telle que l'administration la corrige : ce que la base a gardé, dans les champs de la saisie. */
export function versPersonneSaisie(contact: ContactDirection): PersonneSaisie {
  return {
    fonction: contact.fonction,
    precision: contact.precisionFonction ?? '',
    nom: contact.nom ?? '',
    whatsapp: contact.whatsapp ? afficherTelephone(contact.whatsapp) : '',
    accord: contact.accord,
    note: contact.note ?? '',
  };
}

/** « Directeur ou directrice · Mme Ngoma », « Autre : propriétaire ». */
export function libellePersonne(
  contact: Pick<ContactDirection, 'fonction' | 'precisionFonction' | 'nom'>,
): string {
  const fonction = contact.fonction
    ? contact.fonction === 'autre' && contact.precisionFonction
      ? `Autre : ${contact.precisionFonction}`
      : libelleFonction[contact.fonction]
    : 'Personne à contacter';
  return contact.nom ? `${fonction} · ${contact.nom}` : fonction;
}

/**
 * La fiche à laquelle une personne s'ajoute : celle qui porte déjà les autres (l'original d'une correction, quand les
 * personnes sont arrivées avec lui), sinon la fiche qu'on regarde.
 */
export function ficheQuiPorteLesPersonnes(
  personnes: readonly Pick<ContactDirection, 'releveId'>[],
  fiche: string,
): string {
  return personnes[0]?.releveId ?? fiche;
}
