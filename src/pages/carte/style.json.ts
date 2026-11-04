// Le style de la carte interactive (ticket 103) : le fond de Protomaps repeint aux jetons, puis les couches de NTanova
// (zones, villes, groupes, marqueurs). Écrit à la construction : changer un jeton de src/ui/jetons.css change la carte.
import type { APIRoute } from 'astro';
import jetons from '../../ui/jetons.css?raw';
import { styleDeLaCarte } from '../../modele/carte/style';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(styleDeLaCarte(jetons)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
