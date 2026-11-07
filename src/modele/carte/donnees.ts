/**
 * Les données de la carte interactive (ticket 102, décisions du fondateur du 03/11) : deux fichiers GeoJSON construits
 * avec le site, donc le même instantané que les pages.
 *
 * - les **zones** disent leur état public : « relevé en cours » (`actif`) ou « déploiement programmé » (`programme`),
 *   avec des compteurs publics (écoles publiées, vues sur place, confirmées par la direction, dernier passage) ;
 *   aucun seuil du registre, aucun « complet » ;
 * - les **écoles** sont celles qu'un relais a vues sur place (la carte est la vitrine de la preuve de terrain) ;
 *   chacune porte tous ses cycles (l'aperçu les liste) et le plus élevé (le marqueur : sa lettre et sa couleur).
 *
 * Des fonctions pures : les fichiers sont écrits par `src/pages/carte/`.
 */
import { cheminPhotoPublique } from '../photos-publiques';
import { lienDivision, lienEcole, ligneDeLieu, sansRepetition } from '../geo-divisions';
import { etatPublicDe, libelleDeploiement, type EtatDeploiement } from '../etat-zone';
import { libelleNiveau, libelleTypeEcole, typeInformatif } from '../libelles';
import { listes } from '../listes';
import type { MultiPolygone } from '../geo';
import { preuveDePartage } from '../partage';
import type { DivisionPublique, EcolePubliee } from '../ports';
import type { Valeur } from '../listes';
import { vuesSurPlace } from './plan';
import { simplifierContour } from './simplification';

type Niveau = Valeur<'niveau'>;
// L'état d'une zone et ses mots vivent dans `modele/etat-zone.ts` : la carte et les pages de zone lisent la même vérité.
export { libelleDeploiement, type EtatDeploiement } from '../etat-zone';

import { ORDRE_LETTRES, cycleLePlusEleve, lettresDesCycles } from './cycles';
export { cycleLePlusEleve, lettresDesCycles };

/** La place d'un repère dans l'aperçu : une ligne. La fiche, elle, garde le texte entier. */
export const REPERE_MAX = 80;

/** Le repère en mots, nettoyé et coupé sur un mot (« … » au bout) ; rien quand il est vide. */
export function repereCourt(texte: string | null): string | null {
  const propre = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (!propre) return null;
  if (propre.length <= REPERE_MAX) return propre;
  const coupe = propre.slice(0, REPERE_MAX - 1);
  const espace = coupe.lastIndexOf(' ');
  const net = (espace >= REPERE_MAX / 2 ? coupe.slice(0, espace) : coupe).replace(
    /[\s,;:.–-]+$/,
    '',
  );
  return `${net}…`;
}

export interface FeatureEcole {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    nom: string;
    lien: string;
    lieu: string;
    /** Tous les cycles, dans les mots du site : l'aperçu les liste. */
    niveaux: string[];
    /** La lettre du cycle de chaque niveau de `niveaux`, dans le même ordre : le disque de l'aperçu. */
    niveauxLettres: string[];
    cycle: Niveau | null;
    lettre: string | null;
    /** La place du cycle le plus élevé, de 1 (M) à 6 (S) : pour trier, regrouper et agréger. */
    rang: number | null;
    /** Les lettres de tous les cycles (« MPC ») : pour le filtre de cycle. Vide quand aucun niveau n'est noté. */
    lettres: string;
    /** Le type, dans les mots des listes du site (« Privée ») ; rien quand il n'est pas connu. */
    type: string | null;
    /** Le repère en mots, sur une ligne (80 caractères au plus) ; rien quand il n'y en a pas. */
    repere: string | null;
    preuve: 'direction' | 'terrain';
    preuveTexte: string;
    photo?: string | null;
    passage?: string | null;
    confirmation?: string | null;
  };
}

