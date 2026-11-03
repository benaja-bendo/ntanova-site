/**
 * La file d'envoi. Une fiche part en trois temps : le relevé, puis le contact, puis ses photos (l'enseigne
 * d'abord, puis les autres, une à une). Le contact ne dépend pas des photos : il part avant elles, pour qu'une
 * photo qui ne part pas ne l'arrête plus (ticket #94 : le contact d'ESTAM s'était perdu ainsi). Chaque envoi
 * peut être rejoué : la base répond « déjà reçu ». Chaque photo et le contact sont effacés du téléphone dès que
 * la base a répondu.
 *
 * Trois règles (ticket #74) :
 *   - **une fiche qui échoue ne bloque pas les suivantes.** Une erreur de connexion alors que le téléphone se dit en ligne
 *     compte un essai sur cette fiche, garde l'étape et la raison, et la file passe à la suivante. Seul un téléphone
 *     qui se dit hors ligne arrête la file (rien ne partirait). Avant, la première erreur de ce genre arrêtait tout sans
 *     un mot : « Envoyer maintenant » ne montrait rien, les fiches suivantes n'étaient jamais essayées ;
 *   - **un envoi ne reste jamais suspendu** : une limite de temps pour l'ensemble (et une par appel, dans l'adaptateur) ;
 *   - **les photos partent de la mémoire** : leurs octets sont lus avant tout envoi, puis envoyés tels quels. Une photo
 *     qui ne se relit plus est dite.
 */
import {
  toutEnvoye,
  versAutresPersonnes,
  versContact,
  versPhotos,
  versReleve,
  type FicheLocale,
} from '../../modele/fiche';
import { appartientAuCompte } from '../../modele/compte';
import { limiterLeTemps } from '../../modele/delai';
import {
  apresEchecInattendu,
  apresEchecReseau,
  apresRejet,
  doitJournaliserLEchec,
  enseigneExigeeManquante,
  etapeEnCours,
  gestesDEnvoi,
  rejetEnseigneAbsente,
  rejetPhotoIllisible,
  type BilanEnvoi,
} from '../../modele/envoi';
import { lireLesOctets } from '../../modele/octets-photo';
import {
  ErreurRejet,
  ErreurReseau,
  ErreurSession,
  type EtatSession,
  type PhotoPrete,
} from '../../modele/ports';
import type { Adaptateurs } from '../../infra/index';
import { base, garder } from './base-locale';
import { journaliser } from './journal';

export type ResultatEnvoi = EtatSession | 'erreur';

/** Au-delà, l'envoi en cours est abandonné et le suivant peut partir : il ne reste jamais suspendu. */
const DELAI_TOTAL_MS = 150_000;

let enCours: Promise<ResultatEnvoi> | null = null;
let dernierBilan: BilanEnvoi | null = null;

/** Ce que le dernier essai a fait (fiches parties, fiches en échec), pour le dire au relais. */
export const bilanDuDernierEnvoi = (): BilanEnvoi | null => dernierBilan;

/** Les fiches dont l'envoi est en route : le relais ne peut pas les modifier ni les retirer à ce moment-là. */
const enVol = new Set<string>();
export const estEnVol = (id: string): boolean => enVol.has(id);

/** Le navigateur dit lui-même qu'il n'a pas de réseau : rien ne partirait, inutile d'essayer les autres fiches. */
const horsLigne = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Envoie tout ce qui attend. Un seul envoi à la fois : un second appel attend le premier. Si le premier ne finit pas
 * dans le délai (une connexion qui ne répond plus), il est abandonné : sans cela, le second l'attendrait pour toujours.
 */
export function envoyerTout(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  enCours ??= limiterLeTemps<ResultatEnvoi, ResultatEnvoi>(
    envoyer(adaptateurs),
    DELAI_TOTAL_MS,
    'erreur',
    () => {
      enVol.clear();
      void journaliser('envoi', 'delai_depasse', 'envoi abandonné après 150 s');
    },
  ).finally(() => (enCours = null));
  return enCours;
}

