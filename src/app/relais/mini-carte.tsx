/**
 * La mini-carte des planches v2 (une mission, l'étape 1) : l'arrondissement où est la position, vert pâle bordé de vert,
 * le point avec son halo, le nom en capitales. Le contour vient des arrondissements dessinés (OpenStreetMap, ODbL), chargé
 * à part la première fois (le service worker le garde ensuite : la carte marche hors ligne). Hors de Pointe-Noire, ou
 * avant le chargement, un fond neutre et le point seul : jamais une fausse rue.
 */
import { useEffect, useState } from 'react';
import type { Point } from '../../modele/geo';

const LARGEUR = 340;
const HAUTEUR = 150;

interface Dessin {
  nom: string | null;
  contour: string | null;
  point: [number, number];
}

async function dessiner(position: Point): Promise<Dessin> {
  const [{ arrondissementDeLaPosition }, geo] = await Promise.all([
    import('../../modele/carte/plan'),
    import('../../modele/carte/geometrie'),
  ]);
  const a = arrondissementDeLaPosition(position);
  if (!a) return { nom: null, contour: null, point: [LARGEUR / 2, HAUTEUR / 2] };
  const proj = geo.projection(geo.boiteDeContours([a.contour]), {
    largeur: LARGEUR,
    hauteurMax: HAUTEUR,
    hauteurMin: HAUTEUR,
    marge: 14,
  });
  return {
    nom: a.nom,
    contour: geo.cheminContour(a.contour, proj),
    point: proj.versEcran(position),
  };
}

export function MiniCarte({
  position,
  libelle,
  className,
}: {
  position: Point;
  /** Ce que la carte montre, pour un lecteur d'écran (« La position prise, à Loandjili »). */
  libelle: string;
  className?: string;
}) {
  const [dessin, setDessin] = useState<Dessin | null>(null);
  useEffect(() => {
    let vivant = true;
    void dessiner(position)
      .then((d) => vivant && setDessin(d))
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, [position]);
  const [x, y] = dessin?.point ?? [LARGEUR / 2, HAUTEUR / 2];
  return (
    <div className={className ?? 'bg-muted'}>
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        width="100%"
        height={120}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={dessin?.nom ? `${libelle}, à ${dessin.nom}` : libelle}
        className="block"
      >
        {dessin?.contour && (
          <path
            d={dessin.contour}
            fill="var(--vert-pale)"
            stroke="var(--marque)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )}
        {dessin?.nom && (
          <text
            x={18}
            y={22}
            fontSize={9}
            fontWeight={700}
            letterSpacing="0.08em"
            fill="var(--texte-doux)"
            fontFamily="var(--police-interface)"
          >
            {dessin.nom.toUpperCase()}
          </text>
        )}
        <circle cx={x} cy={y} r={15} fill="var(--marque)" opacity={0.18} />
        <circle
          cx={x}
          cy={y}
          r={6.5}
          fill="var(--marque)"
          stroke="var(--blanc)"
          strokeWidth={2.5}
        />
      </svg>
    </div>
  );
}
