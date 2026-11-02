import type { SupabaseClient } from '@supabase/supabase-js';
import type { Point } from '../../modele/geo';
import { niveauxConnus, typeConnu, type Valeur } from '../../modele/listes';
import {
  ErreurDecision,
  type CompteursRelais,
  type ContactDirection,
  type DecisionAcceptation,
  type DetailReleve,
  type DivisionVue,
  type EcoleVue,
  type EntreeCatalogue,
  type FormationSaisie,
  type InstitutionVue,
  type LignePaie,
  type LotVu,
  type PaiementVu,
  type PhotoVue,
  type PortAdministration,
  type RapportImport,
  type RelaisVu,
  type ReleveAValider,
  type ReleveDecide,
  type ResultatCreation,
  type SemainePaie,
} from '../../modele/ports';
import { decider, lire, lireListe, toutesLesLignes, traduire } from './erreurs';

/** Le seau du stockage où vivent les photos des relevés (les chemins en base sont relatifs à lui). */
const SEAU_PHOTOS = 'releves';

/**
 * La position telle que l'API la rend (GeoJSON : `{ type: 'Point', coordinates: [lng, lat] }`),
 * ou null. Une forme inattendue se lit « pas de position connue », sans erreur.
 */
function lirePoint(valeur: unknown): Point | null {
  const coordonnees = (valeur as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(coordonnees)) return null;
  const [longitude, latitude] = coordonnees as unknown[];
  return typeof latitude === 'number' && typeof longitude === 'number'
    ? { latitude, longitude }
    : null;
}

/** Une formation saisie, dans la forme que lit la base (`upsert_programs`). */
const versProgramme = (f: Omit<FormationSaisie, 'cycle'> & { cycle?: string }) => ({
  ...(f.cycle ? { cycle: f.cycle } : {}),
  title: f.titre,
  domain: f.domaine,
  bac_track: f.serie,
  diploma: f.diplome,
  rhythms: f.rythmes,
});

/** Une école à créer, dans la forme que lit la base (`create_catalog_entry`). */
const versEntree = (e: EntreeCatalogue) => ({
  ref: e.reference,
  name: e.nom,
  kind: e.genre,
  campuses: e.campus.map((c) => ({
    label: c.etiquette,
    division: c.division,
    neighbourhood: c.quartier,
    landmark: c.repere,
    sign_phone: c.numeroEnseigne,
    latitude: c.position?.latitude ?? null,
    longitude: c.position?.longitude ?? null,
    curriculum_note: c.programme,
    cycles: c.cycles.map((cy) =>
      cy.formations.length === 0
        ? cy.cycle
        : { cycle: cy.cycle, programs: cy.formations.map((f) => versProgramme(f)) },
    ),
  })),
});

interface LigneFile {
  id: string;
  received_at: string;
  kind: Valeur<'type_releve'>;
  sign_name: string;
  relay: string;
  batch: string | null;
  trial: boolean | null;
  outside_batch: boolean | null;
  in_open_zone: boolean | null;
  possible_duplicate: boolean;
  duplicate_answer: Valeur<'reponse_doublon'> | null;
  accuracy_m: number | null;
  photos: number;
  signboard_received: boolean;
  has_programs_hint: boolean;
  contact_received: boolean;
}

const versFile = (l: LigneFile): ReleveAValider => ({
  id: l.id,
  recuLe: l.received_at,
  type: l.kind,
  nomEnseigne: l.sign_name,
  relais: l.relay,
  lot: l.batch,
  essai: l.trial ?? false,
  horsLot: l.outside_batch,
  enZoneOuverte: l.in_open_zone,
  doublonPossible: l.possible_duplicate,
  reponseDoublon: l.duplicate_answer,
  precisionM: l.accuracy_m,
  photos: l.photos,
  enseigneRecue: l.signboard_received,
  indiceFormations: l.has_programs_hint,
  contactRecu: l.contact_received,
});

