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
 * Relit le profil, et pour un relais actif son secteur, les écoles connues des zones ouvertes (campus et relevés
 * pas encore acceptés : de quoi prévenir d'un doublon sans réseau), ses relevés et les écoles qu'on lui confie.
 */
export async function actualiser(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  const etat = await adaptateurs.session.etat();
  if (etat !== 'pret') return etat;
  const { relais } = adaptateurs;
  try {
    const profil = await relais.monProfil();
    await garder('profil', profil);
    if (profil.statut === 'actif') {
      const [lot, ecoles, releves, aCompleter, zones, pays, paie] = await Promise.all([
        relais.monLot(),
        relais.lieuxConnus(),
        relais.mesReleves(),
        relais.mesMissions(),
        // Les zones ouvertes ne servent qu'à être affichées : une panne ici n'arrête rien d'autre.
        relais.zonesOuvertes().catch((erreur: unknown) => {
          if (erreur instanceof ErreurReseau || erreur instanceof ErreurSession) throw erreur;
          void journaliser('synchro', 'zones_illisibles', erreur);
          return null;
        }),
        // La liste nationale ne sert qu'à proposer : une panne ici n'arrête rien d'autre.
        relais.ecolesDuPays().catch((erreur: unknown) => {
          if (erreur instanceof ErreurReseau || erreur instanceof ErreurSession) throw erreur;
          void journaliser('synchro', 'ecoles_du_pays_illisibles', erreur);
          return null;
        }),
        // La paie ne se lit que pour être affichée : une panne ici n'arrête ni l'envoi ni le reste de la lecture.
        relais.maPaie().catch((erreur: unknown) => {
          if (erreur instanceof ErreurReseau || erreur instanceof ErreurSession) throw erreur;
          void journaliser('synchro', 'paie_illisible', erreur);
          return null;
        }),
      ]);
      await Promise.all([
        garder('lot', lot),
        garder('ecoles', ecoles),
        garder('releves', releves),
        garder('aCompleter', aCompleter),
        ...(zones ? [garder('zones', zones)] : []),
        ...(pays ? [garder('ecolesDuPays', pays)] : []),
        ...(paie ? [garder('paie', paie)] : []),
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
