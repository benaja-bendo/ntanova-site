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
  AncienneAdresse,
  Redirection,
} from '../modele/ports';
import {
  facettesPubliques,
  lignesDeRecherche,
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
      anciennesAdresses: async () => [],
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
  /** Les anciennes adresses des fiches publiées (ticket 147) : chacune renvoie vers la fiche. */
  anciennesAdresses: AncienneAdresse[];
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
    const [divisions, ecoles, domaines, redirections, anciennesAdresses] = await Promise.all([
      catalogue.divisions(),
      catalogue.ecoles(),
      catalogue.domaines(),
      catalogue.redirections(),
      catalogue.anciennesAdresses(),
    ]);
    return {
      divisions,
      arbre: construireArbre(divisions, ecoles),
      ecoles,
      domaines,
      redirections,
      anciennesAdresses,
      facettes: facettesPubliques(ecoles, domaines),
      recherche: lignesDeRecherche(ecoles, divisions),
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

/** v2 (13/11) : les octets d'une image publique d'une école (logo, couverture, galerie, nouvelle), à la construction. */
export async function obtenirMedia(id: string, miniature: boolean): Promise<Uint8Array> {
  const c = await obtenirCatalogue();
  if (!c.lireMedia) throw new Error('Lecture des images publiques indisponible.');
  return c.lireMedia(id, miniature);
}

/**
 * Lot 4 (16/11/2026) : où une page publique envoie « Demander la vérification », la demande d'une famille comptée sans nom ni
 * numéro (`count_family_demand`, lot 1). Le petit script de la fiche poste à cette adresse avec la clé publique ; sous le faux
 * serveur, il répond lui-même ; sans adresse de base, la fiche n'a pas le bouton.
 */
export function pointDesDemandes(): { url: string; cle: string } | 'faux' | null {
  if (PUBLIC_ADAPTATEUR === 'faux') return 'faux';
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  return {
    url: new URL('/rest/v1/rpc/count_family_demand', PUBLIC_SUPABASE_URL).href,
    cle: PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

// Refonte publique, lot 3C : les formulaires Contact et annuaire. Réexporté d'un module à part, sans rien d'autre : le script
// d'une page publique n'emporte que lui (10 Ko gzip au plus, `pnpm poids`).
export { obtenirPortDemandes, pointDesEnvois } from './demandes-publiques';
