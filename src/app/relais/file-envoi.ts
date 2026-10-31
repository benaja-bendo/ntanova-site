/**
 * La file d'envoi. Une fiche part en trois temps : le relevé, puis la photo,
 * puis le contact. Chaque envoi peut être rejoué : la base répond « déjà reçu ».
 * La photo et le contact sont effacés du téléphone dès que la base a répondu.
 */
import { toutEnvoye, versContact, versReleve, type FicheLocale } from '../../modele/fiche';
import { ErreurReseau, ErreurSession, type EtatSession } from '../../modele/ports';
import type { Adaptateurs } from '../../infra/index';
import { base, garder } from './base-locale';
import { journaliser } from './journal';

export type ResultatEnvoi = EtatSession | 'erreur';

let enCours: Promise<ResultatEnvoi> | null = null;

/** Envoie tout ce qui attend. Un seul envoi à la fois : un second appel attend le premier. */
export function envoyerTout(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  enCours ??= envoyer(adaptateurs).finally(() => (enCours = null));
  return enCours;
}

async function envoyerUneFiche(adaptateurs: Adaptateurs, fiche: FicheLocale): Promise<void> {
  const { relais } = adaptateurs;
  const envoyes = { ...fiche.envoyes };

  if (!envoyes.releve) {
    await relais.envoyerReleve(versReleve(fiche));
    envoyes.releve = true;
    await base.fiches.update(fiche.id, { envoyes: { ...envoyes } });
  }

  if (!envoyes.photo) {
    if (fiche.photo) await relais.envoyerPhoto(fiche.id, fiche.photo);
    envoyes.photo = true;
    await base.fiches.update(fiche.id, { envoyes: { ...envoyes }, photo: null });
  }

  if (!envoyes.contact) {
    const contact = versContact(fiche);
    if (contact) await relais.envoyerContact(contact);
    envoyes.contact = true;
    await base.fiches.update(fiche.id, { envoyes: { ...envoyes }, contact: null });
  }

  if (toutEnvoye({ ...fiche, envoyes })) {
    await base.fiches.update(fiche.id, { etat: 'envoyee' });
  }
}

async function envoyer(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  const etat = await adaptateurs.session.etat();
  if (etat !== 'pret') return etat;

  const fiches = await base.fiches.where('etat').equals('a_envoyer').sortBy('creeeLe');
  let resultat: ResultatEnvoi = 'pret';
  for (const fiche of fiches) {
    try {
      await base.fiches.update(fiche.id, { dernierEssai: new Date().toISOString() });
      await envoyerUneFiche(adaptateurs, fiche);
    } catch (erreur) {
      if (erreur instanceof ErreurReseau) return 'hors_ligne';
      if (erreur instanceof ErreurSession) return 'reconnecter';
      // Une fiche refusée ne bloque pas les suivantes ; elle sera rejouée au prochain envoi.
      resultat = 'erreur';
      await journaliser('envoi', 'envoi_refuse', erreur);
    }
  }

  // Le journal des erreurs, sans donnée personnelle.
  for (const erreur of await base.erreurs.toArray()) {
    try {
      await adaptateurs.relais.signalerErreur(erreur);
      await base.erreurs.delete(erreur.id);
    } catch {
      break;
    }
  }

  if (resultat === 'pret') await garder('dernierEnvoi', new Date().toISOString());
  return resultat;
}
