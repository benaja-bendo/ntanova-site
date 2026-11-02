/**
 * Relire le serveur et envoyer ce qui attend. Lancé à l'ouverture, quand le
 * réseau revient, toutes les trois minutes tant que l'application est ouverte,
 * après chaque fiche enregistrée et par le bouton « Envoyer maintenant ».
 */
import { ErreurReseau, ErreurSession } from '../../modele/ports';
import type { Adaptateurs } from '../../infra/index';
import { garder } from './base-locale';
import { envoyerTout, type ResultatEnvoi } from './file-envoi';
import { journaliser } from './journal';

/**
 * Relit le profil, et pour un relais actif son lot, les écoles connues autour de lui (campus et relevés pas encore
 * acceptés : de quoi prévenir d'un doublon sans réseau), ses relevés et les écoles qu'on lui confie.
 */
export async function actualiser(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  const etat = await adaptateurs.session.etat();
  if (etat !== 'pret') return etat;
  const { relais } = adaptateurs;
  try {
    const profil = await relais.monProfil();
    await garder('profil', profil);
    if (profil.statut === 'actif') {
      const [lot, ecoles, releves, aCompleter] = await Promise.all([
        relais.monLot(),
        relais.lieuxConnus(),
        relais.mesReleves(),
        relais.mesMissions(),
      ]);
      await Promise.all([
        garder('lot', lot),
        garder('ecoles', ecoles),
        garder('releves', releves),
        garder('aCompleter', aCompleter),
      ]);
    }
    return 'pret';
  } catch (erreur) {
    if (erreur instanceof ErreurReseau) return 'hors_ligne';
    if (erreur instanceof ErreurSession) return 'reconnecter';
    await journaliser('synchro', 'lecture_refusee', erreur);
    return 'erreur';
  }
}

/** Envoyer d'abord (les fiches du jour), puis relire (leurs états). */
export async function synchroniser(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  const envoi = await envoyerTout(adaptateurs);
  if (envoi === 'hors_ligne' || envoi === 'reconnecter') return envoi;
  const lecture = await actualiser(adaptateurs);
  return envoi === 'erreur' ? 'erreur' : lecture;
}
