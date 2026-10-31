import type { SupabaseClient } from '@supabase/supabase-js';
import type { Valeur } from '../../modele/listes';
import type {
  ContactDirection,
  DetailReleve,
  LotVu,
  PortAdministration,
  RelaisVu,
  ReleveAValider,
} from '../../modele/ports';
import { decider, lire, traduire } from './erreurs';

interface LigneFile {
  id: string;
  recu_le: string;
  type: Valeur<'type_releve'>;
  nom_enseigne: string;
  relais: string;
  lot: string | null;
  essai: boolean | null;
  hors_lot: boolean | null;
  doublon_possible: boolean;
  reponse_doublon: Valeur<'reponse_doublon'> | null;
  precision_m: number | null;
  photo_recue: boolean;
  contact_recu: boolean;
}

const versFile = (l: LigneFile): ReleveAValider => ({
  id: l.id,
  recuLe: l.recu_le,
  type: l.type,
  nomEnseigne: l.nom_enseigne,
  relais: l.relais,
  lot: l.lot,
  essai: l.essai ?? false,
  horsLot: l.hors_lot,
  doublonPossible: l.doublon_possible,
  reponseDoublon: l.reponse_doublon,
  precisionM: l.precision_m,
  photoRecue: l.photo_recue,
  contactRecu: l.contact_recu,
});

interface LigneDetail {
  id: string;
  recu_le: string;
  pris_le: string;
  type: Valeur<'type_releve'>;
  nom_enseigne: string;
  position: { coordinates?: [number, number] } | null;
  precision_m: number | null;
  niveaux: Valeur<'niveau'>[];
  type_ecole: Valeur<'type_ecole'>;
  repere: string | null;
  numero_enseigne: string | null;
  direction: Valeur<'direction_vue'> | null;
  repasser: string | null;
  reponse_doublon: Valeur<'reponse_doublon'> | null;
  corrige_releve_id: string | null;
  hors_lot: boolean | null;
  doublon_possible: boolean;
  contact_confirme_le: string | null;
  contact_fonction: Valeur<'fonction_direction'> | null;
  relais: { prenom: string } | null;
  lots: { nom: string; essai: boolean } | null;
  doublon: { id: string; nom: string } | null;
}

/**
 * Le port Administration branché sur Supabase. Les décisions passent par les
 * fonctions de la base (accepter_releve…), qui vérifient le rôle elles-mêmes.
 */
