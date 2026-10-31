/**
 * Les repères de la carte : ce que tout le monde connaît dans le quartier (un marché, un
 * rond-point, une église, un stade…). Ils se dessinent sur la carte du quartier et vus de près,
 * et donnent son titre à un coin : « Près du [marché] ».
 *
 * C'est la couche à personnaliser. Pour ajouter un repère : sa position (sur Google Maps, un
 * appui long sur l'endroit, puis copier « -4.79105, 11.92500 »), son nom tel qu'on le dit sur
 * place, et son genre. Un lieu public seulement : jamais le domicile de quelqu'un.
 */
import type { Point } from '../geo';

export const genresDeRepere = [
  'marche',
  'rond_point',
  'eglise',
  'mosquee',
  'stade',
  'sante',
  'gare',
  'autre',
] as const;
export type GenreRepere = (typeof genresDeRepere)[number];

export interface Repere extends Point {
  nom: string;
  genre: GenreRepere;
}

/** Les repères de Pointe-Noire. Vide tant que personne ne les a relevés. */
export const reperes: readonly Repere[] = [];
