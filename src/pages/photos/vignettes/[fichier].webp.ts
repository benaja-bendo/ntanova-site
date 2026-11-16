// Lot 4 (16/11/2026) : les vignettes de la photo d'enseigne pour la carte d'une école, réduites à la construction (WebP) :
// `<id>-carree.webp` (carte en ligne, téléphone) et `<id>-large.webp` (carte en colonne). Ni original ni métadonnée.
import type { APIRoute, GetStaticPaths } from 'astro';
import { obtenirPhotoPublique, obtenirSite } from '../../../infra/index';
import { FORMATS_ENSEIGNE, type FormeVignette } from '../../../modele/fiche-mince';
import { mediaPourLeSite } from '../../../partage/photos';

export const getStaticPaths = (async () => {
  const { ecoles } = await obtenirSite();
  return ecoles.flatMap((e) =>
    e.photo
      ? (Object.keys(FORMATS_ENSEIGNE) as FormeVignette[]).map((forme) => ({
          params: { fichier: `${e.photo!.id}-${forme}` },
          props: { id: e.photo!.id, forme },
        }))
      : [],
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { id, forme } = props as { id: string; forme: FormeVignette };
  const image = await mediaPourLeSite(
    await obtenirPhotoPublique(id),
    FORMATS_ENSEIGNE[forme],
    true,
  );
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp' } });
};
