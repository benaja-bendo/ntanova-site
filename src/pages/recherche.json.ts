// Le fichier que lisent « Rechercher » et « Autour de moi » : une ligne par campus publié, en abrégé
// (voir `LigneRecherche`). Construit avec le site : chercher n'appelle jamais la base.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../infra/index';

export const GET: APIRoute = async () => {
  const { recherche } = await obtenirSite();
  return new Response(JSON.stringify(recherche), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
