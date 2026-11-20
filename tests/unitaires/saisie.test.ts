// Ticket 205, la saisie : ce que le modèle et l'adaptateur de l'administration acceptent et envoient pour un agrément cité par
// l'école (A22), le profil de l'école (A21), une image (A6, A32, A34), le numéro de l'école (A8, A19), plusieurs rentrées (A25)
// et l'import des formations (A11).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { creerPortAdministration } from '../../src/infra/supabase/administration';
import { lireAgrement, referenceEnMots } from '../../src/modele/agrement';
import { libelleNumeroEcole, lireNumeroEcole } from '../../src/modele/contacts';
import { erreursIdentite, versCorrectionIdentite } from '../../src/modele/correction-ecole';
import { erreurDuCalendrier, type AdmissionASaisir } from '../../src/modele/fiche-admin';
import { lireImportation } from '../../src/modele/import-ecoles';

const JOUR = '2026-11-20';

function fausseApi(rpc: Record<string, unknown> = {}, tables: Record<string, unknown[]> = {}) {
  const appels: { nom: string; arguments: unknown[] }[] = [];
  const lecture = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const geste of ['select', 'eq', 'gte', 'in', 'order', 'range', 'update', 'or'])
      c[geste] = (...args: unknown[]) => {
        appels.push({ nom: `${geste} ${table}`, arguments: args });
        return c;
      };
    c['maybeSingle'] = () =>
      Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
    c['then'] = (suite: (r: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(suite);
    return c;
  };
  const client = {
    rpc: (nom: string, args: unknown) => {
      appels.push({ nom, arguments: [args] });
      return Promise.resolve({ data: rpc[nom] ?? null, error: null });
    },
    from: lecture,
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ error: null }),
        remove: () => Promise.resolve({ error: null }),
        createSignedUrls: () => Promise.resolve({ data: [] }),
      }),
    },
  };
  return { port: creerPortAdministration(() => client as unknown as SupabaseClient), appels };
}

describe('A22 : un agrément cité par l’école', () => {
  const saisie = {
    formationId: '',
    genre: 'agrement',
    precision: '',
    reference: 'arrêté n° 0445',
    delivreLe: '',
    sourceTexte: 'Le prospectus de l’école',
    sourceLien: '',
    controleLe: '2026-11-19',
    preuve: 'dit_ecole',
  };

  it('se note sans la date du document', () => {
    const { agrement, erreur } = lireAgrement(saisie, JOUR);
    expect(erreur).toBeNull();
    expect(agrement).toMatchObject({ delivreLe: null, preuve: 'dit_ecole' });
  });

  it('un document vu garde sa date obligatoire', () => {
    expect(lireAgrement({ ...saisie, preuve: 'document_vu' }, JOUR).erreur).toMatch(/date/);
  });

  it('la fiche écrit la référence seule, sans date', () => {
    expect(referenceEnMots({ reference: 'arrêté n° 0445', delivreLe: null })).toBe(
      'arrêté n° 0445',
    );
  });

  it('l’adaptateur envoie la preuve avec l’agrément', async () => {
    const { port, appels } = fausseApi({ set_campus_accreditation: 'a1' });
    const { agrement } = lireAgrement(saisie, JOUR);
    await port.enregistrerAgrement('c1', agrement!);
    expect(appels[0]!.arguments[0]).toMatchObject({ p_issued_on: null, p_evidence: 'dit_ecole' });
  });
});

describe('A21 : l’année, le site web et la page Facebook de l’école', () => {
  const avant = {
    sigle: null,
    etiquette: null,
    anneeCreation: null,
    siteWeb: null,
    facebook: null,
  };
  const champs = { sigle: '', etiquette: '', anneeCreation: '', siteWeb: '', facebook: '' };

  it('ne part que ce qui a changé', () => {
    expect(
      versCorrectionIdentite(avant, {
        ...champs,
        anneeCreation: '2009',
        siteWeb: ' https://institut.cg ',
        facebook: 'https://www.facebook.com/institut',
      }),
    ).toEqual({
      anneeCreation: 2009,
      siteWeb: 'https://institut.cg',
      facebook: 'https://www.facebook.com/institut',
    });
  });

  it('refuse une année future, un lien en http et une page qui n’est pas Facebook', () => {
    expect(
      erreursIdentite(
        {
          ...champs,
          anneeCreation: '2999',
          siteWeb: 'http://institut.cg',
          facebook: 'https://x.com/institut',
        },
        JOUR,
      ),
    ).toEqual({
      anneeCreation: 'L’année de création est passée : 1800 à 2026.',
      siteWeb: 'Un lien commence par https:// et ne contient aucune espace.',
      facebook: 'Colle le lien de la page : https://www.facebook.com/…',
    });
  });

  it('envoie l’année, le site web et la page Facebook à l’école', async () => {
    const { port, appels } = fausseApi({}, { campuses: [{ institution_id: 'inst-1' }] });
    await port.modifierEcole('c1', {
      anneeCreation: 2009,
      siteWeb: null,
      facebook: 'https://www.facebook.com/x',
    });
    expect(appels.find((a) => a.nom === 'update institutions')?.arguments[0]).toEqual({
      founded_year: 2009,
      website_url: null,
      facebook_url: 'https://www.facebook.com/x',
    });
  });
});

