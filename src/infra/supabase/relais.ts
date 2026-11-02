import type { Valeur } from '../../modele/listes';
import type { MultiPolygone } from '../../modele/geo';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EcoleACompleter,
  EcoleProche,
  Lot,
  PortRelais,
  Profil,
  ReleveRecu,
} from '../../modele/ports';
import { lire, lireListe, traduire } from './erreurs';

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
      }>(await supabase().rpc('known_places_in_my_batch'));
      return lignes.map((l) => ({
        id: l.id,
        nom: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        genre: l.kind === 'campus' ? 'campus' : 'releve',
      }));
    },

    async mesReleves(): Promise<ReleveRecu[]> {
      const id = await monId();
      const lignes = lire(
        await supabase()
          .from('field_submissions')
          .select(
            'id, sign_name, taken_at, status, reason, message_to_relay, direction_seen, liaison_sheet_given, come_back_note, contact_confirmed_at, contact_role, campus_id',
          )
          .eq('relay_id', id)
          .order('taken_at', { ascending: false })
          .limit(500),
      );
      return lignes.map((r) => ({
        id: r.id,
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
      }));
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
      }));
    },

    async envoyerReleve(r) {
      // Sans `.select()` : le relais n'a pas à relire ce qu'il envoie, et un second
      // envoi du même identifiant répond 23505, soit « déjà reçu ».
      const { error } = await supabase()
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
          landmark: r.repere,
          sign_phone: r.numeroEnseigne,
          direction_seen: r.direction,
          come_back_note: r.repasser,
        });
      return traduire(error);
    },

    async envoyerPhoto(releveId, photo) {
      // Le chemin est celui que la base calcule : `<relevé>/<photo>.<extension>`, relatif. Le fichier d'abord ; un
      // fichier déjà là (envoi précédent interrompu) n'empêche pas d'enregistrer la photo, qui est rejouable.
      const extension = photo.mime === 'image/webp' ? 'webp' : 'jpg';
      const { error } = await supabase()
        .storage.from('releves')
        .upload(`${releveId}/${photo.id}.${extension}`, photo.blob, {
          contentType: photo.mime,
          upsert: false,
        });
      traduire(error);
      const { data, error: erreurEnregistrement } = await supabase().rpc('register_photo', {
        p_photo: photo.id,
        p_submission: releveId,
        p_role: photo.role,
        p_mime: photo.mime,
        p_bytes: photo.octets,
        p_width: photo.largeur > 0 ? photo.largeur : null,
        p_height: photo.hauteur > 0 ? photo.hauteur : null,
        p_taken_at: photo.prisLe,
      });
      traduire(erreurEnregistrement);
      return data === 'deja_recu' ? 'deja_recu' : 'recu';
    },

    async envoyerContact(c) {
      const { data, error } = await supabase().rpc('send_contact', {
        p_submission: c.releveId,
        p_role: c.fonction,
        p_name: c.nom,
        p_whatsapp: c.whatsapp,
        p_agreement: c.accord,
        p_agreement_at: c.accordLe,
        p_note: c.note,
      });
      traduire(error);
      return data === 'deja_recu' ? 'deja_recu' : 'recu';
    },

    async signalerErreur(e) {
      const { error } = await supabase().from('erreurs').insert({
        id: e.id,
        survenue_le: e.survenueLe,
        ecran: e.ecran,
        code: e.code,
        detail: e.detail,
        version_app: e.versionApp,
        appareil: e.appareil,
      });
      return traduire(error);
    },
  };
}
