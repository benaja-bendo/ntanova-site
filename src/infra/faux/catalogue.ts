import type { PortCatalogue } from '../../modele/ports';

/** Un catalogue fictif, pour les parcours Playwright (`PUBLIC_ADAPTATEUR=faux`). */
export const catalogueFaux: PortCatalogue = {
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
        repere: '[face au marché]',
        numeroEnseigne: '242060000001',
        latitude: -4.79105,
        longitude: 11.925,
        etat: 'relevee',
        misAJourLe: '2026-11-02T10:00:00Z',
      },
    ];
  },
};
