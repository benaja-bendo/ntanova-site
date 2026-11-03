// Les images de partage (ticket 101) : une par fiche publiée, et une pour le reste du site, construites avec le
// site en PNG de 1 200 × 630 (WhatsApp ne montre pas un SVG). La page ne les charge jamais : seul l'aperçu d'un
// lien partagé les lit. Le dessin est dans src/modele/partage.ts ; ici, le rendu, avec les polices du site.
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import type { APIRoute, GetStaticPaths } from 'astro';
import { obtenirSite } from '../../infra/index';
import {
  cheminImagePartage,
  contenuDePartage,
  couleursDePartage,
  IMAGE_PARTAGE_SITE,
  svgDePartage,
  type PreuveDePartage,
} from '../../modele/partage';

interface Contenu {
  titre: string;
  lieu: string;
  preuve: PreuveDePartage | null;
}

export const getStaticPaths = (async () => {
  const { ecoles } = await obtenirSite();
  const sansPng = (chemin: string) => chemin.replace(/^\/partage\//, '').replace(/\.png$/, '');
  return [
    {
      params: { chemin: sansPng(IMAGE_PARTAGE_SITE) },
      props: {
        titre: 'Les écoles près de chez vous',
        lieu: 'Congo-Brazzaville, ville par ville',
        preuve: null,
      } satisfies Contenu,
    },
    ...ecoles.map((e) => ({
      params: { chemin: sansPng(cheminImagePartage(e)) },
      props: contenuDePartage(e) satisfies Contenu,
    })),
  ];
}) satisfies GetStaticPaths;

const couleurs = couleursDePartage(readFileSync('src/ui/jetons.css', 'utf8'));
const polices = ['src/partage/polices/poppins-700.ttf', 'src/partage/polices/nunito-sans-400.ttf'];

export const GET: APIRoute = ({ props }) => {
  const svg = svgDePartage({ ...(props as Contenu), couleurs });
  const png = new Resvg(svg, {
    font: { fontFiles: polices, loadSystemFonts: false, defaultFontFamily: 'Nunito Sans' },
  })
    .render()
    .asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