interface LigneDetail {
  id: string;
  received_at: string;
  taken_at: string;
  kind: Valeur<'type_releve'>;
  sign_name: string;
  position: unknown;
  accuracy_m: number | null;
  // Tels que la base les dit : une valeur que cette version ne connaît pas encore ne casse rien.
  levels: string[];
  school_kind: string;
  curriculum_note: string | null;
  observed_programs: string | null;
  programs_photographed: boolean;
  landmark: string | null;
  sign_phone: string | null;
  direction_seen: Valeur<'direction_vue'> | null;
  come_back_note: string | null;
  duplicate_answer: Valeur<'reponse_doublon'> | null;
  corrects_submission_id: string | null;
  outside_batch: boolean | null;
  in_open_zone: boolean | null;
  possible_duplicate: boolean;
  contact_confirmed_at: string | null;
  contact_role: Valeur<'fonction_direction'> | null;
  trial_validated_at: string | null;
  campus_id: string | null;
  relais: { prenom: string } | null;
  lots: { nom: string; essai: boolean } | null;
  doublon: { id: string; label: string | null; institutions: { name: string } | null } | null;
  campus: {
    label: string | null;
    publication: Valeur<'publication'>;
    institutions: { name: string } | null;
    geo_divisions: { name: string } | null;
  } | null;
}

const COLONNES_DETAIL =
  'id, received_at, taken_at, kind, sign_name, position, accuracy_m, levels, school_kind, curriculum_note, ' +
  'observed_programs, programs_photographed, landmark, sign_phone, direction_seen, come_back_note, ' +
  'duplicate_answer, corrects_submission_id, outside_batch, in_open_zone, possible_duplicate, contact_confirmed_at, ' +
  'contact_role, trial_validated_at, campus_id, relais(prenom), lots(nom, essai), ' +
  'doublon:campuses!field_submissions_duplicate_of_campus_id_fkey(id, label, institutions(name)), ' +
  'campus:campuses!field_submissions_campus_id_fkey(label, publication, institutions(name), geo_divisions(name))';

interface LigneCampus {
  id: string;
  institution_id: string;
  label: string | null;
  neighbourhood: string | null;
  landmark: string | null;
  sign_phone: string | null;
  position: unknown;
  division_id: string | null;
  verified_on: string | null;
  publication: Valeur<'publication'>;
  origin: Valeur<'origin_kind'>;
  curriculum_note: string | null;
  retired_at: string | null;
  retirement_reason: Valeur<'motif_retrait'> | null;
  retirement_note: string | null;
  replaced_by_campus_id: string | null;
  institutions: { name: string; kind: string } | null;
  geo_divisions: { name: string } | null;
  missions: {
    relay_id: string;
    note: string | null;
    kind: Valeur<'mission_kind'>;
    status: Valeur<'mission_status'>;
    relais: { prenom: string } | null;
  }[];
  campus_cycles: { cycle: string; campus_programs: { id: string }[] }[];
}

const COLONNES_CAMPUS =
  'id, institution_id, label, neighbourhood, landmark, sign_phone, position, division_id, verified_on, ' +
  'publication, origin, curriculum_note, retired_at, retirement_reason, retirement_note, replaced_by_campus_id, ' +
  'institutions(name, kind), geo_divisions(name), missions(relay_id, note, kind, status, relais(prenom)), ' +
  'campus_cycles(cycle, campus_programs(id))';

const versEcole = (e: LigneCampus): EcoleVue => {
  const mission = e.missions.find((m) => m.status === 'open');
  const position = lirePoint(e.position);
  return {
    id: e.id,
    institutionId: e.institution_id,
    nom: e.institutions?.name ?? '',
    etiquette: e.label,
    quartier: e.neighbourhood,
    division: e.geo_divisions?.name ?? null,
    divisionId: e.division_id,
    publication: e.publication,
    origine: e.origin,
    retrait:
      e.publication === 'retiree' && e.retirement_reason && e.retired_at
        ? {
            motif: e.retirement_reason,
            le: e.retired_at,
            note: e.retirement_note,
            remplaceePar: e.replaced_by_campus_id,
          }
        : null,
    aSituer: position === null,
    position,
    confiee: mission
      ? {
          relaisId: mission.relay_id,
          prenom: mission.relais?.prenom ?? '',
          note: mission.note,
          genre: mission.kind,
        }
      : null,
    typeEcole: typeConnu(e.institutions?.kind ?? 'non_indique'),
    niveaux: niveauxConnus(e.campus_cycles.map((c) => c.cycle)),
    programme: e.curriculum_note,
    repere: e.landmark,
    numeroEnseigne: e.sign_phone,
    formations: e.campus_cycles.reduce((n, c) => n + c.campus_programs.length, 0),
    verifieeLe: e.verified_on,
  };
};

/** Un montant en francs CFA, tel que la base le rend (un entier), jamais un texte. */
const entier = (valeur: unknown): number => (typeof valeur === 'number' ? valeur : Number(valeur ?? 0));

