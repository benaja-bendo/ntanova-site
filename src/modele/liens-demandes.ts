/**
 * Les portes vers Contact et l'annuaire (refonte publique, lot 3C). Un seul réglage de construction, `PUBLIC_FORMULAIRES`,
 * fermé par défaut, décide pour tout le site : fermé, chaque porte reste le lien WhatsApp d'aujourd'hui ; ouvert, elle mène au
 * formulaire. L'ouverture est un geste de la recette.
 *
 * Une adresse ne porte que des codes d'une liste fermée et le numéro public d'une fiche : jamais un nom, un numéro de
 * téléphone, une recherche ou un texte écrit.
 */
import type { Origine } from './envoi-public';
import type { Valeur } from './listes';

export const PAGE_CONTACT = '/contact/';
export const PAGE_CONTRIBUER = '/contribuer/';
export const PAGES_DES_FORMULAIRES = [PAGE_CONTACT, PAGE_CONTRIBUER] as const;

export interface Arrivee {
  vers: 'contact' | 'manque' | 'erreur' | 'retrait' | 'annuaire';
  depuis: Origine;
  /** Contact seulement. */
  sujet?: Valeur<'public_request_subject'>;
  /** Le numéro public de la fiche d'où l'on vient. */
  ecole?: string;
}

export function adresseDArrivee(a: Arrivee): string {
  const p = new URLSearchParams();
  if (a.vers !== 'contact' && a.vers !== 'annuaire') p.set('type', a.vers);
  if (a.vers === 'contact' && a.sujet) p.set('sujet', a.sujet);
  if (a.vers !== 'contact' && a.ecole) p.set('ecole', a.ecole);
  p.set('depuis', a.depuis);
  return `${a.vers === 'contact' ? PAGE_CONTACT : PAGE_CONTRIBUER}?${p}`;
}

export interface PorteVersNtanova {
  href: string;
  parFormulaire: boolean;
}

/** La porte selon le réglage. Sans numéro WhatsApp configuré et formulaires fermés : aucune porte, plutôt qu'un lien mort. */
export function porte(
  ouverts: boolean,
  arrivee: Arrivee,
  whatsapp: string | null,
): PorteVersNtanova | null {
  if (ouverts) return { href: adresseDArrivee(arrivee), parFormulaire: true };
  return whatsapp ? { href: whatsapp, parFormulaire: false } : null;
}

/** L'adresse du fichier qui dit qu'une fiche est publiée, et sous quel nom : construit avec le site, pour ces fiches seules. */
export const cheminFicheConcernee = (numero: string): string => `/contribuer/fiche/${numero}.json`;
