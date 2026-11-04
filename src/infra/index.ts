/**
 * Le seul point d'entrée de src/infra/ pour les écrans : il branche les ports
 * sur Supabase, ou sur le faux serveur des parcours Playwright
 * (`PUBLIC_ADAPTATEUR=faux` à la construction).
 */
import {
  PUBLIC_ADAPTATEUR,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_URL,
} from 'astro:env/client';
import { construireArbre, type ArbrePublic } from '../modele/geo-divisions';
import type {
  DivisionPublique,
  DomainePublic,
  EcolePubliee,
  PortAdministration,
  PortCatalogue,
  PortRelais,
  PortSession,
  Redirection,
} from '../modele/ports';
import {
  facettesPubliques,
  ligneDe,
  type LigneRecherche,
  type ValeurFacette,
} from '../modele/recherche';

export interface Adaptateurs {
  nom: 'supabase' | 'faux';
  session: PortSession;
  relais: PortRelais;
  admin: PortAdministration;
}

let adaptateurs: Promise<Adaptateurs> | null = null;

/** Chargés à la demande : la page n'emporte le client Supabase que si elle s'en sert. */
export function obtenirAdaptateurs(): Promise<Adaptateurs> {
  adaptateurs ??=
    PUBLIC_ADAPTATEUR === 'faux'
      ? import('./faux/index').then((m) => m.faux)
      : Promise.all([
          import('./supabase/client'),
          import('./supabase/session'),
          import('./supabase/relais'),
          import('./supabase/administration'),
        ]).then(([c, s, r, a]): Adaptateurs => ({
          nom: 'supabase',
          session: s.session,
          relais: r.creerPortRelais(c.supabase),
          admin: a.creerPortAdministration(c.supabase),
        }));
  return adaptateurs;
}

/**
 * Le catalogue du site public, lu à la construction. Sans adresse de base (une
 * construction de vérification, sans valeurs du dépôt), il est vide.
 */
export async function obtenirCatalogue(): Promise<PortCatalogue> {
  if (PUBLIC_ADAPTATEUR === 'faux') return (await import('./faux/catalogue')).catalogueFaux;
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return {
      divisions: async () => [],
      ecoles: async () => [],
      domaines: async () => [],
      redirections: async () => [],
    };
  }
  const { creerCatalogue } = await import('./supabase/catalogue');
  return creerCatalogue(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** Le site public tel que les pages le lisent : le catalogue, son arbre géographique, ses facettes et son fichier de recherche. */
export interface Site {
  /** Toutes les divisions du pays, avec ou sans école (la carte de la ville y lit celles où le relevé a commencé). */
  divisions: DivisionPublique[];
  arbre: ArbrePublic;
  ecoles: EcolePubliee[];
  domaines: DomainePublic[];
  redirections: Redirection[];
  facettes: ValeurFacette[];
  recherche: LigneRecherche[];
}

let site: Promise<Site> | null = null;

/**
 * Lu une seule fois par construction : chaque page lui demande, et le catalogue n'est lu qu'une fois sur le
 * réseau. Les pages publiques n'appellent jamais la base ailleurs que par ici, à la construction.
 */
export function obtenirSite(): Promise<Site> {
  site ??= (async () => {
    const catalogue = await obtenirCatalogue();
    const [divisions, ecoles, domaines, redirections] = await Promise.all([
      catalogue.divisions(),
      catalogue.ecoles(),
      catalogue.domaines(),
      catalogue.redirections(),
    ]);
    return {
      divisions,
      arbre: construireArbre(divisions, ecoles),
      ecoles,
      domaines,
      redirections,
      facettes: facettesPubliques(ecoles, domaines),
      recherche: ecoles.map(ligneDe),
    };
  })();
  return site;
}

const photosPubliques = new Map<string, Promise<Uint8Array>>();
/** Octets autorisés seulement, à la construction ; aucune URL privée dans le HTML public. */
export function obtenirPhotoPublique(id: string): Promise<Uint8Array> {
  let photo = photosPubliques.get(id);
  if (!photo) {
    photo = (async () => {
      const c = await obtenirCatalogue();
      if (!c.lirePhotoPublique) throw new Error('Lecture de photo publique indisponible.');
      return c.lirePhotoPublique(id);
    })();
    if (photosPubliques.size >= 32) photosPubliques.delete(photosPubliques.keys().next().value!);
    photosPubliques.set(id, photo);
  }
  return photo;
}
