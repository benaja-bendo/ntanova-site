// Ticket 236 (27/11) : retoucher une photo du relais. Un carré devient le logo ; une zone floutée, enregistrée en
// couverture avec sa source, remplace l'original, qui ne paraît plus.
import { expect, test } from '@playwright/test';
import {
  marquerPubliable,
  ouvrirGestion,
  ouvrirLaFiche,
  ouvrirLesEcoles,
  uneFicheEnvoyee,
} from './aides';

test.use({ permissions: ['geolocation'] });

test('le logo se recadre sur la photo, puis une zone floutée remplace l’original', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await marquerPubliable(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  await ouvrirLesEcoles(page);
  await ouvrirGestion(page.getByRole('row', { name: /\[École 1\]/ }), 'Images');
  const images = page.getByRole('region', { name: 'Images de l’école' });
  const retoucher = images
    .getByRole('list', { name: 'Photos du relais' })
    .getByRole('button', { name: 'Retoucher' });
  const editeur = page.getByRole('form', { name: 'Retoucher une photo du relais' });
  const serveur = () =>
    page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
        photos: Record<string, { publiable: boolean }>;
        medias?: { genre: string; origine: string | null; publique: boolean }[];
        choixPhotos: Record<string, string | null>;
      };
      return {
        publiables: Object.values(e.photos).filter((p) => p.publiable).length,
        medias: (e.medias ?? []).map((m) => [m.genre, m.publique, m.origine]),
        retraits: Object.values(e.choixPhotos),
      };
    });

  // Le logo : un carré, montré en rond ; la photo d'origine ne bouge pas.
  await retoucher.click();
  await editeur.getByRole('button', { name: 'Le logo' }).click();
  await editeur.getByLabel('Taille du carré').fill('40');
  await expect(editeur.getByRole('img', { name: 'Aperçu du logo dans son rond' })).toBeVisible();
  await editeur.getByLabel(/Sans enfant/).check();
  await editeur.getByRole('button', { name: 'Enregistrer le logo' }).click();
  await expect(editeur).toHaveCount(0);
  expect(await serveur()).toMatchObject({
    publiables: 1,
    medias: [
      ['logo', true, expect.stringMatching(/^Logo recadré sur la photo prise par le relais/)],
    ],
    retraits: [],
  });

  // Sans zone ni recadrage, rien à enregistrer ; une zone tracée du doigt se floute.
  await retoucher.click();
  await editeur.getByRole('button', { name: 'Enregistrer la version retouchée' }).click();
  await expect(editeur.getByRole('alert')).toContainText('Floute une zone ou recadre');
  const photo = editeur.getByTestId('retouche');
  // Au milieu de l'écran : l'en-tête du tiroir ne la recouvre pas.
  await photo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const boite = (await photo.boundingBox())!;
  await page.mouse.move(boite.x + boite.width * 0.2, boite.y + boite.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width * 0.7, boite.y + boite.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await expect(editeur).toContainText('1 zone floutée');
  await editeur.getByLabel(/Sans enfant/).check();
  await editeur.getByRole('button', { name: 'Enregistrer la version retouchée' }).click();
  await expect(editeur).toHaveCount(0);
  expect(await serveur()).toMatchObject({
    publiables: 0,
    medias: [
      ['logo', true, expect.any(String)],
      ['cover', true, expect.stringMatching(/^Photo prise par le relais.*, floutée$/)],
    ],
    // Le retrait écrit : ni l'original ni une autre photo ne reparaît d'office.
    retraits: [null],
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
