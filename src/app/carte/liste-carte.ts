/**
 * La vue Carte de « Les écoles » (lot 4 bis, version 46, 16/11/2026) : la même liste, sur la carte. Chargée au premier
 * toucher de « Carte » ; MapLibre et les tuiles viennent avec elle (îlot ≤ 500 Ko, décision du 04/11).
 *
 * - les épingles sont celles de la liste filtrée (seules les écoles vues sur place ont une position publique, 03/11) ;
 * - survoler une école de la liste l'allume (halo, nom) et, hors de la carte, la carte glisse jusqu'à elle ;
 * - toucher une épingle, ou une école de la liste (ordinateur, option A du fondateur, 17/11), fait voler la carte vers elle
 *   et ouvre l'aperçu en bas : Voir la fiche, Y aller ; l'épingle touchée montre aussi l'école dans la liste ;
 * - un changement de recherche ou de filtre fait voler la carte vers les écoles retenues ; sans choix, le pays entier, qui
 *   tient toujours en entier dans la carte (17/11) ;
 * - après un déplacement, « Chercher dans cette zone » ; le toucher ajoute la puce « Zone de la carte × » à l'adresse ;
 * - la position, quand elle est donnée par « Autour de moi », se pose en point bleu, sans jamais partir du téléphone.
 */
import { Marker, type GeoJSONSource, type MapLibreMap } from 'maplibre-gl';
import { htmlCarteEcole } from '../../modele/carte-ecole';
import type { FeatureEcole } from '../../modele/carte/donnees';
import { SOURCE_ECOLES } from '../../modele/carte/couches';
import { ZOOM_MAX_DE_LA_CARTE, zoomMaxEn, type Fenetre } from '../../modele/carte/fond';
import {
  boiteQuiTient,
  cadrageDeLaSelection,
  cleDeLaSelection,
} from '../../modele/carte/vue-carte';
import type { Point } from '../../modele/geo';
import type { Cadre, EtatListe, Trouvee } from '../../modele/liste-ecoles';
import { montrerLEcoleChoisie } from './choisie';
import { demarrerLaCarte } from './ilot';

export interface OuvertureDeLaCarte {
  zone: HTMLElement;
  /** Une épingle touchée : l'identifiant du campus. */
  surChoix: (id: string) => void;
  /** L'aperçu fermé : plus aucune école choisie. */
  surFermeture: () => void;
  position: () => Point | null;
}

/** Les vols de la carte : 0,7 s, ou rien quand le téléphone demande moins d'animations. */
const sansAnimation = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DUREE_DU_VOL = 700;

