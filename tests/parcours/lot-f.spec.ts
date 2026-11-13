// Lot F du ticket 165 (13/11/2026) : « Une de mes fiches » et « Ma paie » en facture côté relais, la vignette de l'école
// connue dans « Vous la reconnaissez ? » (repli sur le sigle hors ligne), le détail des formations du supérieur et la preuve
// d'un agrément côté admin, et ce que la page publique en dit. Construit avec le faux serveur.
import { expect, test, type Page } from '@playwright/test';
import {
  ouvrirGestion,
  ouvrirLaFiche,
  prendrePhotoEtPosition,
  publierLaZoneTieTie,
  seConnecter,
  uneFicheEnvoyee,
} from './aides';

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

test('« Une de mes fiches » : son état, ce qui vient du relevé, ce qui manque, puis en ligne et sa paie, même hors ligne', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await uneFicheEnvoyee(page, context);

  // Elle s'ouvre depuis « Mes fiches ».
  await page.getByRole('link', { name: 'Mes fiches' }).click();
  await page.getByRole('link', { name: '[École 1]' }).click();
  await expect(page.getByRole('heading', { name: 'Une de mes fiches' })).toBeVisible();
  const etapes = page.getByRole('list', { name: 'Où en est la fiche' });
  await expect(etapes).toContainText('Envoyée');
  await expect(page.getByText('NTanova relit votre fiche.')).toBeVisible();
  const releve = page.getByRole('region', { name: 'Ce qui vient de mon relevé' });
  await expect(releve).toContainText('[École 1]');
  await expect(releve).toContainText('Face au marché');
  await expect(releve).toContainText('Primaire');
  await expect(releve).toContainText('Oui · contact envoyé à NTanova');
  await expect(page.getByRole('region', { name: 'Ce qui manque encore' })).toContainText(
    'Des photos des lieux, vides (bonus)',
  );
  await expect(page.getByRole('region', { name: 'Ce qu’elle rapporte' })).toContainText(
    'Elle sera payée si NTanova l’accepte.',
  );
  await expect(page.getByRole('link', { name: 'Voir la page de l’école' })).toHaveCount(0);

  // NTanova l'accepte et publie la zone.
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  await page.getByRole('link', { name: 'Écoles' }).click();
  await publierLaZoneTieTie(page);
  await expect(page.getByRole('status').first()).toContainText(/publiée/);

  // « Mes fiches » gagne le filtre « En ligne ».
  await page.goto('/relais/#fiches');
  await expect(page.getByRole('button', { name: 'En ligne · 1' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'En ligne · 1' }).click();
  await expect(page.getByRole('link', { name: '[École 1]' })).toBeVisible();

  // Hors ligne, la fiche s'ouvre quand même : tout vient du téléphone.
  await context.setOffline(true);
  await page.getByRole('link', { name: '[École 1]' }).click();
  await expect(page.getByText('La page de l’école est en ligne.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir la page de l’école' })).toHaveAttribute(
    'href',
    '/ecoles/158427/',
  );
  await expect(page.getByRole('region', { name: 'Ce qu’elle rapporte' })).toContainText(
    /Cette fiche : 500\sFCFA, à payer vendredi/,
  );
  await context.setOffline(false);

  // « Ma paie » se lit comme une facture : N × tarif = sous-total, puis le total.
  await page.getByRole('link', { name: 'Ma paie' }).click();
  const detail = page
    .getByRole('region', { name: 'Acquis' })
    .getByRole('list', { name: 'Le détail' });
  await expect(detail).toContainText('1 fiche acceptée');
  await expect(detail).toContainText(/1 × 500\sFCFA/);
  await expect(detail).toContainText(/Total\s*500\sFCFA/);
});

test('« Une de mes fiches » : la raison de NTanova quand elle demande une correction, et le bouton pour corriger', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Demander une correction' }).click();
  await page.getByLabel('Motif').selectOption('autre');
  await page
    .getByLabel(/Message au relais/)
    .fill('Reprenez la photo de l’enseigne, elle est floue.');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('status')).toHaveText(/correction part au relais/);

  await page.goto('/relais/#fiches');
  await page.getByRole('link', { name: '[École 1]' }).click();
  await expect(page.getByRole('list', { name: 'Où en est la fiche' })).toContainText('À corriger', {
    timeout: 15_000,
  });
  await expect(page.locator('.message-ntanova')).toContainText(
    'Reprenez la photo de l’enseigne, elle est floue.',
  );
  await expect(page.getByRole('button', { name: 'Corriger la fiche' })).toBeVisible();
});

