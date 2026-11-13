// v2 (13/11) : chaque image publique d'une école, réduite à la construction à la taille de son usage (`FORMATS_MEDIA`). Le site
// ne sert jamais l'original ni ses métadonnées, et aucune adresse du stockage n'apparaît dans une page.
import type { APIRoute, GetStaticPaths } from 'astro';
import { obtenirMedia, obtenirSite } from '../../infra/index';
import { mediaPourLeSite } from '../../partage/photos';
import { FORMATS_MEDIA, type FormatMedia, type MediaPublic } from '../../modele/vitrine';

export const getStaticPaths = (async () => {
  const { ecoles } = await obtenirSite();
  const chemins = new Map<string, { id: string; format: FormatMedia }>();
  const poser = (m: MediaPublic | null | undefined, format: FormatMedia) => {
    if (m) chemins.set(`${m.id}-${format}`, { id: m.id, format });
  };
  for (const e of ecoles) {
    poser(e.medias?.logo, 'logo');
    poser(e.medias?.couverture, 'couverture');
    poser(e.medias?.couverture, 'vignette');
    for (const m of e.medias?.galerie ?? []) poser(m, 'vignette');
    for (const n of e.nouvelles ?? []) poser(n.media, 'vignette');
  }
  return [...chemins].map(([fichier, props]) => ({ params: { fichier }, props }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { id, format } = props as { id: string; format: FormatMedia };
  const source = await obtenirMedia(id, format !== 'couverture');
  return new Response(
    new Uint8Array(await mediaPourLeSite(source, FORMATS_MEDIA[format], format === 'logo')),
    { headers: { 'Content-Type': 'image/webp' } },
  );
};