describe('A6, A32, A34 : les images', () => {
  const image = {
    plein: new Blob(['x']),
    miniature: new Blob(['x']),
    mime: 'image/webp' as const,
    largeur: 800,
    hauteur: 600,
  };

  it('garde d’où vient une image, à part', async () => {
    const { port, appels } = fausseApi({ add_campus_media: 'm1' });
    await port.ajouterMedia('c1', {
      genre: 'document',
      sujet: 'prospectus',
      legende: null,
      controle: false,
      publique: false,
      image,
      origine: 'Reçu par WhatsApp le 20/11',
    });
    expect(appels.find((a) => a.nom === 'add_campus_media')?.arguments[0]).toMatchObject({
      p_kind: 'document',
      p_public: false,
    });
    expect(appels.find((a) => a.nom === 'set_campus_media_source')?.arguments[0]).toEqual({
      p_media: 'm1',
      p_note: 'Reçu par WhatsApp le 20/11',
    });
  });

  it('« En couverture »', async () => {
    const { port, appels } = fausseApi();
    await port.mettreEnCouverture('m5');
    expect(appels[0]).toEqual({ nom: 'set_campus_cover', arguments: [{ p_media: 'm5' }] });
  });
});

describe('A11 : l’import d’une formation avec son détail', () => {
  const liste = (formation: Record<string, unknown>) =>
    JSON.stringify([
      {
        reference: 'ETB-900',
        nom: '[Institut Import]',
        genre: 'privee',
        campus: [
          {
            division: 'congo.pointe_noire.pointe_noire.loandjili',
            cycles: [
              { cycle: 'superieur', formations: [{ titre: 'Licence Gestion', ...formation }] },
            ],
          },
        ],
      },
    ]);
  const formation = (texte: string, options = {}) =>
    lireImportation(texte, options).entrees[0]?.campus[0]?.cycles[0]?.formations[0];

  it('lit la durée, le niveau demandé et le jour où l’école l’a dit', () => {
    expect(
      formation(liste({ dureeAnnees: 3, niveauDemande: 'Bac', ditLe: '2026-11-18' })),
    ).toMatchObject({
      dureeAnnees: 3,
      niveauDemande: 'Bac',
      ditLe: '2026-11-18',
    });
  });

  it('prend la date commune à toute la liste quand la formation n’en dit pas', () => {
    expect(formation(liste({ dureeAnnees: 2 }), { ditLe: '2026-11-15' })).toMatchObject({
      dureeAnnees: 2,
      ditLe: '2026-11-15',
    });
  });

  it('refuse une durée sans le jour où l’école l’a dit', () => {
    const lu = lireImportation(liste({ dureeAnnees: 2 }));
    expect(lu.entrees).toHaveLength(0);
    expect(lu.erreurs[0]?.message).toMatch(/jour où l’école l’a dit/);
  });

  it('l’adaptateur envoie le détail à la base', async () => {
    const { port, appels } = fausseApi({ import_catalog: { results: [] } });
    const lu = lireImportation(
      liste({ dureeAnnees: 3, niveauDemande: 'Bac', ditLe: '2026-11-18' }),
    );
    await port.importerEcoles(lu.entrees, true).catch(() => undefined);
    const envoi = appels.find((a) => a.nom === 'import_catalog')?.arguments[0] as {
      p_entries: { campuses: { cycles: { programs: Record<string, unknown>[] }[] }[] }[];
    };
    expect(envoi.p_entries[0]!.campuses[0]!.cycles[0]!.programs[0]).toMatchObject({
      duration_years: 3,
      admission_level: 'Bac',
      declared_on: '2026-11-18',
    });
  });
});

