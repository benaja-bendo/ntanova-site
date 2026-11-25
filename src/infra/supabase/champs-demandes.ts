/**
 * Le nom de chaque champ d'un message dans la base : la seule table de traduction, pour la lecture de l'administration et pour
 * l'envoi public. Dans son propre fichier, sans client Supabase : le script public n'emporte qu'elle.
 */
import type { NomDeChamp } from '../../modele/demandes';

export const CHAMP: Record<NomDeChamp, string> = {
  origine: 'origin',
  sujet: 'subject',
  message: 'message',
  nomEcole: 'school_name',
  ville: 'town',
  repere: 'landmark',
  autreChose: 'other_details',
  niveaux: 'levels',
  deLEcole: 'is_from_school',
  fiche: 'campus_id',
  information: 'topic',
  correction: 'correction',
  source: 'knowledge',
  aRetirer: 'removal',
  precision: 'removal_details',
  reponse: 'reply',
  coordonnee: 'contact',
  nomPersonne: 'person_name',
};
