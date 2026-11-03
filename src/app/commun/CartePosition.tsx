/**
 * La carte d'une position (ticket #72) : une grille de six tuiles d'OpenStreetMap au plus, un repère et le cercle de
 * la précision, dessinés en SVG. Pas de bibliothèque de cartes, pas de JavaScript de carte : le calcul est dans
 * `src/modele/tuiles.ts`.
 *
 * Elle montre une position déjà prise (celle d'une fiche envoyée, ou que le téléphone vient de mesurer) : on ne la
 * déplace pas. Les coordonnées sont toujours écrites en dessous, avec un lien pour les ouvrir dans l'application de
 * cartes du téléphone. **Sans réseau** (les tuiles ne se chargent pas), la carte le dit et le reste tient : le repère
 * sur le fond de la carte, les coordonnées, le lien.
 *
 * Elle coûte une centaine de Ko de tuiles, une fois le dessin affiché : on ne la monte que quand le relais la demande,
 * ou sur une correction, où il en a besoin.
 */
import { useState } from 'react';
import { ecrirePosition, lienGoogleMaps } from '../../modele/coordonnees';
import type { Point } from '../../modele/geo';
import {
  adresseDeTuile,
  ATTRIBUTION_DES_TUILES,
  grilleDeTuiles,
  rayonEnPixels,
  TAILLE_TUILE,
  ZOOM_DE_POSITION,
} from '../../modele/tuiles';

const LARGEUR = 360;
const HAUTEUR = 220;

export function CartePosition({
  position,
  precisionM,
  legende,
}: {
  position: Point;
  precisionM: number | null;
  /** Une ligne au-dessus des coordonnées : « Position envoyée le 2 novembre ». */
  legende?: string;
}) {
  const { tuiles, centre } = grilleDeTuiles(position, {
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    zoom: ZOOM_DE_POSITION,
  });
  // Les tuiles qui n'ont pas pu se charger : si c'est toutes, la carte dit qu'elle demande du réseau.
  const [absentes, setAbsentes] = useState<ReadonlySet<string>>(new Set());
  const rayon =
    precisionM === null ? 0 : rayonEnPixels(precisionM, position.latitude, ZOOM_DE_POSITION);
  const coordonnees = ecrirePosition(position);
  const sansCarte = absentes.size >= tuiles.length;

  return (
    <figure className="carte-position">
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        role="img"
        aria-label={`Carte de la position ${coordonnees}${
          precisionM === null ? '' : `, précision ${Math.round(precisionM)} mètres`
        }`}
      >
        <rect className="carte-position-fond" width={LARGEUR} height={HAUTEUR} />
        {tuiles.map((t) => {
          const cle = `${t.z}/${t.x}/${t.y}`;
          return (
            <image
              key={cle}
              href={adresseDeTuile(t)}
              x={t.px}
              y={t.py}
              width={TAILLE_TUILE}
              height={TAILLE_TUILE}
              onError={() => setAbsentes((avant) => new Set(avant).add(cle))}
            />
          );
        })}
        {rayon >= 3 && (
          <circle
            className="carte-position-precision"
            cx={centre.x}
            cy={centre.y}
            r={Math.min(rayon, LARGEUR)}
          />
        )}
        {/* Le repère : la pointe est sur la position. */}
        <g transform={`translate(${centre.x} ${centre.y})`}>
          <path
            className="carte-position-repere"
            d="M0 0 C-3 -7 -11 -13 -11 -21 a11 11 0 1 1 22 0 C11 -13 3 -7 0 0z"
          />
          <circle className="carte-position-repere-coeur" cx="0" cy="-21" r="4" />
        </g>
      </svg>
      {sansCarte && (
        <p className="mention" role="status">
          La carte demande du réseau. La position reste notée ci-dessous.
        </p>
      )}
      <figcaption className="carte-position-legende">
        {legende && <span>{legende}</span>}
        <span>
          {coordonnees}
          {precisionM !== null && <> · précision {Math.round(precisionM)}&nbsp;m</>}
        </span>
        <a href={lienGoogleMaps(position)} target="_blank" rel="noreferrer">
          Ouvrir dans l’application de cartes
        </a>
        <span className="carte-position-attribution">{ATTRIBUTION_DES_TUILES}</span>
      </figcaption>
    </figure>
  );
}
