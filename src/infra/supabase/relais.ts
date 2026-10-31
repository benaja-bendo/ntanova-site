import type { Valeur } from '../../modele/listes';
import type { MultiPolygone } from '../../modele/geo';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EcoleProche, Lot, PortRelais, Profil, ReleveRecu } from '../../modele/ports';
import { lire, traduire } from './erreurs';

const point = (p: { latitude: number; longitude: number } | null) =>
  p === null ? null : `SRID=4326;POINT(${p.longitude} ${p.latitude})`;

interface GeoJson {
  coordinates?: MultiPolygone;
}

/**
 * Le port Relais branché sur Supabase. Chaque lecture filtre sur le compte
 * connecté : les règles de la base laissent un administrateur tout lire, et un
 * administrateur peut aussi être relais (le lot « Essai » sert à se former).
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
        .single<{ id: string; prenom: string; statut: Valeur<'statut_relais'>; lot_id: string | null }>(),
    );
    return { id: ligne.id, prenom: ligne.prenom, statut: ligne.statut, lotId: ligne.lot_id };
  },

  async monLot(): Promise<Lot | null> {
    const id = await monId();
    const moi = lire(
      await supabase()
        .from('relais')
        .select('lot_id')
        .eq('id', id)
        .single<{ lot_id: string | null }>(),
    );
    if (!moi.lot_id) return null;
    const { data, error } = await supabase()
      .from('lots')
      .select('id, nom, essai, a_rendre_le, contour, arrondissements(contour)')
      .eq('id', moi.lot_id)
      .maybeSingle<{
        id: string;
        nom: string;
        essai: boolean;
        a_rendre_le: string | null;
        contour: GeoJson | null;
        arrondissements: { contour: GeoJson | null } | null;
      }>();
    if (error) traduire(error);
    if (!data) return null;
    return {
      id: data.id,
      nom: data.nom,
      essai: data.essai,
      aRendreLe: data.a_rendre_le,
      contour: data.contour?.coordinates ?? data.arrondissements?.contour?.coordinates ?? null,
    };
  },

  async ecolesPubliees(): Promise<EcoleProche[]> {
    const lignes = lire(
      await supabase()
        .from('ecoles_publiees')
        .select('id, nom, latitude, longitude')
        .not('latitude', 'is', null)
        .limit(5000),
    );
    return lignes as EcoleProche[];
  },

  async mesReleves(): Promise<ReleveRecu[]> {
    const id = await monId();
    const lignes = lire(
      await supabase()
        .from('releves')
        .select(
          'id, nom_enseigne, pris_le, statut, motif, message_au_relais, direction, fiche_liaison_remise, repasser, contact_confirme_le, contact_fonction, ecole_id',
        )
        .eq('relais_id', id)
        .order('pris_le', { ascending: false })
        .limit(500),
    );
    return lignes.map((r) => ({
      id: r.id,
      nomEnseigne: r.nom_enseigne,
      prisLe: r.pris_le,
      statut: r.statut,
      motif: r.motif,
      messageAuRelais: r.message_au_relais,
      direction: r.direction,
      ficheLiaisonRemise: r.fiche_liaison_remise,
      repasser: r.repasser,
      contactConfirmeLe: r.contact_confirme_le,
      contactFonction: r.contact_fonction,
      ecoleId: r.ecole_id,
    }));
  },

  async envoyerReleve(r) {
    // Sans `.select()` : le relais n'a pas à relire ce qu'il envoie, et un second
    // envoi du même identifiant répond 23505, soit « déjà reçu ».
    const { error } = await supabase().from('releves').insert({
      id: r.id,
      lot_id: r.lotId,
      type: r.type,
      corrige_releve_id: r.corrigeReleveId,
      position: point(r.position),
      precision_m: r.precisionM,
      pris_le: r.prisLe,
      reponse_doublon: r.reponseDoublon,
      doublon_de: r.doublonDe,
      nom_enseigne: r.nomEnseigne,
      niveaux: r.niveaux,
      type_ecole: r.typeEcole,
      repere: r.repere,
      numero_enseigne: r.numeroEnseigne,
      direction: r.direction,
      repasser: r.repasser,
    });
    return traduire(error);
  },

  async envoyerPhoto(releveId, photo) {
    const { error } = await supabase()
      .storage.from('releves')
      .upload(`${releveId}/enseigne.jpg`, photo, { contentType: 'image/jpeg', upsert: false });
    return traduire(error);
  },

  async envoyerContact(c) {
    const { data, error } = await supabase().rpc('envoyer_contact', {
      releve: c.releveId,
      fonction: c.fonction,
      nom: c.nom,
      whatsapp: c.whatsapp,
      accord: c.accord,
      accord_le: c.accordLe,
      note: c.note,
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
