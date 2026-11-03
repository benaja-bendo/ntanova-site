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
import { lienDivision, lienEcole, ligneDeLieu, sansRepetition } from '../geo-divisions';
import { libelleNiveau } from '../libelles';
import { listes } from '../listes';
import type { MultiPolygone } from '../geo';
import { preuveDePartage } from '../partage';
import type { DivisionPublique, EcolePubliee } from '../ports';
import type { Valeur } from '../listes';
import { vuesSurPlace } from './plan';

type Niveau = Valeur<'niveau'>;
export type EtatDeploiement = NonNullable<DivisionPublique['deploiement']>;

/** Les mots de l'état public d'une zone : jamais « complet », rien ne le mesure. */
export const libelleDeploiement: Record<EtatDeploiement, string> = {
  actif: 'Relevé en cours',
  programme: 'Déploiement programmé',
};

/** La lettre d'un cycle sur son marqueur. Du plus bas au plus haut : M, P, C, L, T, S. */
const CYCLES: readonly { cycle: Niveau; lettre: 'M' | 'P' | 'C' | 'L' | 'T' | 'S' }[] = [
  { cycle: 'creche', lettre: 'M' },
  { cycle: 'maternelle', lettre: 'M' },
  { cycle: 'primaire', lettre: 'P' },
  { cycle: 'college', lettre: 'C' },
  { cycle: 'lycee', lettre: 'L' },
  { cycle: 'technique', lettre: 'T' },
  { cycle: 'superieur', lettre: 'S' },
  { cycle: 'autre_formation', lettre: 'S' },
];

/** Le cycle le plus élevé d'une école, pour son marqueur ; rien quand aucun niveau n'est noté. */
export function cycleLePlusEleve(
  niveaux: readonly Niveau[],
): { cycle: Niveau; lettre: (typeof CYCLES)[number]['lettre'] } | null {
  let meilleur = -1;
  for (const n of niveaux)
    meilleur = Math.max(
      meilleur,
      CYCLES.findIndex((c) => c.cycle === n),
    );
  const trouve = CYCLES[meilleur];
  return trouve ? { cycle: trouve.cycle, lettre: trouve.lettre } : null;
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
    cycle: Niveau | null;
    lettre: string | null;
    preuve: 'direction' | 'terrain';
    preuveTexte: string;
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
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
      properties: {
        id: e.id,
        nom: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
        lien: lienEcole(e),
        lieu: ligneDeLieu(e.quartier, e.divisionNoms),
        niveaux: listes.niveau.filter((n) => e.niveaux.includes(n)).map((n) => libelleNiveau[n]),
        cycle: cycle?.cycle ?? null,
        lettre: cycle?.lettre ?? null,
        preuve: preuve.genre === 'direction' ? 'direction' : 'terrain',
        preuveTexte: preuve.texte,
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

/**
 * Les zones de la carte : chaque arrondissement qui a un état public (en polygone quand son contour est dessiné, sinon en
 * point), et chaque ville qui a un point (état propre, sinon celui de ce qu'elle contient : « relevé en cours » dès qu'un
 * arrondissement l'est). Une zone sans état public n'est pas sur la carte.
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
  for (const d of divisions) {
    const prefixe = adresseDe(d);
    let etat: EtatDeploiement | null = d.deploiement;
    let geometrie: FeatureZone['geometry'] | null = null;
    let genre: 'zone' | 'ville' = 'zone';
    if (d.genre === 'city' && d.position) {
      genre = 'ville';
      if (!etat) {
        const dessous = divisions.filter((x) => adresseDe(x).startsWith(`${prefixe}/`));
        etat = dessous.some((x) => x.deploiement === 'actif')
          ? 'actif'
          : dessous.some((x) => x.deploiement === 'programme')
            ? 'programme'
            : null;
      }
      geometrie = { type: 'Point', coordinates: [d.position.longitude, d.position.latitude] };
    } else if (d.genre === 'arrondissement' && etat) {
      const contour = contourDe(d);
      if (contour) geometrie = { type: 'MultiPolygon', coordinates: contour };
      else if (d.position) {
        geometrie = { type: 'Point', coordinates: [d.position.longitude, d.position.latitude] };
      }
    }
    if (!etat || !geometrie) continue;
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
        ...compteurs(prefixe, ecoles),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