/** Rend `true` quand la fiche est complètement partie. */
async function envoyerUneFiche(adaptateurs: Adaptateurs, fiche: FicheLocale): Promise<boolean> {
  const { relais } = adaptateurs;
  const envoyes = { ...fiche.envoyes };

  // Ce qui empêche les photos de partir : une enseigne exigée qui n'est plus nulle part (ni partie, ni dans le
  // téléphone), ou qui ne se relit plus. La fiche ne se termine pas « Envoyée » en silence : elle sort de la file avec
  // une raison que le relais lit, et le journal la garde (ticket #72).
  // Les octets des photos qui attendent sont lus AVANT tout envoi : ce sont eux qui partent, jamais le fichier de la base
  // du téléphone (sur iPhone, l'envoyer en multipart échoue sans qu'une requête parte). Une autre photo qui ne se relit
  // plus est laissée de côté.
  let blocage: ErreurRejet | null = null;
  const pretes: PhotoPrete[] = [];
  const illisibles: ReturnType<typeof versPhotos> = [];
  if (!envoyes.photo) {
    if (enseigneExigeeManquante(fiche)) {
      const { code, message } = rejetEnseigneAbsente(envoyes.releve);
      blocage = new ErreurRejet(code, message);
    } else {
      for (const photo of versPhotos(fiche)) {
        const contenu = await lireLesOctets(photo.blob);
        if (contenu) pretes.push({ ...photo, contenu, octets: contenu.byteLength });
        else illisibles.push(photo);
      }
      if (illisibles.some((p) => p.role === 'signboard') && (fiche.taches?.photo ?? true)) {
        const { code, message } = rejetPhotoIllisible(envoyes.releve);
        blocage = new ErreurRejet(code, message);
      }
    }
  }

  // Le relevé, le contact, les photos, dans cet ordre (`gestesDEnvoi`). Rien n'est encore parti et la photo est bloquée :
  // la fiche est refusée avant de partir, pour ne pas envoyer une fiche qui ne peut pas être complète. Le relevé est déjà
  // chez NTanova : le contact part quand même, puis la fiche est refusée (ticket #94).
  for (const geste of gestesDEnvoi(envoyes, blocage !== null)) {
    if (geste === 'refus') {
      if (blocage) throw blocage;
    } else if (geste === 'releve') {
      await relais.envoyerReleve(versReleve(fiche));
      envoyes.releve = true;
      await base.fiches.update(fiche.id, { envoyes: { ...envoyes } });
    } else if (geste === 'contact') {
      const contact = versContact(fiche);
      if (contact) await relais.envoyerContact(contact);
      // Les personnes en plus, une à une : chacune s'efface du téléphone dès que la base l'a reçue, et celle qui n'est pas
      // arrivée repart seule au prochain essai (sans doublon : son identifiant est le sien).
      for (const autre of versAutresPersonnes(fiche)) {
        await relais.envoyerContact(autre);
        await base.fiches.update(fiche.id, (f) => {
          f.autresPersonnes = (f.autresPersonnes ?? []).filter((p) => p.id !== autre.contactId);
        });
      }
      envoyes.contact = true;
      await base.fiches.update(fiche.id, { envoyes: { ...envoyes }, contact: null });
    } else {
      for (const photo of pretes) {
        await relais.envoyerPhoto(fiche.id, photo);
        // Reçue : le fichier s'efface du téléphone, la ligne reste (une photo ne repart jamais deux fois).
        await base.fiches.update(fiche.id, (f) => {
          f.photos = f.photos.map((p) =>
            p.id === photo.id ? { ...p, envoyee: true, blob: null } : p,
          );
        });
      }
      if (illisibles.length > 0) {
        // Pas l'enseigne exigée : la fiche part sans ces photos, et le journal le dit.
        for (const photo of illisibles) {
          await journaliser('envoi', 'photo_illisible', `${photo.role} · ${photo.octets} octets`);
        }
        await base.fiches.update(fiche.id, (f) => {
          f.photos = f.photos.filter((p) => !illisibles.some((i) => i.id === p.id));
        });
      }
      envoyes.photo = true;
      await base.fiches.update(fiche.id, { envoyes: { ...envoyes } });
    }
  }

  const apres = await base.fiches.get(fiche.id);
  if (apres && toutEnvoye({ ...apres, envoyes })) {
    await base.fiches.update(fiche.id, { etat: 'envoyee', dernierEchec: null });
    return true;
  }
  return false;
}

