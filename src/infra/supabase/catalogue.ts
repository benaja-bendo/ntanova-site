import type { AgrementPublic } from '../../modele/agrement';
import type { Equipement } from '../../modele/equipements-ecole';
import { versEquipement, type LigneEquipement } from './equipements';
import type { FraisEcole } from '../../modele/frais-ecole';
import { versFrais, type LigneFrais } from './frais';
import type { MultiPolygone } from '../../modele/geo';
import { sansRepetition } from '../../modele/geo-divisions';
import type { DateInscription } from '../../modele/inscriptions';
import { listes } from '../../modele/listes';
import type { AdmissionPublique, MediaPublic, MediasEcole, NouvellePublique } from '../../modele/vitrine';
import { niveauxConnus, typeConnu, type Valeur } from '../../modele/listes';
import type {
  DivisionPublique,
  DomainePublic,
  EcolePubliee,
  FormationPublique,
  PortCatalogue,
  AncienneAdresse,
  Redirection,
} from '../../modele/ports';

const TAILLE_PAGE = 1000;

interface LigneAgrementPublic {
  campus_id: string;
  program_id: string | null;
  kind: AgrementPublic['genre'];
  custom_kind: string | null;
  reference: string;
  issued_on: string;
  source_label: string;
  source_url: string | null;
  evidence?: 'photo' | 'document_vu' | 'dit_ecole' | null;
}

/**
 * Le catalogue lu à la construction, par l'API publique de la base (clé `publishable`, droits d'un visiteur :
 * seulement ce qui est publié). Une erreur arrête la construction : mieux vaut garder l'ancien site qu'en
 * publier un vide.
 *
 * Les noms de la base sont en anglais (`geo_divisions`, `public_campuses`…) : ce fichier est, avec ses voisins,
 * le seul à les connaître.
 */
