import type { PortCatalogue } from '../../modele/ports';

/**
 * Un catalogue fictif, pour les parcours Playwright (`PUBLIC_ADAPTATEUR=faux`) : quatre écoles à
 * Tié-Tié (deux voisines, une sans position, une située par l'administration), aucune à Ngoyo.
 */
export const catalogueFaux: PortCatalogue = {
  async redirections() {
    return [
      {
        de: { arrondissement: 'tie-tie', slug: 'ancienne-fiche-exemple' },
        vers: { arrondissement: 'tie-tie', slug: 'complexe-scolaire-exemple' },
      },
    ];
  },
  async arrondissements() {
    return [
      { slug: 'ngoyo', nom: 'Ngoyo' },
      { slug: 'tie-tie', nom: 'Tié-Tié' },
    ];
  },
  async ecoles() {
    return [
      {
        id: '20000000-0000-4000-8000-000000000001',
        arrondissement: 'tie-tie',
        slug: 'complexe-scolaire-exemple',
        nom: '[Complexe scolaire Exemple]',
        quartier: '[Quartier]',
        typeEcole: 'privee',
        niveaux: ['maternelle', 'primaire'],
        programme: 'Programme français-congolais, bilingue',
        repere: '[face au marché]',
        numeroEnseigne: '242060000001',
        latitude: -4.79105,
        longitude: 11.925,
        etat: 'relevee',
        releveeLe: '2026-11-02T10:00:00Z',
        situeeLe: null,
        misAJourLe: '2026-11-02T10:00:00Z',
      },
      // Un type « Autre » (c'est écrit, mais ça ne rentre dans aucune case) et un niveau « Autre formation ».
      {
        id: '20000000-0000-4000-8000-000000000002',
        arrondissement: 'tie-tie',
        slug: 'centre-de-formation-exemple',
        nom: '[Centre de formation Exemple]',
        quartier: null,
        typeEcole: 'autre',
        niveaux: ['autre_formation'],
        programme: null,
        repere: null,
        numeroEnseigne: null,
        latitude: -4.7931,
        longitude: 11.9262,
        etat: 'relevee',
        // Relevée le 2 novembre, modifiée depuis le 20 : la fiche dit « relevée le 2 novembre ».
        releveeLe: '2026-11-02T10:00:00Z',
        situeeLe: null,
        misAJourLe: '2026-11-20T10:00:00Z',
      },
      // Rien d'écrit sur l'enseigne : ni type, ni niveau, ni programme.
      {
        id: '20000000-0000-4000-8000-000000000003',
        arrondissement: 'tie-tie',
        slug: 'ecole-sans-detail-exemple',
        nom: '[École sans détail Exemple]',
        quartier: null,
        typeEcole: 'non_indique',
        niveaux: [],
        programme: null,
        repere: null,
        numeroEnseigne: '242060000002',
        latitude: null,
        longitude: null,
        etat: 'relevee',
        // Une fiche d'avant la date de relevé : la page retombe sur la dernière mise à jour.
        releveeLe: null,
        situeeLe: null,
        misAJourLe: '2026-11-05T10:00:00Z',
      },
      // Située par l'administration (une école qu'elle connaît), sans relevé : « ajoutée par NTanova ».
      {
        id: '20000000-0000-4000-8000-000000000004',
        arrondissement: 'tie-tie',
        slug: 'ecole-ajoutee-exemple',
        nom: '[École ajoutée Exemple]',
        quartier: null,
        typeEcole: 'publique',
        niveaux: ['primaire'],
        programme: null,
        repere: null,
        numeroEnseigne: null,
        latitude: -4.815,
        longitude: 11.94,
        etat: 'relevee',
        releveeLe: null,
        situeeLe: '2026-11-03T10:00:00Z',
        misAJourLe: '2026-11-03T10:00:00Z',
      },
    ];
  },
};