describe('A8, A19 : le numéro de l’école', () => {
  it('dit où il a été lu, rien de choisi d’avance', () => {
    expect(
      lireNumeroEcole({ numero: '06 650 00 00', luSur: '', illisible: false, lecture: '' }).erreur,
    ).toBe('Dis où le numéro a été lu.');
  });

  it('un numéro illisible en partie se garde en mots', () => {
    expect(
      lireNumeroEcole({
        numero: '',
        luSur: 'enseigne',
        illisible: true,
        lecture: ' 06 506 ou 508 ',
      }).numero,
    ).toEqual({ numero: null, luSur: 'enseigne', illisible: true, lecture: '06 506 ou 508' });
    expect(
      lireNumeroEcole({ numero: '', luSur: 'enseigne', illisible: true, lecture: '' }).erreur,
    ).toMatch(/ce qu’on lit/);
  });

  it('un numéro incomplet propose la case « Illisible en partie »', () => {
    expect(
      lireNumeroEcole({ numero: '06 506', luSur: 'prospectus', illisible: false, lecture: '' })
        .erreur,
    ).toMatch(/Illisible en partie/);
  });

  it('l’adaptateur l’envoie et le relit comme numéro de l’école', async () => {
    const { port, appels } = fausseApi({
      add_school_number: 'n1',
      contacts_of_campus: [
        {
          id: 'n1',
          role: null,
          role_detail: null,
          name: null,
          whatsapp: '242066500000',
          contact_agreement: false,
          agreement_at: null,
          said_note: null,
          received_at: '2026-11-20T10:00:00Z',
          source: 'administration',
          submission_id: null,
          submission_taken_at: null,
          relay_first_name: null,
          kind: 'numero_ecole',
          read_on: 'prospectus',
          illegible: false,
        },
      ],
    });
    await port.ajouterNumeroEcole('c1', {
      numero: '242066500000',
      luSur: 'prospectus',
      illisible: false,
      lecture: null,
    });
    expect(appels[0]).toEqual({
      nom: 'add_school_number',
      arguments: [
        {
          p_campus: 'c1',
          p_number: '242066500000',
          p_read_on: 'prospectus',
          p_illegible: false,
          p_note: null,
        },
      ],
    });
    const [c] = await port.contactsDeLEcole('c1');
    expect(c).toMatchObject({ genre: 'numero_ecole', luSur: 'prospectus', illisible: false });
    expect(libelleNumeroEcole(c!)).toBe('Numéro de l’école · lu sur un document');
  });
});

describe('A25 : plusieurs rentrées', () => {
  const admission = (etapes: AdmissionASaisir['etapes']): AdmissionASaisir => ({
    anneeScolaire: '2026-2027',
    pieces: [],
    ouDeposer: null,
    surPlaceSeulement: false,
    declareeLe: '2026-11-19',
    etapes,
  });

  it('une rentrée de plus porte un libellé distinct', () => {
    expect(
      erreurDuCalendrier(
        admission([
          { etape: 'rentree', debut: '2026-10-12', fin: null },
          { etape: 'rentree', debut: '2027-01-04', fin: null, libelle: '2e rentrée' },
        ]),
      ),
    ).toBeNull();
    expect(
      erreurDuCalendrier(
        admission([{ etape: 'rentree', debut: '2027-01-04', fin: null, libelle: ' ' }]),
      ),
    ).toMatch(/libellé/);
    expect(
      erreurDuCalendrier(
        admission([
          { etape: 'rentree', debut: '2026-11-09', fin: null, libelle: 'Master' },
          { etape: 'rentree', debut: '2026-12-07', fin: null, libelle: 'master' },
        ]),
      ),
    ).toBe('Deux rentrées portent le même libellé.');
  });

  it('l’adaptateur envoie le libellé de la rentrée', async () => {
    const { port, appels } = fausseApi();
    await port.enregistrerAdmission(
      'c1',
      admission([
        { etape: 'rentree', debut: '2026-10-12', fin: null },
        { etape: 'rentree', debut: '2027-01-04', fin: null, libelle: '2e rentrée' },
      ]),
    );
    const envoi = appels.find((a) => a.nom === 'set_campus_admission')?.arguments[0] as {
      p_steps: unknown[];
    };
    expect(envoi.p_steps).toEqual([
      { step: 'rentree', starts_on: '2026-10-12', ends_on: null },
      { step: 'rentree', starts_on: '2027-01-04', ends_on: null, label: '2e rentrée' },
    ]);
  });
});
