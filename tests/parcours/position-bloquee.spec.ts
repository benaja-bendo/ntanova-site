import { expect, test, type Page } from '@playwright/test';
import { seConnecter } from './aides';

// La position est bloquée : le relais lit quoi faire sur SON téléphone (ticket #72). Construit avec le faux serveur ;
// la position n'est pas autorisée au départ (le navigateur de test la refuse), et le test l'autorise ensuite comme le
// ferait le relais dans les réglages de son téléphone.
//
// Les identifiants de navigateur sont de vrais identifiants : Chrome sur iPhone (CriOS) est le cas du fondateur et de
// beaucoup de relais. L'ancien message disait « Dans Chrome, touchez le cadenas à gauche de l'adresse » et parlait
// d'un Mac : rien de cela n'existe sur un iPhone.

const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// WhatsApp, Gmail… affichent la page dans leur fenêtre : pas de « Safari/ » à la fin.
const APP_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/** Ouvre « Ajouter une école » : le téléphone demande tout de suite la position. */
async function ouvrirLEtape1(page: Page) {
  await seConnecter(page, '/relais/');
  await expect(
    page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
}

const aide = (page: Page) => page.getByRole('alert', { name: 'La position est bloquée' });

/**
 * Ce que le journal des erreurs a gardé d'un blocage de position : dans la base du téléphone, ou déjà parti chez NTanova
 * (le faux serveur) : l'envoi du journal peut passer entre deux lectures.
 */
function journalDeLaPosition(page: Page, code: string) {
  return page.evaluate(
    (code) =>
      new Promise<string[]>((resoudre, rejeter) => {
        const faux = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
          erreurs?: { code: string; detail: string | null }[];
        };
        const partis = (faux.erreurs ?? []).filter((e) => e.code === code);
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result.transaction('erreurs').objectStore('erreurs').getAll();
          lecture.onsuccess = () => {
            const restants = (lecture.result as { code: string; detail: string | null }[]).filter(
              (e) => e.code === code,
            );
            resoudre([...partis, ...restants].map((e) => e.detail ?? ''));
          };
        };
      }),
    code,
  );
}