async function envoyer(adaptateurs: Adaptateurs): Promise<ResultatEnvoi> {
  const etat = await adaptateurs.session.etat();
  if (etat !== 'pret') {
    dernierBilan = {
      le: new Date().toISOString(),
      envoyees: 0,
      echecs: [],
      refusees: 0,
      horsLigne: etat === 'hors_ligne',
    };
    return etat;
  }

  // Seulement les fiches de ce compte : celles d'un autre relais, qui s'est servi du téléphone, attendent son retour.
  // Une fiche d'avant la mise à jour, sans compte, devient celle de ce compte au moment de partir.
  const compte = (await adaptateurs.session.utilisateur())?.id ?? null;
  const fiches = (await base.fiches.where('etat').equals('a_envoyer').sortBy('creeeLe')).filter(
    (f) => appartientAuCompte(f, compte),
  );
  let resultat: ResultatEnvoi = 'pret';
  let envoyees = 0;
  let refusees = 0;
  const echecs: BilanEnvoi['echecs'] = [];
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
      if (await envoyerUneFiche(adaptateurs, fiche)) envoyees += 1;
    } catch (erreur) {
      // La session manque : le relais se reconnecte, les fiches restent sur le téléphone.
      if (erreur instanceof ErreurSession) {
        dernierBilan = {
          le: new Date().toISOString(),
          envoyees,
          echecs,
          refusees,
          horsLigne: false,
        };
        return 'reconnecter';
      }
      const courante = await base.fiches.get(attendue.id);
      if (erreur instanceof ErreurReseau) {
        // Le téléphone se dit hors ligne : rien ne partirait, inutile d'essayer les autres, tout repartira seul.
        if (horsLigne()) {
          dernierBilan = {
            le: new Date().toISOString(),
            envoyees,
            echecs,
            refusees,
            horsLigne: true,
          };
          return 'hors_ligne';
        }
        // Le téléphone se dit en ligne, mais cet envoi-là échoue (« Load failed » sur iPhone, un délai dépassé) : l'essai
        // est compté et dit, et la file passe à la fiche suivante. Un échec n'en retient plus un autre.
        resultat = 'erreur';
        if (courante) {
          const etape = etapeEnCours(courante);
          const maintenant = new Date().toISOString();
          const apres = apresEchecReseau(courante, etape, erreur.message, maintenant);
          await base.fiches.update(attendue.id, apres);
          echecs.push({ nom: courante.nomEnseigne || 'une fiche', etape });
          if (doitJournaliserLEchec(apres.essais ?? 0)) {
            const photo = courante.photos?.find((p) => !p.envoyee && p.blob !== null);
            await journaliser(
              'envoi',
              `reseau_${etape}`,
              `${erreur.message} | en ligne : oui | essai ${apres.essais}${
                etape === 'photo' && photo ? ` | photo ${photo.octets} octets ${photo.mime}` : ''
              }`,
            );
          }
        }
      } else if (erreur instanceof ErreurRejet) {
        // La base REFUSE : la rejouer ne sert à rien. Elle sort de la file avec la raison ; le relais décide
        // (réessayer, modifier, retirer). Elle ne bloque pas les suivantes.
        refusees += 1;
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
        if (courante) {
          await base.fiches.update(attendue.id, apresEchecInattendu(courante));
          echecs.push({ nom: courante.nomEnseigne || 'une fiche', etape: etapeEnCours(courante) });
        }
        await journaliser('envoi', 'envoi_echoue', erreur);
      }
    } finally {
      enVol.delete(attendue.id);
    }
  }

  // Le journal des erreurs, sans donnée personnelle. Il part à chaque essai, même après un échec : c'est lui qui dit à
  // NTanova pourquoi un envoi ne passe pas.
  for (const erreur of await base.erreurs.toArray()) {
    try {
      await adaptateurs.relais.signalerErreur(erreur);
      await base.erreurs.delete(erreur.id);
    } catch {
      break;
    }
  }

  dernierBilan = { le: new Date().toISOString(), envoyees, echecs, refusees, horsLigne: false };
  if (resultat === 'pret') await garder('dernierEnvoi', new Date().toISOString());
  return resultat;
}
