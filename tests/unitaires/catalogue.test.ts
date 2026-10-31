import { afterEach, describe, expect, it, vi } from 'vitest';
import { creerCatalogue } from '../../src/infra/supabase/catalogue';

afterEach(() => vi.unstubAllGlobals());

describe('le catalogue du site public', () => {
  it('lit les écoles publiées avec la clé publique, dans les termes du modèle', async () => {
    const appels: { url: string; cle: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      appels.push({ url, cle: new Headers(init.headers).get('apikey') });
      return new Response(
        JSON.stringify([
          {
            id: 'e1',
            arrondissement: 'tie-tie',
            slug: 'ecole-exemple',
            nom: '[École exemple]',
            quartier: null,
            type_ecole: 'privee',
            niveaux: ['primaire'],
            repere: null,
            numero_enseigne: null,
            latitude: -4.79,
            longitude: 11.92,
            etat: 'relevee',
            mis_a_jour_le: '2026-11-02T10:00:00Z',
          },
        ]),
      );
    });
    const ecoles = await creerCatalogue('https://base.exemple', 'cle-publique').ecoles();
    expect(ecoles[0]).toMatchObject({
      slug: 'ecole-exemple',
      typeEcole: 'privee',
      misAJourLe: '2026-11-02T10:00:00Z',
    });
    expect(appels).toEqual([
      {
        url: 'https://base.exemple/rest/v1/ecoles_publiees?select=*&order=nom',
        cle: 'cle-publique',
      },
    ]);
  });

  it('arrête la construction si la base ne répond pas : jamais un annuaire vide par erreur', async () => {
    vi.stubGlobal('fetch', async () => new Response('indisponible', { status: 503 }));
    await expect(creerCatalogue('https://base.exemple', 'cle').ecoles()).rejects.toThrow(
      'Catalogue illisible (503)',
    );
  });
});