test.describe('Chrome sur iPhone', () => {
  test.use({ userAgent: CHROME_IPHONE });

  test('la position est bloquée : l’aide envoie dans les Réglages de l’iPhone', async ({
    page,
  }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toBeVisible();

    // Les mots d'Apple et de Chrome, dans l'ordre.
    await expect(aide(page)).toContainText('Ouvrez l’app « Réglages » du téléphone.');
    await expect(aide(page)).toContainText('Confidentialité et sécurité');
    await expect(aide(page)).toContainText('Service de localisation');
    await expect(aide(page)).toContainText('« Chrome »');
    await expect(aide(page)).toContainText('Lorsque l’app est active');
    await expect(aide(page)).toContainText('Position exacte');

    // Rien de l'ancien message : ni cadenas, ni Mac.
    await expect(page.getByText(/cadenas|Dans Chrome, touchez|Mac/)).toHaveCount(0);

    // Un seul bouton pour reprendre la position, et le relais peut continuer sans elle.
    await expect(page.getByRole('button', { name: 'Reprendre la position' })).toHaveCount(1);
    await expect(page.getByText('Sans position, vous pouvez continuer')).toBeVisible();
  });

  test('« Écrire à NTanova » dit le téléphone et le blocage, sans rien de personnel', async ({
    page,
  }) => {
    await ouvrirLEtape1(page);
    const lien = aide(page).getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' });
    await expect(lien).toBeVisible();
    const adresse = new URL((await lien.getAttribute('href')) ?? '');
    // Le numéro vient de la configuration de la construction, jamais du code : celui de `PUBLIC_WHATSAPP` quand il est
    // donné (la CI), sinon celui de `pnpm test:parcours`.
    const numero = (process.env['PUBLIC_WHATSAPP'] || '242000000000').replace(/[\s.+()-]/g, '');
    expect(adresse.origin + adresse.pathname).toBe(`https://wa.me/${numero}`);
    const message = adresse.searchParams.get('text') ?? '';
    expect(message).toMatch(/iPhone/);
    expect(message).toMatch(/Chrome/);
    expect(message).toMatch(/position refusée/);
  });

  test('le relais autorise la position, revient : la mesure se relance toute seule', async ({
    page,
    context,
  }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toBeVisible();

    // Le relais change le réglage de son téléphone, puis revient dans l'application.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
    await page.waitForTimeout(1700);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await expect(page.getByText('Position prise')).toBeVisible();
    await expect(aide(page)).toHaveCount(0);
  });

  test('ou il touche « Reprendre la position »', async ({ page, context }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toBeVisible();
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
    await page.getByRole('button', { name: 'Reprendre la position' }).click();
    await expect(page.getByText('Position prise')).toBeVisible();
    await expect(aide(page)).toHaveCount(0);
  });

  test('le journal garde l’état de l’autorisation, pour comprendre le blocage ensuite', async ({
    page,
  }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toBeVisible();
    // Une ligne, sans donnée personnelle : l'état de l'autorisation que le navigateur annonce.
    await expect
      .poll(async () => (await journalDeLaPosition(page, 'position_refusee')).length)
      .toBeGreaterThan(0);
    for (const detail of await journalDeLaPosition(page, 'position_refusee')) {
      expect(detail).toMatch(/^autorisation : (prompt|denied|granted|inconnue)/);
    }
  });

  test('refusée de nouveau : l’aide reste, sans boucle', async ({ page }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toBeVisible();
    await page.getByRole('button', { name: 'Reprendre la position' }).click();
    // Toujours refusée : l'aide revient, une seule.
    await expect(aide(page)).toBeVisible();
    await expect(aide(page)).toHaveCount(1);
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(aide(page)).toHaveCount(1);
  });
});

test.describe('Safari sur iPhone', () => {
  test.use({ userAgent: SAFARI_IPHONE });

  test('l’aide parle de Safari et du réglage du site', async ({ page }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toContainText('Réglages du site web');
    await expect(aide(page)).toContainText('Service de localisation');
    await expect(page.getByText(/cadenas/)).toHaveCount(0);
  });
});

test.describe('une page ouverte dans une autre app (WhatsApp…)', () => {
  test.use({ userAgent: APP_IPHONE });

  test('l’aide dit de l’ouvrir dans Chrome ou Safari', async ({ page }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toContainText('ouverte dans une autre app');
    await expect(aide(page)).toContainText('Ouvrir dans Chrome');
    await expect(aide(page)).not.toContainText('Service de localisation');
  });
});

test.describe('Chrome sur Android', () => {
  test('l’aide parle de l’icône à gauche de l’adresse, pas des Réglages de l’iPhone', async ({
    page,
  }) => {
    await ouvrirLEtape1(page);
    await expect(aide(page)).toContainText('à gauche de l’adresse');
    await expect(aide(page)).toContainText('Autorisations');
    await expect(aide(page)).not.toContainText('Confidentialité et sécurité');
    await expect(aide(page)).not.toContainText('iPhone');
  });
});

test.describe('une position très approximative', () => {
  test.use({ userAgent: CHROME_IPHONE, permissions: ['geolocation'] });

  test('sur iPhone, l’écran pense à « Position exacte »', async ({ page, context }) => {
    test.setTimeout(60_000);
    // Une mesure à 3 km : l'iPhone ne donne que la position approximative. La mesure attend une vingtaine de secondes
    // une meilleure précision avant de s'arrêter.
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 3000 });
    await ouvrirLEtape1(page);
    await expect(page.getByText(/très approximative \(3000 m\)/)).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/«\sPosition exacte\s» est activée pour Chrome/)).toBeVisible();
  });
});
