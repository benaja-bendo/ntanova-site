import type { Equipement } from '../../modele/equipements-ecole';
import { versEquipement, type LigneEquipement } from './equipements';
import type { FraisEcole } from '../../modele/frais-ecole';
import { versFrais, type LigneFrais } from './frais';
import type { MultiPolygone } from '../../modele/geo';
import { sansRepetition } from '../../modele/geo-divisions';
import { niveauxConnus, typeConnu, type Valeur } from '../../modele/listes';
import type {
  DivisionPublique,
  DomainePublic,
  EcolePubliee,
  FormationPublique,
  PortCatalogue,
  Redirection,
} from '../../modele/ports';

const TAILLE_PAGE = 1000;

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

  return {
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
        to_division_path: string;
        to_slug: string;
      }>('public_campus_redirects?select=*&order=from_division_path,from_slug');
      // Le chemin ltree (`congo.pointe_noire.pointe_noire.tie_tie`) n'est pas l'adresse (`pointe-noire`) : on repart de l'arbre.
      const parChemin = new Map<string, string[]>();
      for (const d of await lireDivisions()) {
        parChemin.set(d.adresse.map((a) => a.replaceAll('-', '_')).join('.'), sansRepetition(d.adresse));
      }
      const adresse = (chemin: string) => parChemin.get(chemin) ?? [];
      return lignes.map((r) => ({
        de: { chemin: adresse(r.from_division_path), slug: r.from_slug },
        vers: { chemin: adresse(r.to_division_path), slug: r.to_slug },
      }));
    },

    async ecoles(): Promise<EcolePubliee[]> {
      const [campus, cycles, formations, frais, equipements] = await Promise.all([
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
        }>('public_campus_programs?select=*&order=campus_id,cycle,title'),
        lireTout<LigneFrais>('campus_fees?select=*&order=id'),
        lireTout<LigneEquipement>('campus_facts?select=*&order=id'),
      ]);

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
          },
        ]);
      }

      return campus
        .map((e): EcolePubliee => {
          const adresse = sansRepetition(e.division_slugs);
          return {
            id: e.id,
            institutionId: e.institution_id,
            divisionId: e.division_id,
            slug: e.slug,
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
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.slug.localeCompare(b.slug));
    },
  };
}