/** Les écoles de la carte : vues sur place, et situées. Rien de privé. */
export function ecolesGeoJSON(ecoles: readonly EcolePubliee[]): {
  type: 'FeatureCollection';
  features: FeatureEcole[];
} {
  const features: FeatureEcole[] = [];
  for (const e of vuesSurPlace(ecoles)) {
    if (e.latitude === null || e.longitude === null) continue;
    const preuve = preuveDePartage(e);
    const cycle = cycleLePlusEleve(e.niveaux);
    const niveaux = listes.niveau.filter((n) => e.niveaux.includes(n));
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
      properties: {
        id: e.id,
        nom: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
        lien: lienEcole(e),
        lieu: ligneDeLieu(e.quartier, e.divisionNoms),
        niveaux: niveaux.map((n) => libelleNiveau[n]),
        niveauxLettres: niveaux.map((n) => lettresDesCycles([n])),
        cycle: cycle?.cycle ?? null,
        lettre: cycle?.lettre ?? null,
        rang: cycle ? ORDRE_LETTRES.indexOf(cycle.lettre) + 1 : null,
        lettres: lettresDesCycles(e.niveaux),
        type: typeInformatif(e.typeEcole) ? libelleTypeEcole[e.typeEcole] : null,
        repere: repereCourt(e.repere),
        preuve: preuve.genre === 'direction' ? 'direction' : 'terrain',
        preuveTexte: preuve.texte,
        photo: e.photo ? cheminPhotoPublique(e.photo) : null,
        passage: e.releveeLe,
        confirmation: e.etat === 'verifiee' ? e.verifieeLe : null,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export interface FeatureZone {
  type: 'Feature';
  geometry:
    | { type: 'MultiPolygon'; coordinates: MultiPolygone }
    | { type: 'Point'; coordinates: [number, number] };
  properties: {
    /** `zone` : un arrondissement dessiné ; `ville` : un point, pour le dézoom. */
    genre: 'zone' | 'ville';
    nom: string;
    slug: string;
    etat: EtatDeploiement;
    libelle: string;
    /** La page des écoles de la zone. */
    lien: string;
    ecoles: number;
    vues: number;
    confirmees: number;
    /** Le jour du dernier passage d'un relais (heure de Brazzaville), ou rien. */
    dernierPassage: string | null;
  };
}

const jourDeBrazzaville = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Brazzaville',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function compteurs(prefixe: string, ecoles: readonly EcolePubliee[]) {
  const dedans = ecoles.filter((e) => {
    const adresse = sansRepetition(e.adresse).join('/');
    return adresse === prefixe || adresse.startsWith(`${prefixe}/`);
  });
  const vues = vuesSurPlace(dedans);
  const passages = vues.map((e) => e.releveeLe as string).sort();
  const dernier = passages[passages.length - 1];
  return {
    ecoles: dedans.length,
    vues: vues.length,
    confirmees: dedans.filter((e) => e.etat === 'verifiee').length,
    dernierPassage: dernier ? jourDeBrazzaville.format(new Date(dernier)) : null,
  };
}

/** Un détail de moins de 10 m n'est pas dessiné : c'est un pixel au plus grand zoom stocké, et des octets pour rien. */
export const TOLERANCE_CONTOUR_M = 10;

/**
 * Les zones de la carte (ticket 102, puis 113) : chaque arrondissement qui a un état public (en polygone quand son
 * contour est connu, sinon en point), et chaque ville qui a un point (état propre, sinon celui de ce qu'elle contient :
 * « relevé en cours » dès qu'un arrondissement l'est). Une zone sans état public n'est pas sur la carte, contour ou non.
 *
 * - **Le contour vient de la base** (`division.contour` : la base est l'unique source) ; `contourDe` n'est que le repli du
 *   dessin embarqué, pour ce que la base n'a pas (le faux serveur des parcours). Il est simplifié à 10 m et arrondi au
 *   mètre : le téléphone n'a pas besoin de plus, et chaque point pèse une dizaine d'octets.
 * - **Une ville qui a SON état public et un contour sort aussi en polygone**, en plus de son point (Brazzaville, « déploiement
 *   programmé », dont les arrondissements n'ont pas d'état : la zone programmée est la commune entière). Une ville dont l'état
 *   n'est que celui de ce qu'elle contient reste un point : ses arrondissements sont déjà dessinés.
 */
export function zonesGeoJSON({
  divisions,
  ecoles,
  contourDe,
}: {
  divisions: readonly DivisionPublique[];
  ecoles: readonly EcolePubliee[];
  contourDe: (division: DivisionPublique) => MultiPolygone | null;
}): { type: 'FeatureCollection'; features: FeatureZone[] } {
  const features: FeatureZone[] = [];
  const adresseDe = (d: DivisionPublique) => sansRepetition(d.adresse).join('/');
  const contourDeLaZone = (d: DivisionPublique): MultiPolygone | null => {
    const brut = d.contour ?? contourDe(d);
    return brut ? simplifierContour(brut, TOLERANCE_CONTOUR_M) : null;
  };
  const ajouter = (
    d: DivisionPublique,
    genre: FeatureZone['properties']['genre'],
    etat: EtatDeploiement,
    geometrie: FeatureZone['geometry'],
  ) =>
    features.push({
      type: 'Feature',
      geometry: geometrie,
      properties: {
        genre,
        nom: d.nom,
        slug: d.slug,
        etat,
        libelle: libelleDeploiement[etat],
        lien: lienDivision(d.adresse),
        ...compteurs(adresseDe(d), ecoles),
      },
    });
  const point = (d: DivisionPublique): FeatureZone['geometry'] | null =>
    d.position ? { type: 'Point', coordinates: [d.position.longitude, d.position.latitude] } : null;

  for (const d of divisions) {
    if (d.genre === 'city') {
      const etat: EtatDeploiement | null = etatPublicDe(d, divisions);
      const lePoint = point(d);
      if (etat && lePoint) ajouter(d, 'ville', etat, lePoint);
      const contour = d.deploiement ? contourDeLaZone(d) : null;
      if (d.deploiement && contour) {
        ajouter(d, 'zone', d.deploiement, { type: 'MultiPolygon', coordinates: contour });
      }
    } else if (d.genre === 'arrondissement' && d.deploiement) {
      const contour = contourDeLaZone(d);
      const geometrie = contour
        ? ({ type: 'MultiPolygon', coordinates: contour } as const)
        : point(d);
      if (geometrie) ajouter(d, 'zone', d.deploiement, geometrie);
    }
  }
  return { type: 'FeatureCollection', features };
}
