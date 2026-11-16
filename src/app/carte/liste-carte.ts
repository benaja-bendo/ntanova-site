/**
 * La vue Carte de « Les écoles » (lot 4 bis, version 46, 16/11/2026) : la même liste, sur la carte. Chargée au premier
 * toucher de « Carte » ; MapLibre et les tuiles viennent avec elle (îlot ≤ 500 Ko, décision du 04/11).
 *
 * - les épingles sont celles de la liste filtrée (seules les écoles vues sur place ont une position publique, 03/11) ;
 * - survoler une école de la liste l'allume (halo, nom) ; toucher une épingle la montre dans la liste (ordinateur) ou ouvre
 *   l'aperçu en bas (téléphone : Voir la fiche, Y aller) ;
 * - après un déplacement, « Chercher dans cette zone » ; le toucher ajoute la puce « Zone de la carte × » à l'adresse ;
 * - la position, quand elle est donnée par « Autour de moi », se pose en point bleu, sans jamais partir du téléphone.
 */
import { Marker, type GeoJSONSource, type MapLibreMap } from 'maplibre-gl';
import { htmlCarteEcole } from '../../modele/carte-ecole';
import type { FeatureEcole } from '../../modele/carte/donnees';
import { SOURCE_ECOLES } from '../../modele/carte/couches';
import type { Fenetre } from '../../modele/carte/fond';
import type { Point } from '../../modele/geo';
import type { Cadre, Trouvee } from '../../modele/liste-ecoles';
import { montrerLEcoleChoisie } from './choisie';
import { demarrerLaCarte } from './ilot';

export interface OuvertureDeLaCarte {
  zone: HTMLElement;
  /** Une épingle touchée : l'identifiant du campus. */
  surChoix: (id: string) => void;
  position: () => Point | null;
}

const surTelephone = () => window.matchMedia('(max-width: 63.99rem)').matches;

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
    surSelection: (p) => choisir(p.id),
  });

  await new Promise<void>((r) => (carte.loaded() ? r() : carte.once('load', () => r())));
  pret = true;

  function choisir(id: string) {
    const f = parId.get(id);
    montrerLEcoleChoisie(carte, f);
    o.surChoix(id);
    if (surTelephone()) {
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
  }
  apercu.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-fermer-apercu]')) {
      apercu.hidden = true;
      montrerLEcoleChoisie(carte);
    }
  });

  // « Chercher dans cette zone » : seulement après un déplacement fait par la personne.
  carte.on('movestart', (e) => {
    if ((e as { originalEvent?: unknown }).originalEvent && !deplaceParLaPage)
      chercher.hidden = false;
  });
  carte.on('moveend', () => (deplaceParLaPage = false));

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

  function montrer(trouvees: Trouvee[]) {
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
    if (features.length > 0) {
      let [w, s, e, n] = [180, 90, -180, -90];
      for (const f of features) {
        const [x, y] = f.geometry.coordinates;
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, y);
        n = Math.max(n, y);
      }
      const dedans = carte.getBounds();
      const tout = features.every((f) => dedans.contains(f.geometry.coordinates));
      if (!tout) {
        deplaceParLaPage = true;
        carte.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          { padding: 48, maxZoom: 15, duration: 0 },
        );
      }
    }
  }

  return {
    montrer,
    /** Choisir une école (lien d'une fiche) : la carte se centre sur elle et l'allume. */
    choisir(id: string) {
      const f = parId.get(id);
      if (!f) return;
      deplaceParLaPage = true;
      carte.jumpTo({ center: f.geometry.coordinates, zoom: Math.max(carte.getZoom(), 15) });
      choisir(id);
    },
    poserMaPosition,
    /** Survol d'une école de la liste : son épingle s'allume ; rien, elle s'éteint. */
    allumer(id: string | null) {
      montrerLEcoleChoisie(carte, id ? parId.get(id) : undefined);
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
