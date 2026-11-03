/**
 * La file d'envoi. Une fiche part en trois temps : le relevé, puis ses photos (l'enseigne d'abord,
 * puis les autres, une à une), puis le contact. Chaque envoi peut être rejoué : la base répond
 * « déjà reçu ». Chaque photo et le contact sont effacés du téléphone dès que la base a répondu.
 */
import {
  toutEnvoye,
  versContact,
  versPhotos,
  versReleve,
  type FicheLocale,
} from '../../modele/fiche';
import { appartientAuCompte } from '../../modele/compte';
import {
  apresEchecInattendu,
  apresRejet,
  enseigneExigeeManquante,
  rejetEnseigneAbsente,
} from '../../modele/envoi';
import { ErreurRejet, ErreurReseau, ErreurSession, type EtatSession } from '../../modele/ports';
import type { Adaptateurs } from '../../infra/index';
import { base, garder } from './base-locale';
import { journaliser } from './journal';

export type ResultatEnvoi = EtatSession | 'erreur';

let enCours: Promise<ResultatEnvoi> | null = null;

/** Les fiches dont l'envoi est en route : le relais ne peut pas les modifier ni les retirer à ce moment-là. */
const enVol = new Set<string>();
export const estEnVol = (id: string): boolean => enVol.has(id);

/** Envoie tout ce qui attend. Un seul envoi à la fois : un second appel attend le premier. */
export function envoyerTout(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  enCours ??= envoyer(adaptateurs).finally(() => (enCours = null));
  return enCours;
}

async function envoyerUneFiche(adaptateurs: Adaptateurs, fiche: FicheLocale): Promise<void> {
  const { relais } = adaptateurs;
  const envoyes = { ...fiche.envoyes };

  // Une enseigne exigée qui n'est plus nulle part (ni partie, ni dans le téléphone) ne se termine pas « Envoyée » en
  // silence : la fiche sort de la file avec une raison que le relais lit, et le journal la garde (ticket #72). Avant le
  // relevé, pour ne pas envoyer une fiche qui ne peut pas être complète.
  if (!envoyes.photo && enseigneExigeeManquante(fiche)) {
    const { code, message } = rejetEnseigneAbsente(envoyes.releve);
    throw new ErreurRejet(code, message);
  }

  if (!envoyes.releve) {
    await relais.envoyerReleve(versReleve(fiche));
    envoyes.releve = true;
    await base.fiches.update(fiche.id, { envoyes: { ...envoyes } });
  }

  if (!envoyes.photo) {
    for (const photo of versPhotos(fiche)) {
      await relais.envoyerPhoto(fiche.id, photo);
      // Reçue : le fichier s'efface du téléphone, la ligne reste (une photo ne repart jamais deux fois).
      await base.fiches.update(fiche.id, (f) => {
        f.photos = f.photos.map((p) =>
          p.id === photo.id ? { ...p, envoyee: true, blob: null } : p,
        );
      });
    }
    envoyes.photo = true;
    await base.fiches.update(fiche.id, { envoyes: { ...envoyes } });
  }

  if (!envoyes.contact) {
    const contact = versContact(fiche);
    if (contact) await relais.envoyerContact(contact);
    envoyes.contact = true;
    await base.fiches.update(fiche.id, { envoyes: { ...envoyes }, contact: null });
  }

  const apres = await base.fiches.get(fiche.id);
  if (apres && toutEnvoye({ ...apres, envoyes })) {
    await base.fiches.update(fiche.id, { etat: 'envoyee' });
  }
}

async function envoyer(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  const etat = await adaptateurs.session.etat();
  if (etat !== 'pret') return etat;

  // Seulement les fiches de ce compte : celles d'un autre relais, qui s'est servi du téléphone, attendent son retour.
  // Une fiche d'avant la mise à jour, sans compte, devient celle de ce compte au moment de partir.
  const compte = (await adaptateurs.session.utilisateur())?.id ?? null;
  const fiches = (await base.fiches.where('etat').equals('a_envoyer').sortBy('creeeLe')).filter(
    (f) => appartientAuCompte(f, compte),
  );
  let resultat: ResultatEnvoi = 'pret';
  for (const attendue of fiches) {
    enVol.add(attendue.id);
    try {
      // La fiche est relue au moment de partir : le relais a pu la modifier ou la retirer pendant que les
      // précédentes partaient (la liste ci-dessus date d'avant). Le contenu qui part est toujours le dernier.
      const fiche = await base.fiches.get(attendue.id);
      if (fiche?.etat !== 'a_envoyer' || !appartientAuCompte(fiche, compte)) continue;
      if (fiche.compteId == null && compte)
        await base.fiches.update(fiche.id, { compteId: compte });
      await base.fiches.update(fiche.id, { dernierEssai: new Date().toISOString() });
      await envoyerUneFiche(adaptateurs, fiche);
    } catch (erreur) {
      // Le réseau ou la session manquent : la fiche reste en file, tout repartira seul.
      if (erreur instanceof ErreurReseau) return 'hors_ligne';
      if (erreur instanceof ErreurSession) return 'reconnecter';
      const courante = await base.fiches.get(attendue.id);
      if (erreur instanceof ErreurRejet) {
        // La base REFUSE : la rejouer ne sert à rien. Elle sort de la file avec la raison ; le relais décide
        // (réessayer, modifier, retirer). Elle ne bloque pas les suivantes.
        if (courante) {
          await base.fiches.update(
            attendue.id,
            apresRejet(courante, erreur, new Date().toISOString()),
          );
        }
        await journaliser('envoi', `rejet_${erreur.code}`, erreur);
      } else {
        // Une panne dont on ne sait rien : la fiche reste en file, l'essai est compté, et le relais est prévenu
        // au bout de quelques-uns. Elle ne bloque pas les suivantes.
        resultat = 'erreur';
        if (courante) await base.fiches.update(attendue.id, apresEchecInattendu(courante));
        await journaliser('envoi', 'envoi_echoue', erreur);
      }
    } finally {
      enVol.delete(attendue.id);
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