export function creerPortAdministration(supabase: () => SupabaseClient): PortAdministration {
  return {
    async suisAdmin() {
      const { data, error } = await supabase().rpc('est_admin');
      traduire(error);
      return data === true;
    },

    async relevesAValider() {
      const lignes = lire(
        await supabase()
          .from('releves_a_valider')
          .select('*')
          .order('recu_le', { ascending: true })
          .returns<LigneFile[]>(),
      );
      return lignes.map(versFile);
    },

    async detailReleve(id): Promise<DetailReleve> {
      const [detail, file] = await Promise.all([
        supabase()
          .from('releves')
          .select(
            'id, recu_le, pris_le, type, nom_enseigne, position, precision_m, niveaux, type_ecole, repere, numero_enseigne, direction, repasser, reponse_doublon, corrige_releve_id, hors_lot, doublon_possible, contact_confirme_le, contact_fonction, relais(prenom), lots(nom, essai), doublon:ecoles!releves_doublon_de_fkey(id, nom)',
          )
          .eq('id', id)
          .single<LigneDetail>(),
        supabase().from('releves_a_valider').select('*').eq('id', id).maybeSingle<LigneFile>(),
      ]);
      const r = lire(detail);
      const [longitude, latitude] = r.position?.coordinates ?? [];
      return {
        id: r.id,
        recuLe: r.recu_le,
        prisLe: r.pris_le,
        type: r.type,
        nomEnseigne: r.nom_enseigne,
        relais: r.relais?.prenom ?? '',
        lot: r.lots?.nom ?? null,
        essai: r.lots?.essai ?? false,
        horsLot: r.hors_lot,
        doublonPossible: r.doublon_possible,
        reponseDoublon: r.reponse_doublon,
        precisionM: r.precision_m,
        photoRecue: file.data?.photo_recue ?? false,
        contactRecu: file.data?.contact_recu ?? false,
        position:
          latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null,
        niveaux: r.niveaux,
        typeEcole: r.type_ecole,
        repere: r.repere,
        numeroEnseigne: r.numero_enseigne,
        direction: r.direction,
        repasser: r.repasser,
        doublonDe: r.doublon,
        corrigeReleveId: r.corrige_releve_id,
        contactConfirmeLe: r.contact_confirme_le,
        contactFonction: r.contact_fonction,
      };
    },

    async photoReleve(id) {
      const { data, error } = await supabase()
        .storage.from('releves')
        .createSignedUrl(`${id}/enseigne.jpg`, 3600);
      return error || !data ? null : data.signedUrl;
    },

    async contactReleve(id): Promise<ContactDirection | null> {
      const { data, error } = await supabase().rpc('contact_du_releve', { releve: id });
      traduire(error);
      const c = (
        data as
          | {
              fonction: Valeur<'fonction_direction'> | null;
              nom: string | null;
              whatsapp: string | null;
              accord_contact: boolean;
              accord_le: string | null;
              ce_qui_a_ete_dit: string | null;
              recu_le: string;
            }[]
          | null
      )?.[0];
      return c
        ? {
            fonction: c.fonction,
            nom: c.nom,
            whatsapp: c.whatsapp,
            accord: c.accord_contact,
            accordLe: c.accord_le,
            note: c.ce_qui_a_ete_dit,
            recuLe: c.recu_le,
          }
        : null;
    },

    async accepter(id, ecoleId = null) {
      const { data, error } = await supabase().rpc('accepter_releve', {
        releve: id,
        ecole: ecoleId,
      });
      decider(error);
      return data as string;
    },

    async demanderCorrection(id, motif, message) {
      const { error } = await supabase().rpc('demander_correction', {
        releve: id,
        motif,
        message,
      });
      decider(error);
    },

    async refuser(id, motif, message) {
      const { error } = await supabase().rpc('refuser_releve', { releve: id, motif, message });
      decider(error);
    },

    async confirmerContact(id, fonction) {
      const { error } = await supabase().rpc('confirmer_contact', { releve: id, fonction });
      decider(error);
    },

    async relais(): Promise<RelaisVu[]> {
      const [relais, releves] = await Promise.all([
        supabase()
          .from('relais')
          .select('id, prenom, statut, lot_id, cree_le, active_le')
          .order('cree_le', { ascending: false })
          .returns<
            {
              id: string;
              prenom: string;
              statut: Valeur<'statut_relais'>;
              lot_id: string | null;
              cree_le: string;
              active_le: string | null;
            }[]
          >(),
        supabase().from('releves').select('relais_id').limit(10000).returns<{ relais_id: string }[]>(),
      ]);
      const parRelais = new Map<string, number>();
      for (const r of lire(releves)) parRelais.set(r.relais_id, (parRelais.get(r.relais_id) ?? 0) + 1);
      return lire(relais).map((r) => ({
        id: r.id,
        prenom: r.prenom,
        statut: r.statut,
        lotId: r.lot_id,
        creeLe: r.cree_le,
        activeLe: r.active_le,
        fiches: parRelais.get(r.id) ?? 0,
      }));
    },

    async lots(): Promise<LotVu[]> {
      const lignes = lire(
        await supabase()
          .from('lots')
          .select('id, nom, essai, a_rendre_le')
          .order('essai')
          .order('nom')
          .returns<{ id: string; nom: string; essai: boolean; a_rendre_le: string | null }[]>(),
      );
      return lignes.map((l) => ({ id: l.id, nom: l.nom, essai: l.essai, aRendreLe: l.a_rendre_le }));
    },

    async activerRelais(relaisId, lotId) {
      const { error } = await supabase().rpc('activer_relais', { relais: relaisId, lot: lotId });
      decider(error);
    },

    async suspendreRelais(relaisId) {
      const { data, error } = await supabase()
        .from('relais')
        .update({ statut: 'suspendu' })
        .eq('id', relaisId)
        .select('id');
      decider(error);
      if (!data || data.length === 0) throw new Error('Relais introuvable.');
    },
  };
}
