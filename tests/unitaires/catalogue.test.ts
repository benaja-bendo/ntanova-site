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

  const ligne = (champs: Record<string, unknown>) => ({
    id: 'e1',
    arrondissement: 'tie-tie',
    slug: 'ecole-exemple',
    nom: '[École exemple]',
    quartier: null,
    type_ecole: 'privee',
    niveaux: ['primaire'],
    repere: null,
    numero_enseigne: null,
    latitude: null,
    longitude: null,
    etat: 'relevee',
    mis_a_jour_le: '2026-11-02T10:00:00Z',
    ...champs,
  });
  const lireAvec = async (lignes: Record<string, unknown>[]) => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(lignes)));
    return creerCatalogue('https://base.exemple', 'cle-publique').ecoles();
  };

  it('lit le programme, ou rien tant que la colonne n’existe pas dans la base', async () => {
    const [avec, sans] = await lireAvec([
      ligne({ programme: 'Programme français-congolais, bilingue' }),
      ligne({ slug: 'ecole-sans-colonne' }),
    ]);
    expect(avec?.programme).toBe('Programme français-congolais, bilingue');
    expect(sans?.programme).toBeNull();
  });

  it('lit la date de relevé, ou rien tant que la colonne n’existe pas dans la base', async () => {
    const [avec, sans] = await lireAvec([
      ligne({ relevee_le: '2026-11-02T08:00:00Z', mis_a_jour_le: '2026-11-20T10:00:00Z' }),
      ligne({ slug: 'ecole-sans-colonne' }),
    ]);
    expect(avec).toMatchObject({
      releveeLe: '2026-11-02T08:00:00Z',
      misAJourLe: '2026-11-20T10:00:00Z',
    });
    expect(sans?.releveeLe).toBeNull();
  });

  it('lit les nouveaux types et niveaux tels quels', async () => {
    const [e] = await lireAvec([
      ligne({ type_ecole: 'communautaire', niveaux: ['creche', 'technique', 'autre_formation'] }),
    ]);
    expect(e).toMatchObject({
      typeEcole: 'communautaire',
      niveaux: ['creche', 'technique', 'autre_formation'],
    });
  });

  it('une valeur que ce code ne connaît pas encore ne casse ni la construction ni la page', async () => {
    const [e] = await lireAvec([
      ligne({ type_ecole: 'type_de_demain', niveaux: ['primaire', 'niveau_de_demain'] }),
    ]);
    expect(e?.typeEcole).toBe('non_indique');
    expect(e?.niveaux).toEqual(['primaire']);
  });

  it('arrête la construction si la base ne répond pas : jamais un annuaire vide par erreur', async () => {
    vi.stubGlobal('fetch', async () => new Response('indisponible', { status: 503 }));
    await expect(creerCatalogue('https://base.exemple', 'cle').ecoles()).rejects.toThrow(
      'Catalogue illisible (503)',
    );
  });
});
