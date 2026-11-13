import type { Valeur } from '../../modele/listes';
import { lireFormationsVues, versLaBase } from '../../modele/formations-rapides';
import type { MultiPolygone } from '../../modele/geo';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EcoleACompleter,
  EcoleDuPays,
  EcoleProche,
  Lot,
  MaPaie,
  PhotoRecue,
  PortRelais,
  Profil,
  ReleveRecu,
} from '../../modele/ports';
import { avecDelai, lire, lireListe, traduire } from './erreurs';

/** Les limites de temps d'un envoi : un appel ordinaire, puis une photo (plus lourde, sur un réseau mobile). */
const DELAI_APPEL_MS = 30_000;
const DELAI_PHOTO_MS = 60_000;

const point = (p: { latitude: number; longitude: number } | null) =>
  p === null ? null : `SRID=4326;POINT(${p.longitude} ${p.latitude})`;

/**
 * Le port Relais branché sur Supabase. Chaque lecture filtre sur le compte
 * connecté : les règles de la base laissent un administrateur tout lire, et un
 * administrateur peut aussi être relais (le lot « Essai » sert à se former).
 *
 * Les noms de la base sont en anglais (`field_submissions`, `batch_id`…) : ce fichier est le seul à les connaître.
 */
export function creerPortRelais(supabase: () => SupabaseClient): PortRelais {
  const monId = async (): Promise<string> => {
    const { data } = await supabase().auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Aucune session');
    return id;
  };

  return {
    async monProfil(): Promise<Profil> {
      const id = await monId();
      const ligne = lire(
        await supabase()
          .from('relais')
          .select('id, prenom, statut, lot_id')
          .eq('id', id)
          .single<{
            id: string;
            prenom: string;
            statut: Valeur<'statut_relais'>;
            lot_id: string | null;
          }>(),
      );
      return { id: ligne.id, prenom: ligne.prenom, statut: ligne.statut, lotId: ligne.lot_id };
    },

    async monLot(): Promise<Lot | null> {
      // Le contour est celui du lot ou, à défaut, celui de sa division (calculé par la base).
      const lignes = lireListe<{
        id: string;
        nom: string;
        essai: boolean;
        a_rendre_le: string | null;
        contour_geojson: string | null;
      }>(await supabase().rpc('my_batch'));
      const lot = lignes[0];
      if (!lot) return null;
      const contour = lot.contour_geojson
        ? (JSON.parse(lot.contour_geojson) as { coordinates?: MultiPolygone }).coordinates
        : undefined;
      return {
        id: lot.id,
        nom: lot.nom,
        essai: lot.essai,
        aRendreLe: lot.a_rendre_le,
        contour: contour ?? null,
      };
    },

    async lieuxConnus(): Promise<EcoleProche[]> {
      const lignes = lireListe<{
        kind: 'campus' | 'submission';
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        acronym?: string | null;
        institution_id?: string | null;
        sites?: number | null;
      }>(await supabase().rpc('known_places_for_me'));
      return lignes.map((l) => ({
        id: l.id,
        nom: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        genre: l.kind === 'campus' ? 'campus' : 'releve',
        sigle: l.acronym ?? null,
        institutionId: l.institution_id ?? null,
        sites: l.sites ?? 1,
      }));
    },

    async ecolesDuPays(): Promise<EcoleDuPays[]> {
      const lignes = lireListe<{
        id: string;
        name: string;
        acronym: string | null;
        city: string | null;
        sites: number;
      }>(await supabase().rpc('known_institutions_for_me'));
      return lignes.map((l) => ({
        id: l.id,
        nom: l.name,
        sigle: l.acronym,
        ville: l.city,
        sites: l.sites,
      }));
    },

    async zonesOuvertes(): Promise<string[]> {
      // Les zones que l'administration a ouvertes elles-mêmes (une zone ouverte ouvre tout ce qu'elle contient).
      const lignes = lireListe<{ name: string }>(
        await supabase().from('geo_divisions').select('name').eq('open_for_fieldwork', true),
      );
      return lignes.map((l) => l.name).sort((a, b) => a.localeCompare(b, 'fr'));
    },

    async mesReleves(): Promise<ReleveRecu[]> {
      // `my_submissions` filtre sur le relais connecté et rend aussi ce que les droits du relais ne lui laissent pas
      // lire : les rôles des photos (jamais leur chemin) et « le contact est arrivé » (jamais le contact).
      const lignes = lireListe<{
        id: string;
        kind: Valeur<'type_releve'>;
        status: Valeur<'statut_releve'>;
        reason: Valeur<'motif_decision'> | null;
        message_to_relay: string | null;
        taken_at: string;
        campus_id: string | null;
        sign_name: string;
        levels: string[];
        school_kind: string;
        curriculum_note: string | null;
        observed_programs: string | null;
        programs_photographed: boolean;
        /** Les formations cochées : absentes d'une base qui n'a pas encore la migration du 09/11. */
        observed_formations?: unknown;
        landmark: string | null;
        sign_phone: string | null;
        latitude: number | null;
        longitude: number | null;
        accuracy_m: number | null;
        direction_seen: Valeur<'direction_vue'> | null;
        liaison_sheet_given: boolean;
        come_back_note: string | null;
        contact_confirmed_at: string | null;
        contact_role: Valeur<'fonction_direction'> | null;
        has_contact: boolean;
        photo_roles: Valeur<'photo_role'>[];
        corrects_submission_id?: string | null;
      }>(await supabase().rpc('my_submissions'));
      return lignes.map((r) => ({
        id: r.id,
        type: r.kind,
        nomEnseigne: r.sign_name,
        prisLe: r.taken_at,
        statut: r.status,
        motif: r.reason,
        messageAuRelais: r.message_to_relay,
        direction: r.direction_seen,
        ficheLiaisonRemise: r.liaison_sheet_given,
        repasser: r.come_back_note,
        contactConfirmeLe: r.contact_confirmed_at,
        contactFonction: r.contact_role,
        campusId: r.campus_id,
        niveaux: r.levels,
        typeEcole: r.school_kind,
        programme: r.curriculum_note,
        programmesVus: r.observed_programs,
        programmesEnPhoto: r.programs_photographed,
        formationsVues: lireFormationsVues(r.observed_formations, r.levels),
        repere: r.landmark,
        numeroEnseigne: r.sign_phone,
        position:
          r.latitude !== null && r.longitude !== null
            ? { latitude: r.latitude, longitude: r.longitude }
            : null,
        precisionM: r.accuracy_m,
        photos: r.photo_roles,
        aContact: r.has_contact,
        corrigeReleveId: r.corrects_submission_id ?? null,
      }));
    },

    async mesPhotos(releveId: string): Promise<PhotoRecue[]> {
      // `my_submission_photos` ne rend que les photos d'UNE fiche du relais connecté (ticket #72) ; le stockage ne
      // fabrique l'adresse de lecture que pour les fichiers de ses relevés. Tant que ces deux règles ne sont pas
      // appliquées en ligne, la lecture échoue ou rend une liste vide : l'écran ne montre alors que les rôles reçus.
      const lignes = lireListe<{ id: string; role: Valeur<'photo_role'>; storage_path: string }>(
        await supabase().rpc('my_submission_photos', { p_submission: releveId }),
      );
      if (lignes.length === 0) return [];
      // Une adresse temporaire par photo (une heure) : le seau est privé.
      const { data: adresses } = await supabase()
        .storage.from('releves')
        .createSignedUrls(
          lignes.map((l) => l.storage_path),
          3600,
        );
      const parChemin = new Map((adresses ?? []).map((a) => [a.path, a.signedUrl]));
      return lignes.flatMap((l) => {
        const url = parChemin.get(l.storage_path);
        return url ? [{ id: l.id, role: l.role, url }] : [];
      });
    },

    async mesMissions(): Promise<EcoleACompleter[]> {
      const lignes = lireListe<{
        campus_id: string;
        name: string;
        label: string | null;
        neighbourhood: string | null;
        // Tels que la base les dit : la contre-visite ne reprend que ce que ce téléphone connaît.
        school_kind: string;
        cycles: string[];
        curriculum_note: string | null;
        landmark: string | null;
        sign_phone: string | null;
        note: string | null;
        kind: Valeur<'mission_kind'>;
        // Ce que NTanova sait déjà de l'école (PR 3 du ticket #55) : le relais ne le redonne pas.
        latitude: number | null;
        longitude: number | null;
        verification_state: string;
        photo_roles: Valeur<'photo_role'>[];
        contact_confirmed: boolean;
      }>(await supabase().rpc('my_missions'));
      return lignes.map((m) => ({
        id: m.campus_id,
        nom: m.name,
        etiquette: m.label,
        quartier: m.neighbourhood,
        typeEcole: m.school_kind,
        niveaux: m.cycles,
        programme: m.curriculum_note,
        repere: m.landmark,
        numeroEnseigne: m.sign_phone,
        note: m.note,
        genre: m.kind,
        position:
          m.latitude !== null && m.longitude !== null
            ? { latitude: m.latitude, longitude: m.longitude }
            : null,
        etatVerification: m.verification_state,
        photos: m.photo_roles ?? [],
        contactConfirme: m.contact_confirmed ?? false,
      }));
    },

    async maPaie(): Promise<MaPaie> {
      // `my_payout` rend l'acquis (une ligne) puis les semaines closes : les mêmes règles que l'administration.
      const lignes = lireListe<{
        friday: string;
        state: 'acquis' | 'a_payer' | 'paye';
        submissions: number;
        contacts: number;
        trial_bundles: number;
        total_xaf: number;
        not_payable: number;
        has_payment_details: boolean;
        paid_at: string | null;
        reference: string | null;
      }>(await supabase().rpc('my_payout'));
      const ligne = (l: (typeof lignes)[number]) => ({
        vendredi: l.friday,
        etat: l.state,
        fiches: l.submissions,
        contacts: l.contacts,
        essais: l.trial_bundles,
        totalXaf: l.total_xaf,
        nonPayables: l.not_payable,
        payeLe: l.paid_at,
        reference: l.reference,
      });
      const acquis = lignes.find((l) => l.state === 'acquis');
      return {
        acquis: acquis
          ? ligne(acquis)
          : {
              vendredi: '',
              etat: 'acquis',
              fiches: 0,
              contacts: 0,
              essais: 0,
              totalXaf: 0,
              nonPayables: 0,
              payeLe: null,
              reference: null,
            },
        historique: lignes.filter((l) => l.state !== 'acquis').map(ligne),
        numeroConnu: lignes.some((l) => l.has_payment_details),
      };
    },

    async envoyerReleve(r) {
      // Sans `.select()` : le relais n'a pas à relire ce qu'il envoie, et un second
      // envoi du même identifiant répond 23505, soit « déjà reçu ».
      const { error } = await avecDelai(
        supabase()
        .from('field_submissions')
        .insert({
          id: r.id,
          batch_id: r.lotId,
          kind: r.type,
          corrects_submission_id: r.corrigeReleveId,
          position: point(r.position),
          accuracy_m: r.precisionM,
          taken_at: r.prisLe,
          duplicate_answer: r.reponseDoublon,
          duplicate_of_campus_id: r.doublonDe,
          sign_name: r.nomEnseigne,
          levels: r.niveaux,
          school_kind: r.typeEcole,
          curriculum_note: r.programme,
          observed_programs: r.programmesVus,
          programs_photographed: r.programmesEnPhoto,
          // Seulement quand le relais a coché quelque chose : un relevé sans formations part exactement comme avant,
          // même si le code arrivait un instant avant la migration (la colonne a une valeur par défaut).
          ...(r.formationsVues.length > 0 ? { observed_formations: versLaBase(r.formationsVues) } : {}),
          landmark: r.repere,
          sign_phone: r.numeroEnseigne,
          direction_seen: r.direction,
          come_back_note: r.repasser,
          // v2 (13/11) : seulement ce que le relais a rempli, pour qu'un relevé sans bonus parte exactement comme avant.
          ...(r.sigle ? { acronym: r.sigle } : {}),
          ...(r.remarque ? { relay_note: r.remarque } : {}),
          ...(r.vusSurPlace && r.vusSurPlace.length > 0 ? { seen_equipment: r.vusSurPlace } : {}),
          ...(r.cloture ? { fence: r.cloture } : {}),
          ...(r.autreSiteDe ? { duplicate_of_institution_id: r.autreSiteDe } : {}),
        }),
        DELAI_APPEL_MS,
      );
      return traduire(error);
    },

    async envoyerPhoto(releveId, photo) {
      // Le chemin est celui que la base calcule : `<relevé>/<photo>.<extension>`, relatif. Le fichier d'abord ; un
      // fichier déjà là (envoi précédent interrompu) n'empêche pas d'enregistrer la photo, qui est rejouable.
      // Ce sont les octets déjà lus en mémoire qui partent, en corps brut : jamais le fichier de la base du téléphone,
      // en multipart (ticket #74 : sur iPhone, il échoue sans qu'une requête parte).
      const extension = photo.mime === 'image/webp' ? 'webp' : 'jpg';
      const { error } = await avecDelai(
        supabase()
          .storage.from('releves')
          .upload(`${releveId}/${photo.id}.${extension}`, photo.contenu, {
            contentType: photo.mime,
            upsert: false,
          }),
        DELAI_PHOTO_MS,
      );
      traduire(error);
      const { data, error: erreurEnregistrement } = await avecDelai(
        supabase().rpc('register_photo', {
          p_photo: photo.id,
          p_submission: releveId,
          p_role: photo.role,
          p_mime: photo.mime,
          p_bytes: photo.contenu.byteLength,
          p_width: photo.largeur > 0 ? photo.largeur : null,
          p_height: photo.hauteur > 0 ? photo.hauteur : null,
          p_taken_at: photo.prisLe,
        }),
        DELAI_APPEL_MS,
      );
      traduire(erreurEnregistrement);
      return data === 'deja_recu' ? 'deja_recu' : 'recu';
    },

    async envoyerContact(c) {
      const { data, error } = await avecDelai(
        supabase().rpc('send_contact', {
          p_submission: c.releveId,
          p_role: c.fonction,
          p_name: c.nom,
          p_whatsapp: c.whatsapp,
          p_agreement: c.accord,
          p_agreement_at: c.accordLe,
          p_note: c.note,
          // Les paramètres du ticket #96 ne partent que pour une personne en plus (ou une précision) : le contact de la
          // direction garde l'ancienne forme de l'appel, qui marche aussi sur une base pas encore à jour.
          ...(c.contactId ? { p_contact: c.contactId } : {}),
          ...(c.precisionFonction ? { p_role_detail: c.precisionFonction } : {}),
        }),
        DELAI_APPEL_MS,
      );
      traduire(error);
      return data === 'deja_recu' ? 'deja_recu' : 'recu';
    },

    async signalerErreur(e) {
      const { error } = await avecDelai(
        supabase().from('erreurs').insert({
          id: e.id,
          survenue_le: e.survenueLe,
          ecran: e.ecran,
          code: e.code,
          detail: e.detail,
          version_app: e.versionApp,
          appareil: e.appareil,
        }),
        DELAI_APPEL_MS,
      );
      return traduire(error);
    },
  };
}
