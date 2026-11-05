/**
 * L'école choisie sur la carte : son épingle grandit, un halo jaune la souligne, son nom s'écrit à côté. Elle vit dans sa
 * propre source (`SOURCE_CHOISIE`) : un groupe ne la cache jamais, et le nom du fond, lui, s'efface pour ne pas se doubler.
 */
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import type { FeatureEcole } from '../../modele/carte/donnees';
import { COUCHE_NOMS, SOURCE_CHOISIE, filtreDesNoms } from '../../modele/carte/couches';
import { nomDeLEpingle } from '../../modele/carte/marqueurs';
import { imageDeLaCarte } from './images';

export function montrerLEcoleChoisie(carte: MapLibreMap, ecole?: FeatureEcole): void {
  const source = carte.getSource(SOURCE_CHOISIE) as GeoJSONSource | undefined;
  if (!source) return;
  if (ecole) {
    // L'image est posée avant la donnée : sinon l'épingle n'apparaît qu'au tour suivant.
    const nom = nomDeLEpingle(
      ecole.properties.lettre,
      ecole.properties.preuve === 'direction',
      true,
    );
    const image = carte.hasImage(nom) ? null : imageDeLaCarte(nom);
    if (image) carte.addImage(nom, image.data, { pixelRatio: image.pixelRatio });
  }
  source.setData({ type: 'FeatureCollection', features: ecole ? [ecole] : [] });
  if (carte.getLayer(COUCHE_NOMS))
    carte.setFilter(COUCHE_NOMS, filtreDesNoms(ecole?.properties.id));
}