/** L'étape 2 du relevé, à une vingtaine de mètres de l'école publiée du faux serveur, puis « Vous la reconnaissez ? ». */
async function reconnaitre(page: Page, context: import('@playwright/test').BrowserContext) {
  await context.setGeolocation({ latitude: -4.79123, longitude: 11.925, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await prendrePhotoEtPosition(page);
  const doublon = page.getByRole('region', { name: 'Doublon possible' });
  if (await doublon.isVisible())
    await doublon.getByRole('button', { name: 'Non, une autre' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom de l'établissement").fill('[École exemple]');
  const deja = page.getByRole('region', { name: /Déjà sur NTanova/ });
  await deja
    .getByRole('button', { name: /\[École exemple publiée\]/ })
    .first()
    .click();
  return page.getByRole('region', { name: 'Vous la reconnaissez ?' });
}

test('« Vous la reconnaissez ? » : les deux photos côte à côte quand le téléphone capte', async ({
  page,
  context,
}) => {
  const reconnue = await reconnaitre(page, context);
  await expect(reconnue.getByText('Sur NTanova')).toBeVisible();
  await expect(reconnue.getByText('Votre photo')).toBeVisible();
  const sienne = reconnue.getByRole('img', {
    name: 'La photo de [École exemple publiée] sur NTanova',
  });
  await expect(sienne).toBeVisible();
  await expect
    .poll(() => sienne.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  await expect(reconnue.getByRole('img', { name: 'Votre photo de l’enseigne' })).toBeVisible();
  // Les choix ne changent pas : « même endroit » d'abord.
  await expect(reconnue.getByRole('button').first()).toHaveText('Oui, c’est le même endroit');
});

test('« Vous la reconnaissez ? » : hors ligne, ou si l’image ne se charge pas, le sigle à la place', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => localStorage.setItem('ntanova-faux-vignette', 'cassee'));
  const reconnue = await reconnaitre(page, context);
  await expect(reconnue.getByRole('img', { name: 'Sigle de [École exemple publiée]' })).toHaveText(
    'EEP',
  );
  await reconnue.getByRole('button', { name: 'Fermer' }).click();

  // Hors ligne : aucune image demandée, le sigle tout de suite.
  await page.evaluate(() => localStorage.removeItem('ntanova-faux-vignette'));
  await context.setOffline(true);
  const deja = page.getByRole('region', { name: /Déjà sur NTanova/ });
  await deja
    .getByRole('button', { name: /\[École exemple publiée\]/ })
    .first()
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Vous la reconnaissez ?' })
      .getByRole('img', { name: 'Sigle de [École exemple publiée]' }),
  ).toHaveText('EEP');
});

/** Un institut du supérieur dans le faux serveur, avec une formation et l'agrément de l'établissement. */
async function unInstitut(page: Page) {
  await seConnecter(page, '/admin/#valider');
  await page.getByRole('link', { name: 'Écoles' }).click();
  await expect(page.getByRole('row', { name: /\[École à situer\]/ })).toBeVisible();
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      campus: Record<string, Record<string, unknown>>;
    };
    const modele = Object.values(e.campus)[0]!;
    const id = '00000000-0000-4000-8000-0000000000f2';
    e.campus[id] = {
      ...modele,
      id,
      institutionId: id,
      nom: '[Institut Lot F]',
      niveaux: ['superieur'],
      confieeA: null,
      formations: [
        {
          cycle: 'superieur',
          titre: 'BTS Exemple',
          domaine: null,
          serie: null,
          diplome: 'bts',
          rythmes: ['jour'],
        },
      ],
      agrements: [
        {
          id: 'a0000000-0000-4000-8000-0000000000f2',
          formationId: null,
          genre: 'agrement',
          precision: null,
          reference: 'arrêté n° [référence]',
          delivreLe: '2024-03-12',
          sourceTexte: '[Le document affiché à l’accueil]',
          sourceLien: null,
          controleLe: '2026-11-10',
        },
      ],
    };
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Écoles' }).click();
  return page.getByRole('row', { name: /\[Institut Lot F\]/ });
}

test('le détail d’une formation du supérieur : daté par l’école, une durée impossible dite avant l’envoi', async ({
  page,
}) => {
  const ligne = await unInstitut(page);
  await ouvrirGestion(ligne, 'Formations du supérieur');
  const section = page.getByRole('region', { name: 'Formations du supérieur' });
  await expect(section).toContainText('BTS Exemple');
  await expect(section).toContainText('Aucun détail');
  await section.getByRole('button', { name: 'Détail : BTS Exemple' }).click();
  const form = section.getByRole('form', { name: 'Détail de BTS Exemple' });
  await form.getByLabel(/Durée/).fill('12');
  await form.getByRole('button', { name: 'Enregistrer le détail' }).click();
  await expect(section.getByRole('alert')).toHaveText(/0,5 à 8/);

  await form.getByLabel(/Durée/).fill('2');
  await form.getByLabel(/Frais de dossier/).fill('15000');
  await form.getByLabel(/Niveau demandé/).fill('Bac, toutes séries');
  await form.getByLabel(/Sélection/).selectOption('dossier');
  await form.getByLabel(/Diplôme délivré par/).fill('[L’établissement]');
  await form.getByRole('button', { name: 'Enregistrer le détail' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Détail de « BTS Exemple » enregistré',
  );
  await expect(section).toContainText(
    /2 ans · Bac, toutes séries · Dossier · dossier 15\s000\sFCFA/,
  );
  await expect(section).toContainText('diplôme délivré par [L’établissement]');
});

test('la preuve d’un agrément : la photo du document ajoutée ici reste privée ; « dit par l’école » se choisit aussi', async ({
  page,
}) => {
  const ligne = await unInstitut(page);
  await ouvrirGestion(ligne, 'Agrément');
  await expect(page.getByText('Preuve : pas encore dite')).toBeVisible();
  await page.getByRole('button', { name: 'Preuve : L’établissement' }).click();
  const preuve = page.getByRole('group', { name: 'Preuve de l’agrément : L’établissement' });
  await preuve.getByLabel('Photo du document').check();
  await expect(
    preuve.getByText('Aucune photo de travail dans les relevés de ce site.'),
  ).toBeVisible();
  await preuve.getByRole('button', { name: 'Enregistrer la preuve' }).click();
  await expect(preuve.getByText(/Choisis la photo du document/)).toBeVisible();

  await preuve.getByLabel(/Ou ajouter la photo du document/).setInputFiles(photo);
  await preuve.getByRole('button', { name: 'Enregistrer la preuve' }).click();
  await expect(page.getByRole('status').first()).toContainText('Elle reste privée');
  await expect(page.getByText('Preuve : Photo du document (photo ajoutée ici)')).toBeVisible();
  // Rangée sous ecoles/<site>/preuves/, jamais avec les images publiques.
  const chemin = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus: Record<string, { agrements?: { preuveDetail?: { chemin: string | null } }[] }>;
    };
    return e.campus['00000000-0000-4000-8000-0000000000f2']?.agrements?.[0]?.preuveDetail?.chemin;
  });
  expect(chemin).toMatch(/^ecoles\/00000000-0000-4000-8000-0000000000f2\/preuves\/.+\.webp$/);

  await page.getByRole('button', { name: 'Preuve : L’établissement' }).click();
  await expect(page.getByRole('link', { name: 'Voir la photo déjà ajoutée' })).toBeVisible();
  await page.getByLabel('Dit par l’école, sans document').check();
  await page.getByRole('button', { name: 'Enregistrer la preuve' }).click();
  await expect(page.getByText('Preuve : Dit par l’école, sans document')).toBeVisible();
});

test('la page publique du supérieur dit le détail d’une formation, sa date, et comment l’autorisation a été vue', async ({
  page,
}) => {
  await page.goto('/ecoles/527064/');
  const formations = page.locator('.filiere', { hasText: 'BTS Informatique de gestion' });
  await expect(formations).toContainText('niveau demandé : [Bac, toutes séries]');
  await expect(formations).toContainText('sélection : dossier');
  await expect(formations).toContainText(/frais de dossier 15\s000\sFCFA/);
  await expect(formations).toContainText('D’après l’école, le 5 novembre 2026');
  await expect(formations).toContainText('vue sur le document');
  await expect(page.locator('body')).not.toContainText(/reconnue? par l.État/);
});