/**
 * Le port Administration branché sur Supabase. Les décisions passent par les fonctions de la base
 * (`accept_submission`…), qui vérifient le rôle elles-mêmes.
 *
 * Les noms de la base sont en anglais (`field_submissions`, `campuses`, `geo_divisions`…) : ce fichier est,
 * avec ses voisins, le seul à les connaître. Les ports et les écrans parlent français.
 */
export function creerPortAdministration(supabase: () => SupabaseClient): PortAdministration {
  return {
    async suisAdmin() {
      const { data, error } = await supabase().rpc('est_admin');
      traduire(error);
      return data === true;
    },

    // À valider ---------------------------------------------------------------------------------

    async relevesAValider() {
      const lignes = lireListe<LigneFile>(
        await supabase()
          .from('submissions_to_review')
          .select('*')
          .order('received_at', { ascending: true })
          .order('id'),
      );
      return lignes.map(versFile);
    },

    async detailReleve(id): Promise<DetailReleve> {
      const [detail, file] = await Promise.all([
        supabase().from('field_submissions').select(COLONNES_DETAIL).eq('id', id).single(),
        supabase().from('submissions_to_review').select('*').eq('id', id).maybeSingle(),
      ]);
      const r = lire(detail) as unknown as LigneDetail;
      const ligneFile = file.data as LigneFile | null;
      const nombrePhotos =
        ligneFile?.photos ??
        (await supabase()
          .from('field_submission_photos')
          .select('id', { count: 'exact', head: true })
          .eq('submission_id', id)).count ??
        0;
      return {
        id: r.id,
        recuLe: r.received_at,
        prisLe: r.taken_at,
        type: r.kind,
        nomEnseigne: r.sign_name,
        relais: r.relais?.prenom ?? '',
        lot: r.lots?.nom ?? null,
        essai: r.lots?.essai ?? false,
        horsLot: r.outside_batch,
        enZoneOuverte: r.in_open_zone,
        doublonPossible: r.possible_duplicate,
        reponseDoublon: r.duplicate_answer,
        precisionM: r.accuracy_m,
        photos: nombrePhotos,
        enseigneRecue: ligneFile?.signboard_received ?? nombrePhotos > 0,
        indiceFormations: r.observed_programs !== null || r.programs_photographed,
        contactRecu: ligneFile?.contact_received ?? false,
        position: lirePoint(r.position),
        niveaux: niveauxConnus(r.levels),
        typeEcole: typeConnu(r.school_kind),
        programme: r.curriculum_note,
        programmesVus: r.observed_programs,
        programmesEnPhoto: r.programs_photographed,
        repere: r.landmark,
        numeroEnseigne: r.sign_phone,
        direction: r.direction_seen,
        repasser: r.come_back_note,
        doublonDe: r.doublon
          ? {
              id: r.doublon.id,
              nom: [r.doublon.institutions?.name, r.doublon.label].filter(Boolean).join(' — '),
            }
          : null,
        corrigeReleveId: r.corrects_submission_id,
        contactConfirmeLe: r.contact_confirmed_at,
        contactFonction: r.contact_role,
        essaiValideLe: r.trial_validated_at,
        campusId: r.campus_id,
        campusNom: r.campus
          ? [r.campus.institutions?.name, r.campus.label].filter(Boolean).join(' — ')
          : null,
        divisionNom: r.campus?.geo_divisions?.name ?? null,
        campusPublie: r.campus?.publication === 'publiee',
      };
    },

    async photosReleve(id): Promise<PhotoVue[]> {
      const lignes = lireListe<{
        id: string;
        role: Valeur<'photo_role'>;
        storage_path: string;
        bytes: number;
        width: number | null;
        height: number | null;
        taken_at: string | null;
        child_free_checked_at: string | null;
      }>(
        await supabase()
          .from('field_submission_photos')
          .select('id, role, storage_path, bytes, width, height, taken_at, child_free_checked_at')
          .eq('submission_id', id)
          .order('received_at')
          .order('id'),
      );
      if (lignes.length === 0) return [];
      // Une adresse temporaire par photo (une heure) : le seau est privé, rien n'est jamais public d'office.
      const { data: adresses } = await supabase()
        .storage.from(SEAU_PHOTOS)
        .createSignedUrls(
          lignes.map((l) => l.storage_path),
          3600,
        );
      const parChemin = new Map((adresses ?? []).map((a) => [a.path, a.signedUrl]));
      return lignes.map((l) => ({
        id: l.id,
        role: l.role,
        adresse: parChemin.get(l.storage_path) ?? null,
        octets: l.bytes,
        largeur: l.width,
        hauteur: l.height,
        prisLe: l.taken_at,
        publiable: l.child_free_checked_at !== null,
      }));
    },

    async contactReleve(id): Promise<ContactDirection | null> {
      const lignes = lireListe<{
        role: Valeur<'fonction_direction'> | null;
        name: string | null;
        whatsapp: string | null;
        contact_agreement: boolean;
        agreement_at: string | null;
        said_note: string | null;
        received_at: string;
      }>(await supabase().rpc('contact_of_submission', { p_submission: id }));
      const c = lignes[0];
      return c
        ? {
            fonction: c.role,
            nom: c.name,
            whatsapp: c.whatsapp,
            accord: c.contact_agreement,
            accordLe: c.agreement_at,
            note: c.said_note,
            recuLe: c.received_at,
          }
        : null;
    },

    async accepter(id, decision: DecisionAcceptation = {}) {
      const { data, error } = await supabase().rpc('accept_submission', {
        p_submission: id,
        p_mode: decision.mode ?? null,
        p_campus: decision.campusId ?? null,
        p_institution: decision.institutionId ?? null,
        p_label: decision.etiquette ?? null,
        p_programs: (decision.formations ?? []).map((f) => versProgramme(f)),
      });
      decider(error);
      return data as string;
    },

    async demanderCorrection(id, motif, message) {
      const { error } = await supabase().rpc('request_correction', {
        p_submission: id,
        p_reason: motif,
        p_message: message,
      });
      decider(error);
    },

    async refuser(id, motif, message) {
      const { error } = await supabase().rpc('refuse_submission', {
        p_submission: id,
        p_reason: motif,
        p_message: message,
      });
      decider(error);
    },

    async confirmerContact(id, fonction) {
      const { error } = await supabase().rpc('confirm_contact', {
        p_submission: id,
        p_role: fonction,
      });
      decider(error);
    },

    async validerEssai(id) {
      const { error } = await supabase().rpc('validate_trial_submission', { p_submission: id });
      decider(error);
    },

    async relevesDecides(): Promise<ReleveDecide[]> {
      const lignes = lireListe<{
        id: string;
        sign_name: string;
        kind: Valeur<'type_releve'>;
        status: Valeur<'statut_releve'>;
        decided_at: string | null;
        reason: Valeur<'motif_decision'> | null;
        message_to_relay: string | null;
        relais: { prenom: string } | null;
        lots: { nom: string } | null;
      }>(
        await supabase()
          .from('field_submissions')
          .select(
            'id, sign_name, kind, status, decided_at, reason, message_to_relay, relais(prenom), lots(nom)',
          )
          .neq('status', 'a_valider')
          .order('decided_at', { ascending: false, nullsFirst: false })
          .order('id')
          .limit(200),
      );
      return lignes.map((r) => ({
        id: r.id,
        nomEnseigne: r.sign_name,
        relais: r.relais?.prenom ?? '',
        lot: r.lots?.nom ?? null,
        type: r.kind,
        statut: r.status,
        decideLe: r.decided_at,
        motif: r.reason,
        messageAuRelais: r.message_to_relay,
      }));
    },

    async effacerContact(releveId, note) {
      const { error } = await supabase().rpc('erase_contact', {
        p_submission: releveId,
        p_note: note,
      });
      decider(error);
    },

    async effacerPhoto(photoId, note) {
      // Le fichier d'abord, puis la ligne : si le fichier part et que la ligne reste (réseau coupé), on recommence ;
      // l'inverse laisserait un fichier sans trace, et ce serait l'effacement demandé qui échouerait en silence.
      const ligne = lire(
        await supabase()
          .from('field_submission_photos')
          .select('storage_path')
          .eq('id', photoId)
          .single(),
      ) as unknown as { storage_path: string };
      const { error: erreurFichier } = await supabase()
        .storage.from(SEAU_PHOTOS)
        .remove([ligne.storage_path]);
      decider(erreurFichier ? { message: erreurFichier.message, statusCode: '500' } : null);
      const { error } = await supabase().rpc('erase_photo', { p_photo: photoId, p_note: note });
      decider(error);
    },

    async marquerPhotoPubliable(photoId, publiable) {
      // « Publiable » : l'administration a regardé la photo (pas d'enfant, ni nom ni numéro de personne). La mise en
      // ligne d'une photo est un autre geste : ici elle reste privée.
      const { data, error } = await supabase()
        .from('field_submission_photos')
        .update({
          child_free_checked_at: publiable ? new Date().toISOString() : null,
          is_public: false,
        })
        .eq('id', photoId)
        .select('id');
      decider(error);
      if (!data || data.length === 0) throw new ErreurDecision('Photo introuvable.');
    },

    // Relais, lots, zones ----------------------------------------------------------------------------

    async relais(): Promise<RelaisVu[]> {
      const [relais, compteurs] = await Promise.all([
        supabase()
          .from('relais')
          .select('id, prenom, statut, lot_id, cree_le, active_le')
          .order('cree_le', { ascending: false })
          .order('id'),
        supabase()
          .from('relay_counters')
          .select('relay_id, sent, to_review, to_correct, accepted, refused, contacts_confirmed'),
      ]);
      const parRelais = new Map<string, CompteursRelais>();
      for (const c of lireListe<{
        relay_id: string;
        sent: number;
        to_review: number;
        to_correct: number;
        accepted: number;
        refused: number;
        contacts_confirmed: number;
      }>(compteurs)) {
        parRelais.set(c.relay_id, {
          envoyees: c.sent,
          aValider: c.to_review,
          aCorriger: c.to_correct,
          acceptees: c.accepted,
          refusees: c.refused,
          contactsConfirmes: c.contacts_confirmed,
        });
      }
      return lireListe<{
        id: string;
        prenom: string;
        statut: Valeur<'statut_relais'>;
        lot_id: string | null;
        cree_le: string;
        active_le: string | null;
      }>(relais).map((r) => {
        const compteurs = parRelais.get(r.id) ?? {
          envoyees: 0,
          aValider: 0,
          aCorriger: 0,
          acceptees: 0,
          refusees: 0,
          contactsConfirmes: 0,
        };
        return {
          id: r.id,
          prenom: r.prenom,
          statut: r.statut,
          lotId: r.lot_id,
          creeLe: r.cree_le,
          activeLe: r.active_le,
          fiches: compteurs.envoyees,
          compteurs,
        };
      });
    },

    async lots(): Promise<LotVu[]> {
      const lignes = lireListe<{
        id: string;
        nom: string;
        essai: boolean;
        a_rendre_le: string | null;
        geo_division_id: string;
        geo_divisions: { name: string; path: string } | null;
      }>(
        await supabase()
          .from('lots')
          .select('id, nom, essai, a_rendre_le, geo_division_id, geo_divisions(name, path)')
          .order('essai')
          .order('nom'),
      );
      return lignes.map((l) => ({
        id: l.id,
        nom: l.nom,
        essai: l.essai,
        aRendreLe: l.a_rendre_le,
        divisionId: l.geo_division_id,
        divisionNom: l.geo_divisions?.name ?? '',
        divisionChemin: l.geo_divisions?.path ?? '',
      }));
    },

    async creerLot(nom, divisionId, aRendreLe, essai) {
      const { data, error } = await supabase().rpc('create_lot', {
        p_name: nom,
        p_division: divisionId,
        p_due: aRendreLe,
        p_trial: essai,
      });
      // Un nom de lot déjà pris (23505) ou une division interdite (22023) : la base le dit en français.
      decider(error);
      return data as string;
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

    async divisions(): Promise<DivisionVue[]> {
      const [divisions, stats] = await Promise.all([
        toutesLesLignes<{
          id: string;
          parent_id: string | null;
          level: number;
          kind: Valeur<'geo_kind'>;
          name: string;
          slug: string;
          path: string;
          open_for_fieldwork: boolean;
        }>((de, a) =>
          supabase()
            .from('geo_divisions')
            .select('id, parent_id, level, kind, name, slug, path, open_for_fieldwork')
            .order('path')
            .range(de, a),
        ),
        toutesLesLignes<{
          division_id: string;
          path: string;
          campuses: number;
          published: number;
          from_field: number;
          from_admin: number;
          from_import: number;
        }>((de, a) =>
          supabase()
            .from('division_stats')
            .select('division_id, path, campuses, published, from_field, from_admin, from_import')
            .order('path')
            .range(de, a),
        ),
      ]);
      // Ce que contient une division, c'est elle et tout ce qui est dessous.
      return divisions.map((d) => {
        const dessous = stats.filter((s) => s.path === d.path || s.path.startsWith(`${d.path}.`));
        const somme = (cle: 'campuses' | 'published' | 'from_field' | 'from_admin' | 'from_import') =>
          dessous.reduce((n, s) => n + s[cle], 0);
        return {
          id: d.id,
          parentId: d.parent_id,
          niveau: d.level,
          genre: d.kind,
          nom: d.name,
          slug: d.slug,
          chemin: d.path,
          ouverte: d.open_for_fieldwork,
          ecoles: somme('campuses'),
          publiees: somme('published'),
          relevees: somme('from_field'),
          ajoutees: somme('from_admin'),
          importees: somme('from_import'),
        };
      });
    },

    async ouvrirZone(divisionId, ouverte) {
      const { error } = await supabase().rpc('set_division_open', {
        p_division: divisionId,
        p_open: ouverte,
      });
      decider(error);
    },

    async ajouterDivision(parentId, genre, nom, adresse) {
      const parent = lire(
        await supabase().from('geo_divisions').select('level').eq('id', parentId).single(),
      ) as unknown as { level: number };
      const { data, error } = await supabase()
        .from('geo_divisions')
        .insert({
          parent_id: parentId,
          level: parent.level + 1,
          kind: genre,
          name: nom.trim(),
          slug: adresse.trim(),
        })
        .select('id')
        .single();
      // Un nom ou une adresse déjà pris sous ce parent (23505), un genre qui ne va pas à ce niveau (23514).
      if (error?.code === '23514') {
        throw new ErreurDecision(
          'La base refuse cette division : vérifie le genre (un quartier est sous un arrondissement) et l’adresse (lettres minuscules, chiffres et tirets).',
        );
      }
      decider(error);
      return (data as { id: string }).id;
    },

    // Écoles -------------------------------------------------------------------------------------------

    async domaines() {
      const lignes = lireListe<{ slug: string; name: string; sort_order: number }>(
        await supabase().from('education_domains').select('slug, name, sort_order').order('sort_order').order('id'),
      );
      return lignes.map((l) => ({ slug: l.slug, nom: l.name, ordre: l.sort_order }));
    },

    async ecoles(): Promise<EcoleVue[]> {
      const lignes = await toutesLesLignes<LigneCampus>((de, a) =>
        supabase().from('campuses').select(COLONNES_CAMPUS).order('id').range(de, a),
      );
      return lignes
        .map(versEcole)
        .sort((x, y) => x.nom.localeCompare(y.nom, 'fr') || (x.etiquette ?? '').localeCompare(y.etiquette ?? '', 'fr'));
    },

    async institutions(): Promise<InstitutionVue[]> {
      const lignes = await toutesLesLignes<{
        id: string;
        name: string;
        kind: string;
        campuses: {
          id: string;
          label: string | null;
          publication: Valeur<'publication'>;
          geo_divisions: { name: string } | null;
        }[];
      }>((de, a) =>
        supabase()
          .from('institutions')
          .select('id, name, kind, campuses(id, label, publication, geo_divisions(name))')
          .order('id')
          .range(de, a),
      );
      return lignes
        .map((i) => ({
          id: i.id,
          nom: i.name,
          genre: typeConnu(i.kind),
          campus: i.campuses.map((c) => ({
            id: c.id,
            etiquette: c.label,
            division: c.geo_divisions?.name ?? null,
            publication: c.publication,
          })),
        }))
        .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    },

    async creerEcole(entree): Promise<ResultatCreation> {
      const { data, error } = await supabase().rpc('create_catalog_entry', {
        p_entry: versEntree(entree),
        p_origin: 'admin',
      });
      decider(error);
      const r = data as {
        status: 'created' | 'exists';
        institution_id?: string;
        campus_ids?: string[];
        message?: string;
      };
      return {
        statut: r.status === 'created' ? 'creee' : 'existe',
        institutionId: r.institution_id ?? null,
        campusIds: r.campus_ids ?? [],
        message: r.message ?? null,
      };
    },

    async importerEcoles(entrees, simulation): Promise<RapportImport> {
      const { data, error } = await supabase().rpc('import_catalog', {
        p_entries: entrees.map(versEntree),
        p_dry_run: simulation,
        p_origin: 'import',
      });
      decider(error);
      const r = data as {
        dry_run: boolean;
        total: number;
        created: number;
        exists: number;
        errors: { line: number; name: string | null; message: string }[];
      };
      return {
        simulation: r.dry_run,
        total: r.total,
        creees: r.created,
        existantes: r.exists,
        erreurs: r.errors.map((e) => ({ ligne: e.line, nom: e.name, message: e.message })),
      };
    },

    async confierEcole(ecoleId, relaisId, genre, note) {
      const { error } = await supabase().rpc('assign_mission', {
        p_campus: ecoleId,
        p_relay: relaisId,
        p_kind: genre,
        p_note: note,
      });
      decider(error);
    },

    async reprendreEcole(ecoleId) {
      const { error } = await supabase().rpc('cancel_mission', { p_campus: ecoleId });
      decider(error);
    },

    async modifierEcole(ecoleId, correction) {
      // Seulement ce qui a changé : le reste de la fiche, et sa date de relevé, ne sont pas touchés.
      // Le nom et le genre sont ceux de l'institution (tous ses campus) ; le reste est celui du campus.
      const campus: Record<string, unknown> = {};
      if (correction.programme !== undefined) campus['curriculum_note'] = correction.programme;
      if (correction.repere !== undefined) campus['landmark'] = correction.repere;
      if (correction.numeroEnseigne !== undefined) campus['sign_phone'] = correction.numeroEnseigne;
      const institution: Record<string, unknown> = {};
      if (correction.nom !== undefined) institution['name'] = correction.nom;
      if (correction.typeEcole !== undefined) institution['kind'] = correction.typeEcole;

      const refus = () =>
        new ErreurDecision('La base refuse une valeur : vérifie le nom, le programme, le repère et le numéro.');
      let institutionId: string | null = null;
      if (Object.keys(institution).length > 0 || Object.keys(campus).length > 0) {
        const ligne = await supabase()
          .from('campuses')
          .select('institution_id')
          .eq('id', ecoleId)
          .maybeSingle();
        decider(ligne.error);
        institutionId = (ligne.data as { institution_id: string } | null)?.institution_id ?? null;
        // Aucune ligne : le campus n'existe pas, ou ce compte n'a pas le droit de le voir.
        if (institutionId === null) throw new ErreurDecision('École introuvable, ou modification refusée.');
      }
      if (Object.keys(campus).length > 0) {
        const { error } = await supabase().from('campuses').update(campus).eq('id', ecoleId);
        if (error?.code === '23514') throw refus();
        decider(error);
      }
      if (institutionId !== null && Object.keys(institution).length > 0) {
        const { error } = await supabase().from('institutions').update(institution).eq('id', institutionId);
        if (error?.code === '23514') throw refus();
        decider(error);
      }
      if (correction.niveaux !== undefined) {
        // Les cycles du campus : on ajoute ceux qui manquent, on retire ceux qui ne sont plus dans la liste
        // (avec leurs formations : l'écran prévient avant).
        const voulus = correction.niveaux;
        const { error: erreurAjout } = await supabase()
          .from('campus_cycles')
          .upsert(
            voulus.map((cycle) => ({ campus_id: ecoleId, cycle })),
            { onConflict: 'campus_id,cycle', ignoreDuplicates: true },
          );
        decider(erreurAjout);
        const enTrop = supabase().from('campus_cycles').delete().eq('campus_id', ecoleId);
        const { error: erreurRetrait } =
          voulus.length > 0 ? await enTrop.not('cycle', 'in', `(${voulus.join(',')})`) : await enTrop;
        decider(erreurRetrait);
      }
    },

    async situerEcole(ecoleId, position, divisionId = null) {
      const { data, error } = await supabase().rpc('locate_campus', {
        p_campus: ecoleId,
        p_latitude: position.latitude,
        p_longitude: position.longitude,
        p_division: divisionId,
      });
      // La base dit en français si la position est dans une autre division que la fiche, ou dans aucune connue.
      decider(error);
      return typeof data === 'string' ? data : '';
    },

    async publierEcole(ecoleId) {
      const { error } = await supabase().rpc('publish_campus', { p_campus: ecoleId });
      decider(error);
    },

    async publierDivision(divisionId) {
      const { data, error } = await supabase().rpc('publish_division', { p_division: divisionId });
      decider(error);
      return Number(data ?? 0);
    },

    async publierLot(lotId) {
      const { data, error } = await supabase().rpc('publish_batch', { p_batch: lotId });
      decider(error);
      return Number(data ?? 0);
    },

    async retirerEcole(ecoleId, motif, note) {
      const { error } = await supabase().rpc('retire_campus', {
        p_campus: ecoleId,
        p_reason: motif,
        p_note: note,
      });
      decider(error);
    },

    async fusionnerEcoles(doublonId, gardeeId) {
      const { error } = await supabase().rpc('merge_campuses', {
        p_duplicate: doublonId,
        p_kept: gardeeId,
      });
      decider(error);
    },

    // Pont avec la direction -----------------------------------------------------------------------------

    async enregistrerVerification(campusId, accordLe, fonction, canal, note) {
      const { error } = await supabase().rpc('record_verification', {
        p_campus: campusId,
        p_agreed_on: accordLe.slice(0, 10),
        p_role: fonction,
        p_channel: canal,
        p_note: note,
      });
      decider(error);
    },

    async noterMessageEnvoye(campusId) {
      // Une date, jamais le contenu du message. Le premier message ne se réécrit pas : un second appel ne change rien.
      const jour = new Date().toISOString().slice(0, 10);
      const { error } = await supabase()
        .from('echanges')
        .upsert({ campus_id: campusId }, { onConflict: 'campus_id', ignoreDuplicates: true });
      decider(error);
      const { error: erreurDate } = await supabase()
        .from('echanges')
        .update({ premier_message_le: jour })
        .eq('campus_id', campusId)
        .is('premier_message_le', null);
      decider(erreurDate);
    },

    // La paie --------------------------------------------------------------------------------------------

    async apercuPaie(vendredi): Promise<LignePaie[]> {
      const lignes = lireListe<{
        relay_id: string;
        first_name: string;
        submissions: number;
        contacts: number;
        trial_bundles: number;
        total_xaf: number;
        has_payment_details: boolean;
      }>(await supabase().rpc('payout_preview', { p_friday: vendredi }));
      return lignes.map((l) => ({
        relaisId: l.relay_id,
        prenom: l.first_name,
        fiches: l.submissions,
        contacts: l.contacts,
        essais: l.trial_bundles,
        totalXaf: entier(l.total_xaf),
        numeroConnu: l.has_payment_details,
      }));
    },

    async cloturerPaie(vendredi) {
      const { data, error } = await supabase().rpc('close_payout_week', { p_friday: vendredi });
      decider(error);
      return data as string;
    },

    async semainesPaie(): Promise<SemainePaie[]> {
      const [semaines, paiements] = await Promise.all([
        supabase().from('payout_batches').select('id, friday').order('friday', { ascending: false }).limit(60),
        toutesLesLignes<{ batch_id: string; relay_id: string; total_xaf: number; paid_at: string | null }>(
          (de, a) =>
            supabase()
              .from('payout_statements')
              .select('batch_id, relay_id, total_xaf, paid_at')
              .order('batch_id')
              .order('relay_id')
              .range(de, a),
        ),
      ]);
      return lireListe<{ id: string; friday: string }>(semaines).map((s) => {
        const siens = paiements.filter((p) => p.batch_id === s.id);
        return {
          id: s.id,
          vendredi: s.friday,
          totalXaf: siens.reduce((n, p) => n + entier(p.total_xaf), 0),
          relais: siens.length,
          payes: siens.filter((p) => p.paid_at !== null).length,
        };
      });
    },

    async paiementsDeLaSemaine(semaineId): Promise<PaiementVu[]> {
      const lignes = lireListe<{
        relay_id: string;
        first_name: string;
        total_xaf: number;
        submissions: number;
        contacts: number;
        trial_bundles: number;
        operator: string | null;
        msisdn: string | null;
        paid_at: string | null;
        reference: string | null;
      }>(await supabase().rpc('payout_statements_of', { p_batch: semaineId }));
      return lignes.map((l) => ({
        relaisId: l.relay_id,
        prenom: l.first_name,
        totalXaf: entier(l.total_xaf),
        fiches: l.submissions,
        contacts: l.contacts,
        essais: l.trial_bundles,
        operateur: l.operator,
        numero: l.msisdn,
        payeLe: l.paid_at,
        reference: l.reference,
      }));
    },

    async noterPaye(semaineId, relaisId, reference) {
      const { error } = await supabase().rpc('mark_statement_paid', {
        p_batch: semaineId,
        p_relay: relaisId,
        p_reference: reference,
      });
      decider(error);
    },

    async enregistrerMobileMoney(relaisId, operateur, numero) {
      const { error } = await supabase().rpc('set_relay_payment_details', {
        p_relay: relaisId,
        p_operator: operateur,
        p_msisdn: numero,
      });
      decider(error);
    },
  };
}
