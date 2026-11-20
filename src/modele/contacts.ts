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
import type { ContactASaisir, ContactDirection, ContactEcole } from './ports';
import { dateCourte } from './pointe-noire';
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
export function versPersonneSaisie(contact: Omit<ContactDirection, 'releveId'>): PersonneSaisie {
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

/**
 * Fiche d'école (16/11) : d'où vient un contact, en une ligne. « Relevé par Alice le 10 nov. 2026 · accord WhatsApp le
 * 12 nov. 2026 », ou « Noté par l'administration le … ».
 */
export function provenanceContact(c: ContactEcole): string {
  const origine =
    c.source === 'relais'
      ? `Relevé par ${c.relais ?? 'un relais'} le ${dateCourte(c.releveLe ?? c.recuLe)}`
      : `Noté par l’administration le ${dateCourte(c.recuLe)}`;
  return c.accord && c.accordLe
    ? `${origine} · accord WhatsApp le ${dateCourte(c.accordLe)}`
    : origine;
}

// Ticket 205 (A8, A19) : le numéro de l'école ---------------------------------------------------------------------------

/** Où le numéro de l'école a été lu. */
export type LuSur = 'prospectus' | 'enseigne' | 'site_web' | 'facebook' | 'autre';
export const libelleLuSur: Record<LuSur, string> = {
  prospectus: 'Un prospectus ou un document',
  enseigne: 'L’enseigne',
  site_web: 'Son site web',
  facebook: 'Sa page Facebook',
  autre: 'Ailleurs',
};
const luSurCourt: Record<LuSur, string> = {
  prospectus: 'lu sur un document',
  enseigne: 'lu sur l’enseigne',
  site_web: 'lu sur son site web',
  facebook: 'lu sur sa page Facebook',
  autre: 'lu ailleurs',
};

/** Ce qui part vers la base : le numéro au format de la base, ou sa lecture en mots quand il est illisible en partie. */
export interface NumeroEcole {
  numero: string | null;
  luSur: LuSur;
  illisible: boolean;
  lecture: string | null;
}

/** La saisie du formulaire : rien de choisi d'avance. */
export interface NumeroEcoleSaisi {
  numero: string;
  luSur: LuSur | '';
  illisible: boolean;
  lecture: string;
}

export function lireNumeroEcole(s: NumeroEcoleSaisi): {
  numero: NumeroEcole | null;
  erreur: string | null;
} {
  if (!s.luSur) return { numero: null, erreur: 'Dis où le numéro a été lu.' };
  if (s.illisible) {
    const lecture = s.lecture.trim();
    if (!lecture) return { numero: null, erreur: 'Écris ce qu’on lit du numéro, même incomplet.' };
    if (lecture.length > 300)
      return { numero: null, erreur: 'Ce qu’on lit tient en 300 caractères.' };
    return { numero: { numero: null, luSur: s.luSur, illisible: true, lecture }, erreur: null };
  }
  const numero = normaliserTelephone(s.numero);
  if (!numero)
    return {
      numero: null,
      erreur:
        'Ce numéro ne semble pas complet : coche « Illisible en partie » s’il ne se lit pas bien.',
    };
  return { numero: { numero, luSur: s.luSur, illisible: false, lecture: null }, erreur: null };
}

/** « Numéro de l'école · lu sur un document » */
export function libelleNumeroEcole(c: Pick<ContactEcole, 'luSur'>): string {
  return c.luSur ? `Numéro de l’école · ${luSurCourt[c.luSur]}` : 'Numéro de l’école';
}
