import { defineMiddleware } from 'astro:middleware';
import { obtenirSite } from './infra/index';
import { villesDeLAccueil } from './modele/accueil';

/**
 * Ce que le gabarit public montre sur chaque page sans le recevoir de la page : les villes du pied de page (lot 3, version 44
 * du canevas). `src/ui/` ne connaît pas `src/infra/` (eslint.config.js) : les données passent par `Astro.locals`.
 *
 * Le site est statique : ceci ne tourne qu'à la construction, et `obtenirSite` ne lit le catalogue qu'une fois.
 */
export const onRequest = defineMiddleware(async (contexte, suite) => {
  const { arbre } = await obtenirSite();
  contexte.locals.villesDuPied = villesDeLAccueil(arbre).map(({ nom, lien }) => ({ nom, lien }));
  return suite();
});