export async function ouvrirLaCarte(o: OuvertureDeLaCarte) {
  const toile = o.zone.querySelector<HTMLElement>('[data-toile]')!;
  const chercher = o.zone.querySelector<HTMLElement>('[data-chercher-zone]')!;
  const apercu = o.zone.querySelector<HTMLElement>('[data-apercu]')!;
  o.zone.dataset.etat = 'chargement';
  // Après 10 s : « La connexion est lente », et la liste reste là, aux mêmes filtres (planche des trois états).
  const lente = window.setTimeout(() => (o.zone.dataset.lente = ''), 10000);

  const [geo] = await Promise.all([
    fetch('/carte/ecoles.geojson').then((r) => r.json() as Promise<{ features: FeatureEcole[] }>),
  ]);
  const parId = new Map(geo.features.map((f) => [f.properties.id, f]));
  let dernieres: Trouvee[] = [];
  let pret = false;
  let deplaceParLaPage = false;
  let choisie: FeatureEcole | undefined;

  const boite = JSON.parse(o.zone.dataset.boite ?? 'null') as Fenetre;
  const carte: MapLibreMap = await demarrerLaCarte({
    toile,
    boite,
    integree: false,
    surPrete: () => {
      window.clearTimeout(lente);
      delete o.zone.dataset.lente;
      o.zone.dataset.etat = 'prete';
    },
    // Sans fond, les zones et les épingles se dessinent quand même : la carte est prête, le fond manque.
    surFondAbsent: () => {
      o.zone.dataset.fond = 'absent';
      window.clearTimeout(lente);
      delete o.zone.dataset.lente;
      o.zone.dataset.etat = 'prete';
    },
    surSelection: (p) => {
      const f = parId.get(p.id);
      if (f) volerVers(f);
      choisir(p.id);
    },
  });

  await new Promise<void>((r) => (carte.loaded() ? r() : carte.once('load', () => r())));
  pret = true;

  // Le pays entier tient dans la carte, quelle que soit sa forme : la boîte où elle se promène suit la taille de la toile.
  const ajusterLaBoite = () => {
    const c = carte.getContainer();
    const [o0, s0, e0, n0] = boiteQuiTient(c.clientWidth, c.clientHeight);
    carte.setMaxBounds([o0, s0, e0, n0]);
  };
  ajusterLaBoite();
  carte.on('resize', ajusterLaBoite);

  /** Une école choisie (épingle ou carte de la liste) : elle s'allume ; l'aperçu s'ouvre en bas de la carte. */
  function choisir(id: string, depuisLaListe = false) {
    const f = parId.get(id);
    choisie = f;
    montrerLEcoleChoisie(carte, f);
    if (!depuisLaListe) o.surChoix(id);
    const t = dernieres.find((x) => x.ligne.i === id);
    if (!t) return;
    const itineraire =
      t.ligne.la !== undefined && t.ligne.lo !== undefined
        ? `https://www.google.com/maps/dir/?api=1&destination=${t.ligne.la},${t.ligne.lo}`
        : null;
    apercu.innerHTML =
      htmlCarteEcole(t.ligne, { forme: 'ligne', distanceM: t.distance, prioritaire: true }) +
      `<div class="liste-apercu-actions"><a class="bouton" href="${t.ligne.u}">Voir la fiche</a>${
        itineraire ? `<a class="bouton bouton-secondaire" href="${itineraire}">Y aller</a>` : ''
      }<button type="button" class="bouton-rond liste-apercu-fermer" data-fermer-apercu aria-label="Fermer l’aperçu">×</button></div>`;
    apercu.hidden = false;
  }

  /** La carte vole vers une école : centrée, assez près pour voir sa rue (jamais plus loin que les tuiles du lieu). */
  function volerVers(f: FeatureEcole) {
    const [lng, lat] = f.geometry.coordinates;
    deplaceParLaPage = true;
    carte.setMaxZoom(ZOOM_MAX_DE_LA_CARTE);
    carte.flyTo({
      center: [lng, lat],
      zoom: Math.min(Math.max(carte.getZoom(), 15), zoomMaxEn(lng, lat)),
      duration: sansAnimation() ? 0 : DUREE_DU_VOL,
    });
  }

  apercu.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-fermer-apercu]')) {
      apercu.hidden = true;
      choisie = undefined;
      montrerLEcoleChoisie(carte);
      o.surFermeture();
    }
  });

  // « Chercher dans cette zone » : seulement après un déplacement fait par la personne.
  carte.on('movestart', (e) => {
    if ((e as { originalEvent?: unknown }).originalEvent && !deplaceParLaPage)
      chercher.hidden = false;
  });
  carte.on('moveend', () => (deplaceParLaPage = false));

  let glissement = 0;
  let moi: Marker | null = null;
  function poserMaPosition(p: Point) {
    if (!pret) return;
    const point = document.createElement('span');
    point.className = 'carte-moi';
    point.setAttribute('aria-label', 'Votre position');
    moi?.remove();
    moi = new Marker({ element: point }).setLngLat([p.longitude, p.latitude]).addTo(carte);
  }
  const p0 = o.position();
  if (p0) poserMaPosition(p0);

  let derniereCle: string | null = null;
  /**
   * Les épingles de la sélection. Quand la recherche ou un filtre a changé (pas le tri, ni « Afficher plus », ni « Chercher
   * dans cette zone »), la carte vole vers les écoles retenues ; sans aucun choix, vers le pays entier.
   */
  function montrer(trouvees: Trouvee[], etat: EtatListe) {
    dernieres = trouvees;
    const features = trouvees.flatMap((t) => {
      const f = parId.get(t.ligne.i);
      return f ? [f] : [];
    });
    (carte.getSource(SOURCE_ECOLES) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
    o.zone.dataset.aucune = features.length === 0 ? 'oui' : 'non';
    // Carte cachée (vue Liste) : elle n'a pas de taille ; le cadrage attend son retour à l'écran.
    if (o.zone.clientWidth === 0) return;
    carte.resize();
    const cle = cleDeLaSelection(etat);
    const premiere = derniereCle === null;
    if (cle === derniereCle) return;
    derniereCle = cle;
    // Une autre sélection : l'aperçu de l'école choisie se ferme.
    apercu.hidden = true;
    choisie = undefined;
    montrerLEcoleChoisie(carte);
    const cadrage = cadrageDeLaSelection(
      etat,
      features.map((f) => f.geometry.coordinates),
    );
    if (!cadrage) return;
    const [w, s, e, n] = cadrage.boite;
    deplaceParLaPage = true;
    // Le plafond posé hors des villes (zoom 10) ne doit pas retenir un vol vers Pointe-Noire ou Brazzaville.
    carte.setMaxZoom(ZOOM_MAX_DE_LA_CARTE);
    carte.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: 48,
        maxZoom: cadrage.zoomMax,
        duration: premiere || sansAnimation() ? 0 : DUREE_DU_VOL,
      },
    );
  }

  return {
    montrer,
    /** Choisir une école (lien d'une fiche, ou carte de la liste touchée) : la carte vole vers elle et l'allume. */
    choisir(id: string, depuisLaListe = false) {
      const f = parId.get(id);
      if (!f) return false;
      volerVers(f);
      choisir(id, depuisLaListe);
      return true;
    },
    poserMaPosition,
    /**
     * Survol d'une école de la liste : son épingle s'allume ; rien, elle s'éteint. Hors de la carte, la carte glisse jusqu'à
     * elle, sans changer de zoom, après un court arrêt de la souris (pas à chaque carte qui passe en faisant défiler).
     */
    allumer(id: string | null) {
      const f = id ? parId.get(id) : undefined;
      window.clearTimeout(glissement);
      // La souris quitte la liste : l'école choisie (aperçu ouvert) reste allumée.
      montrerLEcoleChoisie(carte, f ?? choisie);
      if (!f || carte.getBounds().contains(f.geometry.coordinates)) return;
      glissement = window.setTimeout(() => {
        deplaceParLaPage = true;
        carte.easeTo({ center: f.geometry.coordinates, duration: sansAnimation() ? 0 : 400 });
      }, 300);
    },
    cadre(): Cadre {
      const b = carte.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
    cacherChercher() {
      chercher.hidden = true;
    },
  };
}
