import { PUBLIC_FORMULAIRES } from 'astro:env/client';

/**
 * Le seul réglage de l'ouverture (refonte publique, lot 3C), lu à la construction et fermé par défaut. Fermé : chaque porte du site
 * reste sur WhatsApp, les deux pages sont en `noindex` et n'entrent ni dans le plan du site ni dans `llms.txt`. L'ouvrir est un
 * geste de la recette ; il n'ouvre pas les envois, qui attendent un secret dans la base.
 */
export const formulairesOuverts = PUBLIC_FORMULAIRES === 'ouverts';
