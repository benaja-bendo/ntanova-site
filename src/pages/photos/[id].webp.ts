import type { APIRoute, GetStaticPaths } from 'astro';
import { obtenirSite, obtenirPhotoPublique } from '../../infra/index';
import { photoPourLeSite } from '../../partage/photos';
export const getStaticPaths = (async () => {
  const { ecoles } = await obtenirSite();
  return ecoles.flatMap((e) => (e.photo ? [{ params: { id: e.photo.id } }] : []));
}) satisfies GetStaticPaths;
export const GET: APIRoute = async ({ params }) =>
  new Response(new Uint8Array(await photoPourLeSite(await obtenirPhotoPublique(params.id!))), {
    headers: { 'Content-Type': 'image/webp' },
  });