export function creerCatalogue(url: string, cle: string): PortCatalogue {
  /** Toutes les lignes d'une lecture, page après page (l'API plafonne chaque réponse). Le chemin trie sur une clé unique. */
  const lireTout = async <T>(chemin: string): Promise<T[]> => {
    const tout: T[] = [];
    for (let decalage = 0; ; decalage += TAILLE_PAGE) {
      const reponse = await fetch(
        `${url}/rest/v1/${chemin}${chemin.includes('?') ? '&' : '?'}limit=${TAILLE_PAGE}&offset=${decalage}`,
        { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
      );
      if (!reponse.ok) throw new Error(`Catalogue illisible (${reponse.status}) : ${chemin}`);
      const lignes = (await reponse.json()) as T[];
      tout.push(...lignes);
      if (lignes.length < TAILLE_PAGE) return tout;
    }
  };

  // Les divisions sont lues une fois : les campus s'y rattachent, et les redirections y retrouvent leurs adresses.
  let divisions: Promise<DivisionPublique[]> | null = null;
  const lireDivisions = (): Promise<DivisionPublique[]> =>
    (divisions ??= (async () => {
      const lignes = await lireTout<{
        id: string;
        parent_id: string | null;
        level: number;
        kind: Valeur<'geo_kind'>;
        name: string;
        slug: string;
        ordinal: number | null;
        aliases: string[];
        verified_on: string | null;
        open_for_fieldwork: boolean;
        public_status: 'actif' | 'programme' | null;
        position: { type: 'Point'; coordinates: [number, number] } | null;
        boundary: { type: 'MultiPolygon'; coordinates: MultiPolygone } | null;
      }>('geo_divisions?select=id,parent_id,level,kind,name,slug,ordinal,aliases,verified_on,open_for_fieldwork,public_status,position,boundary&order=id');
      const parId = new Map(lignes.map((l) => [l.id, l]));
      const adresse = (l: (typeof lignes)[number]): string[] => {
        const parent = l.parent_id ? parId.get(l.parent_id) : undefined;
        return [...(parent ? adresse(parent) : []), l.slug];
      };
      return lignes
        .map((l) => ({
          id: l.id,
          parentId: l.parent_id,
          niveau: l.level,
          genre: l.kind,
          nom: l.name,
          slug: l.slug,
          adresse: adresse(l),
          ordinal: l.ordinal,
          alias: l.aliases,
          verifieeLe: l.verified_on,
          ouverte: l.open_for_fieldwork,
          deploiement: l.public_status ?? null,
          position: l.position
            ? { longitude: l.position.coordinates[0], latitude: l.position.coordinates[1] }
            : null,
          contour: l.boundary?.type === 'MultiPolygon' ? l.boundary.coordinates : null,
        }))
        .sort((a, b) => a.niveau - b.niveau || a.nom.localeCompare(b.nom, 'fr'));
    })());

  // Le chemin ltree (`congo.pointe_noire.pointe_noire.tie_tie`) n'est pas l'adresse (`pointe-noire`) : on repart de l'arbre.
  const adresseDesChemins = async () => {
    const parChemin = new Map<string, string[]>();
    for (const d of await lireDivisions()) {
      parChemin.set(d.adresse.map((a) => a.replaceAll('-', '_')).join('.'), sansRepetition(d.adresse));
    }
    return (chemin: string) => parChemin.get(chemin) ?? [];
  };

  return {
    async lirePhotoPublique(id) {
      if(!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Photo publique inconnue.');
      const [p]=await lireTout<{storage_path:string}>(`public_campus_photos?select=storage_path&id=eq.${id}`);
      if(!p) throw new Error('Photo non publiée.');
      const r=await fetch(`${url}/storage/v1/object/releves/${p.storage_path}`,{headers:{apikey:cle,Authorization:`Bearer ${cle}`}});
      if(!r.ok) throw new Error(`Photo publique illisible (${r.status}).`);
      return new Uint8Array(await r.arrayBuffer());
    },
    async lireMedia(id, miniature) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Image publique inconnue.');
      // Une image de la galerie, du logo ou de la couverture ; sinon celle d'une nouvelle, servie sous l'identifiant de la nouvelle.
      const [m] = await lireTout<{ storage_path: string; thumb_path: string | null }>(
        `public_campus_media?select=storage_path,thumb_path&id=eq.${id}`,
      );
      const [n] = m
        ? []
        : await lireTout<{ media_path: string | null; media_thumb_path: string | null }>(
            `public_campus_posts?select=media_path,media_thumb_path&id=eq.${id}`,
          );
      const source = m
        ? { plein: m.storage_path, mini: m.thumb_path }
        : n?.media_path
          ? { plein: n.media_path, mini: n.media_thumb_path }
          : null;
      if (!source) throw new Error('Image non publiée.');
      const chemin = (miniature && source.mini) || source.plein;
      const r = await fetch(`${url}/storage/v1/object/releves/${chemin}`, {
        headers: { apikey: cle, Authorization: `Bearer ${cle}` },
      });
      if (!r.ok) throw new Error(`Image publique illisible (${r.status}).`);
      return new Uint8Array(await r.arrayBuffer());
    },
    divisions: lireDivisions,

    async domaines(): Promise<DomainePublic[]> {
      const lignes = await lireTout<{ slug: string; name: string; sort_order: number }>(
        'education_domains?select=slug,name,sort_order&order=sort_order,id',
      );
      return lignes.map((l) => ({ slug: l.slug, nom: l.name, ordre: l.sort_order }));
    },

    async redirections(): Promise<Redirection[]> {
      const lignes = await lireTout<{
        from_division_path: string;
        from_slug: string;
        from_number: number;
        to_number: number;
      }>('public_campus_redirects?select=from_division_path,from_slug,from_number,to_number&order=from_number');
      const adresse = await adresseDesChemins();
      return lignes.map((r) => ({
        de: { chemin: adresse(r.from_division_path), slug: r.from_slug, numero: String(r.from_number) },
        versNumero: String(r.to_number),
      }));
    },

    async anciennesAdresses(): Promise<AncienneAdresse[]> {
      const lignes = await lireTout<{
        former_slug: string;
        former_division_path: string;
        public_number: number;
      }>(
        'public_campus_former_addresses?select=former_slug,former_division_path,public_number&order=public_number,former_slug,former_division_path',
      );
      const adresse = await adresseDesChemins();
      return lignes.map((r) => ({
        chemin: adresse(r.former_division_path),
        slug: r.former_slug,
        numero: String(r.public_number),
      }));
    },

    async ecoles(): Promise<EcolePubliee[]> {
      const [campus, cycles, formations, frais, equipements, photos, agrements, mots, dates, medias, nouvelles, admissions] = await Promise.all([
        lireTout<{
          id: string;
          institution_id: string;
          institution_name: string;
          label: string | null;
          // Tel que la base le dit : une valeur ajoutée depuis la dernière mise en ligne du site est possible,
          // et ne casse ni la construction ni la page.
          kind: string;
          slug: string;
          division_id: string;
          division_slugs: string[];
          division_names: string[];
          neighbourhood: string | null;
          landmark: string | null;
          // Lot G : l'école voisine au même lieu, si elle est publiée (absente d'une base pas encore à jour).
          same_place_name?: string | null;
          same_place_number?: number | null;
          sign_phone: string | null;
          public_phone: string | null;
          public_phone_agreed_on: string | null;
          latitude: number | null;
          longitude: number | null;
          verification_state: EcolePubliee['etat'];
          verified_on: string | null;
          curriculum_note: string | null;
          surveyed_at: string | null;
          located_at: string | null;
          updated_at: string;
          origin: string;
          school_declared_on: string | null;
          public_number: number;
          institution_acronym?: string | null;
          founded_year?: number | null;
          website_url?: string | null;
          shifts?: string[] | null;
          teaching_languages?: string[] | null;
        }>('public_campuses?select=*&order=id'),
        lireTout<{ campus_id: string; cycle: string }>(
          'public_campus_cycles?select=campus_id,cycle&order=campus_id,cycle',
        ),
        lireTout<{
          campus_id: string;
          cycle: Valeur<'niveau'>;
          title: string;
          domain_slug: string | null;
          domain_name: string | null;
          bac_track: Valeur<'bac_track'> | null;
          diploma: Valeur<'diploma_kind'> | null;
          rhythms: Valeur<'study_rhythm'>[];
          program_id: string;
          duration_years?: number | string | null;
          admission_level?: string | null;
          selection?: string | null;
          application_fee_xaf?: number | null;
          diploma_issuer?: string | null;
          details_declared_on?: string | null;
        }>('public_campus_programs?select=*&order=campus_id,cycle,title'),
        lireTout<LigneFrais>('campus_fees?select=*&order=id'),
        lireTout<LigneEquipement>('campus_facts?select=*&order=id'),
        lireTout<{campus_id:string;id:string;taken_at:string|null}>('public_campus_photos?select=campus_id,id,taken_at&order=campus_id'),
        lireTout<LigneAgrementPublic>('public_campus_accreditations?select=*&order=campus_id'),
        lireTout<{ campus_id: string; body: string; stated_on: string }>(
          'public_campus_statements?select=campus_id,body,stated_on&order=campus_id',
        ),
        lireTout<{ id: string; campus_id: string; school_year: string; deadline: string; declared_on: string }>(
          'campus_enrollment_deadlines?select=id,campus_id,school_year,deadline,declared_on&order=campus_id,deadline',
        ),
        lireTout<{
          id: string;
          campus_id: string | null;
          institution_id: string | null;
          kind: string;
          subject: string;
          caption: string | null;
          sort_order: number;
          taken_at: string | null;
        }>('public_campus_media?select=id,campus_id,institution_id,kind,subject,caption,sort_order,taken_at&order=sort_order,id'),
        lireTout<{
          id: string;
          campus_id: string;
          kind: string;
          title: string;
          body: string;
          published_on: string;
          provided_by_school: boolean;
          media_path: string | null;
          media_caption: string | null;
        }>('public_campus_posts?select=id,campus_id,kind,title,body,published_on,provided_by_school,media_path,media_caption&order=published_on.desc,id'),
        lireTout<{
          campus_id: string;
          school_year: string;
          documents: string[];
          where_to_apply: string | null;
          on_site_only: boolean;
          declared_on: string;
          steps: { step: string; starts_on: string; ends_on: string | null }[];
        }>('public_campus_admissions?select=*&order=campus_id,school_year'),
      ]);

      // v2 (13/11) : les images publiques. Une valeur inconnue (ajoutée à la base après la dernière mise en ligne) se lit
      // « autre », jamais une erreur ; le logo appartient à l'école, la couverture et la galerie au site.
      const sujet = (v: string): MediaPublic['sujet'] =>
        (listes.media_subject as readonly string[]).includes(v) ? (v as MediaPublic['sujet']) : 'autre';
      const versMedia = (m: (typeof medias)[number]): MediaPublic => ({
        id: m.id,
        sujet: sujet(m.subject),
        legende: m.caption,
        prisLe: m.taken_at,
      });
      const logoDe = new Map<string, MediaPublic>();
      const mediasDe = new Map<string, MediasEcole>();
      for (const m of medias) {
        if (m.kind === 'logo' && m.institution_id) {
          logoDe.set(m.institution_id, versMedia(m));
          continue;
        }
        if (!m.campus_id) continue;
        const d = mediasDe.get(m.campus_id) ?? { logo: null, couverture: null, galerie: [] };
        if (m.kind === 'cover') d.couverture = versMedia(m);
        else if (m.kind === 'gallery') d.galerie.push(versMedia(m));
        mediasDe.set(m.campus_id, d);
      }
      const nouvellesDe = new Map<string, NouvellePublique[]>();
      const genreNouvelle = (v: string): NouvellePublique['genre'] =>
        (listes.post_kind as readonly string[]).includes(v) ? (v as NouvellePublique['genre']) : 'autre';
      for (const n of nouvelles)
        nouvellesDe.set(n.campus_id, [
          ...(nouvellesDe.get(n.campus_id) ?? []),
          {
            id: n.id,
            genre: genreNouvelle(n.kind),
            titre: n.title,
            texte: n.body,
            publieeLe: n.published_on,
            fournieParLEcole: n.provided_by_school,
            // L'image d'une nouvelle se sert sous l'identifiant de la nouvelle (la vue ne donne pas celui de l'image).
            media: n.media_path
              ? { id: n.id, sujet: 'activite', legende: n.media_caption, prisLe: null }
              : null,
          },
        ]);
      // L'admission la plus récente du site (une par année scolaire) ; ses étapes inconnues se laissent de côté.
      const admissionDe = new Map<string, AdmissionPublique>();
      for (const a of admissions) {
        const etapes = (a.steps ?? [])
          .filter((x) => (listes.admission_step as readonly string[]).includes(x.step))
          .map((x) => ({ etape: x.step as AdmissionPublique['etapes'][number]['etape'], debut: x.starts_on, fin: x.ends_on }));
        const deja = admissionDe.get(a.campus_id);
        if (deja && deja.anneeScolaire.localeCompare(a.school_year) > 0) continue;
        admissionDe.set(a.campus_id, {
          anneeScolaire: a.school_year,
          pieces: a.documents ?? [],
          ouDeposer: a.where_to_apply,
          surPlaceSeulement: a.on_site_only,
          declareeLe: a.declared_on,
          etapes,
        });
      }
      const parmi = <K extends 'study_shift' | 'teaching_language'>(cle: K, valeurs: string[] | null | undefined) =>
        (valeurs ?? []).filter((v): v is (typeof listes)[K][number] => (listes[cle] as readonly string[]).includes(v));
      const selection = (v: string | null | undefined) =>
        v && (listes.selection_kind as readonly string[]).includes(v)
          ? (v as (typeof listes.selection_kind)[number])
          : null;

      const versAgrement = (a: LigneAgrementPublic): AgrementPublic => ({
        genre: a.kind,
        precision: a.custom_kind,
        reference: a.reference,
        delivreLe: a.issued_on,
        sourceTexte: a.source_label,
        sourceLien: a.source_url,
        preuve: a.evidence ?? null,
      });
      const agrementDeLEcole = new Map(
        agrements.filter((a) => a.program_id === null).map((a) => [a.campus_id, versAgrement(a)]),
      );
      const agrementDeLaFiliere = new Map(
        agrements.filter((a) => a.program_id !== null).map((a) => [a.program_id, versAgrement(a)]),
      );
      const motDe = new Map(mots.map((m) => [m.campus_id, { texte: m.body, ditLe: m.stated_on }]));
      const inscriptionsDe = new Map<string, DateInscription[]>();
      for (const d of dates)
        inscriptionsDe.set(d.campus_id, [
          ...(inscriptionsDe.get(d.campus_id) ?? []),
          { id: d.id, anneeScolaire: d.school_year, limite: d.deadline, declareeLe: d.declared_on },
        ]);
      const photosDe=new Map(photos.map(p=>[p.campus_id,{id:p.id,prisLe:p.taken_at}]));
      const cyclesDe = new Map<string, string[]>();
      for (const c of cycles) cyclesDe.set(c.campus_id, [...(cyclesDe.get(c.campus_id) ?? []), c.cycle]);
      const equipementsDe=new Map<string,Equipement[]>();
      for(const e of equipements) equipementsDe.set(e.campus_id,[...(equipementsDe.get(e.campus_id)??[]),versEquipement(e)]);
      const fraisDe = new Map<string, FraisEcole[]>();
      for (const f of frais) fraisDe.set(f.campus_id, [...(fraisDe.get(f.campus_id) ?? []), versFrais(f)]);
      const formationsDe = new Map<string, FormationPublique[]>();
      for (const f of formations) {
        formationsDe.set(f.campus_id, [
          ...(formationsDe.get(f.campus_id) ?? []),
          {
            cycle: f.cycle,
            titre: f.title,
            domaine: f.domain_slug && f.domain_name ? { slug: f.domain_slug, nom: f.domain_name } : null,
            serie: f.bac_track,
            diplome: f.diploma,
            rythmes: f.rhythms,
            agrement: agrementDeLaFiliere.get(f.program_id) ?? null,
            id: f.program_id,
            dureeAnnees: f.duration_years == null ? null : Number(f.duration_years),
            niveauDemande: f.admission_level ?? null,
            selection: selection(f.selection),
            fraisDossier: f.application_fee_xaf ?? null,
            delivrePar: f.diploma_issuer ?? null,
            detailsDitsLe: f.details_declared_on ?? null,
          },
        ]);
      }

      return campus
        .map((e): EcolePubliee => {
          const adresse = sansRepetition(e.division_slugs);
          return {
            id: e.id,
            photo: photosDe.get(e.id)??null,
            agrement: agrementDeLEcole.get(e.id) ?? null,
            motDirection: motDe.get(e.id) ?? null,
            inscriptions: inscriptionsDe.get(e.id) ?? [],
            institutionId: e.institution_id,
            divisionId: e.division_id,
            slug: e.slug,
            numero: String(e.public_number),
            nom: e.institution_name,
            etiquette: e.label,
            // L'arrondissement s'il y en a un (niveau 3 : quatrième adresse), sinon la division la plus fine.
            arrondissement: e.division_slugs[3] ?? adresse[adresse.length - 1] ?? '',
            adresse,
            divisionNoms: sansRepetition(e.division_names),
            quartier: e.neighbourhood,
            typeEcole: typeConnu(e.kind),
            niveaux: niveauxConnus(cyclesDe.get(e.id) ?? []),
            programme: e.curriculum_note,
            formations: formationsDe.get(e.id) ?? [],
            repere: e.landmark,
            memeLieu:
              e.same_place_name && e.same_place_number != null
                ? { nom: e.same_place_name, numero: String(e.same_place_number) }
                : null,
            numeroEnseigne: e.sign_phone,
            frais: fraisDe.get(e.id) ?? [],
            equipements: equipementsDe.get(e.id) ?? [],
            contactPublic: e.public_phone && e.public_phone_agreed_on ? { numero: e.public_phone, accordLe: e.public_phone_agreed_on } : null,
            latitude: e.latitude,
            longitude: e.longitude,
            etat: e.verification_state,
            verifieeLe: e.verified_on,
            releveeLe: e.surveyed_at,
            situeeLe: e.located_at,
            misAJourLe: e.updated_at,
            origine: e.origin,
            declareeLe: e.school_declared_on,
            sigle: e.institution_acronym ?? null,
            fondeeEn: e.founded_year ?? null,
            siteWeb: e.website_url ?? null,
            horaires: parmi('study_shift', e.shifts),
            langues: parmi('teaching_language', e.teaching_languages),
            medias: {
              ...(mediasDe.get(e.id) ?? { couverture: null, galerie: [] }),
              logo: logoDe.get(e.institution_id) ?? null,
            },
            nouvelles: nouvellesDe.get(e.id) ?? [],
            admission: admissionDe.get(e.id) ?? null,
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.slug.localeCompare(b.slug));
    },
  };
}
