import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, prendrePhotoEtPosition, seConnecter, envoyerSansBonus } from './aides';

// Cocher les séries et les filières, sans clavier ; le repère en un toucher ; les brouillons d'avant (audit de la fiche
// relais, 08/11/2026). Construit avec le faux serveur. Ce que le relais coche préremplit « À valider » : rien ne se publie seul.

test.use({ permissions: ['geolocation'] });

const ETAPE2 = "L'établissement";

/** Ouvre la saisie d'une école, prend la photo et la position, passe à l'étape 2/3. */
async function ouvrirEtape2(page: Page, context: import('@playwright/test').BrowserContext) {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await prendrePhotoEtPosition(page);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
}

const suivant = (page: Page) => page.getByRole('button', { name: 'Suivant' });
const champRepere = (page: Page) => page.getByLabel('Comment la trouver ?');
const pastille = (page: Page, nom: string | RegExp) =>
  page.getByRole('button', { name: nom, exact: typeof nom === 'string' });

test.describe('les séries du lycée se cochent', () => {
  test('elles partent avec la fiche, et l’administration les retrouve déjà cochées, sans rien publier', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await ouvrirEtape2(page, context);
    await page.getByLabel("Nom de l'établissement").fill('[École 1]');
    await pastille(page, 'Lycée').click();

    const series = page.getByRole('group', { name: /Séries du lycée/ });
    await expect(series.getByRole('button')).toHaveCount(12);
    await series.getByRole('button', { name: 'Série D', exact: true }).click();
    await series.getByRole('button', { name: 'Série C', exact: true }).click();
    await expect(series.getByRole('button', { name: 'Série C', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // La ligne libre reste, pour ce que les puces ne disent pas.
    await page.getByLabel(/Précisions sur les séries/).fill('Série C et D seulement en 2ᵉ cycle');

    await suivant(page).click();
    await page.getByRole('button', { name: 'Oui', exact: true }).click();
    await page.getByLabel('Sa fonction').selectOption('promoteur');
    await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
    await page.getByLabel(/Son WhatsApp/).fill('06 123 45 61');
    await envoyerSansBonus(page);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });

    // Le faux serveur a reçu les séries, dans l'ordre où le relais les a touchées, et le texte libre.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
            releves?: Record<
              string,
              { formationsVues?: { titre: string }[]; programmesVus?: string }
            >;
          };
          const [r] = Object.values(etat.releves ?? {});
          return { titres: (r?.formationsVues ?? []).map((f) => f.titre), texte: r?.programmesVus };
        }),
      )
      .toEqual({ titres: ['Série D', 'Série C'], texte: 'Série C et D seulement en 2ᵉ cycle' });

    // L'administration les voit cochées dans « À valider », déjà dans la liste des formations, et rien n'est publié.
    await ouvrirLaFiche(page);
    await expect(page.getByTestId('formations-du-relais')).toContainText(
      'Cochées par le relais sur place : Série D, Série C',
    );
    await expect(page.getByRole('button', { name: 'Retirer Série C' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retirer Série D' })).toBeVisible();
  });
});

test.describe('les filières du supérieur se cochent sans clavier', () => {
  test('un diplôme, puis des domaines : chaque toucher ajoute une filière, un toucher la retire', async ({
    page,
    context,
  }) => {
    await ouvrirEtape2(page, context);
    await page.getByLabel("Nom de l'établissement").fill('[Institut 1]');
    await pastille(page, 'Supérieur').click();

    const bloc = page.getByRole('region', { name: 'Filières : Supérieur' });
    // Le diplôme en cours est posé d'avance (BTS) : un toucher sur un domaine suffit.
    await expect(bloc.getByRole('button', { name: 'BTS', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await bloc.getByRole('button', { name: 'Gestion', exact: true }).click();
    await bloc.getByRole('button', { name: 'Informatique', exact: true }).click();
    await bloc.getByRole('button', { name: 'Licence', exact: true }).click();
    await bloc.getByRole('button', { name: 'Droit', exact: true }).click();

    const notees = bloc.getByRole('group', { name: /Filières notées/ });
    await expect(notees.getByRole('button')).toHaveText([
      'BTS Gestion ×',
      'BTS Informatique ×',
      'Licence Droit ×',
    ]);
    await expect(bloc).toContainText('3 filières notées');

    // Dix domaines d'abord, les autres derrière « Plus de domaines », dans la même page (jamais une fenêtre).
    await expect(bloc.getByRole('button', { name: 'Sport', exact: true })).toHaveCount(0);
    await bloc.getByRole('button', { name: 'Plus de domaines' }).click();
    await bloc.getByRole('button', { name: 'Sport', exact: true }).click();
    await expect(notees.getByRole('button', { name: 'Retirer : Licence Sport' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Un toucher sur une étiquette la retire ; « Autre filière » : un mot ou deux, avec le diplôme en cours.
    await notees.getByRole('button', { name: 'Retirer : BTS Gestion' }).click();
    await expect(notees.getByRole('button', { name: 'Retirer : BTS Gestion' })).toHaveCount(0);
    await bloc.getByRole('button', { name: '+ Autre filière…' }).click();
    await bloc.getByLabel('Autre filière').fill('Pâtisserie');
    await bloc.getByLabel('Autre filière').press('Enter');
    await expect(
      notees.getByRole('button', { name: 'Retirer : Licence Pâtisserie' }),
    ).toBeVisible();

    // Gardé dans le téléphone : un rechargement les retrouve.
    await page.reload();
    await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Filières : Supérieur' })
        .getByRole('group', { name: /Filières notées/ })
        .getByRole('button'),
    ).toHaveCount(4);

    // Décocher le niveau retire ses filières : la base refuserait d'accepter une filière orpheline.
    await pastille(page, 'Supérieur').click();
    await expect(page.getByRole('region', { name: 'Filières : Supérieur' })).toHaveCount(0);
    await pastille(page, 'Supérieur').click();
    await expect(
      page
        .getByRole('region', { name: 'Filières : Supérieur' })
        .getByRole('group', { name: /Filières notées/ }),
    ).toHaveCount(0);
  });
});

// v2 (13/11, canevas « Espace relais ») : le repère vient avec le lieu, à l'étape 1 « Photo et lieu », sous la position.
test.describe('le repère se répond en un toucher, à l’étape 1', () => {
  /** L'étape 1 avec la photo et la position, sans repère. */
  async function ouvrirEtape1(page: Page, context: import('@playwright/test').BrowserContext) {
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await prendrePhotoEtPosition(page, null);
  }

  test('« Comment la trouver ? » : une puce l’écrit, une seconde s’ajoute, la même l’efface', async ({
    page,
    context,
  }) => {
    await ouvrirEtape1(page, context);
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
    await pastille(page, 'Marché').click();
    await expect(champRepere(page)).toHaveValue('Près du marché');
    await pastille(page, 'Pharmacie').click();
    await expect(champRepere(page)).toHaveValue('Près du marché, près de la pharmacie');
    await pastille(page, 'Marché').click();
    await expect(champRepere(page)).toHaveValue('Près de la pharmacie');
  });

  test('sans repère, une seule relance, jamais un blocage : on continue sans, ou au second « Suivant »', async ({
    page,
    context,
  }) => {
    await ouvrirEtape1(page, context);
    await suivant(page).click();
    // La relance est dite au-dessus de « Suivant », et on reste à l'étape 1.
    await expect(page.getByRole('region', { name: 'Un repère aide' })).toContainText(
      'Un repère aide les familles',
    );
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter un repère' }).click();
    await expect(champRepere(page)).toBeFocused();
    await pastille(page, 'Carrefour').click();
    await expect(page.getByRole('region', { name: 'Un repère aide' })).toHaveCount(0);
    await suivant(page).click();
    await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
  });

  test('le repère reste facultatif : « Continuer sans », ou le second « Suivant », passent ; la relance ne se répète pas', async ({
    page,
    context,
  }) => {
    await ouvrirEtape1(page, context);
    await suivant(page).click();
    await expect(page.getByRole('region', { name: 'Un repère aide' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer sans' }).click();
    await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
    // Revenir à l'étape 1 ne répète pas la relance : une seule par fiche.
    await page.getByRole('button', { name: /Retour à l'étape 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
    await suivant(page).click();
    await expect(page.getByRole('region', { name: 'Un repère aide' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
  });

  test('le second « Suivant » passe aussi, sans cliquer sur la relance', async ({
    page,
    context,
  }) => {
    await ouvrirEtape1(page, context);
    await suivant(page).click();
    await expect(page.getByRole('region', { name: 'Un repère aide' })).toBeVisible();
    await suivant(page).click();
    await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
  });
});

test.describe('un brouillon écrit avant le 09/11/2026 ne casse pas', () => {
  test('il s’ouvre, se poursuit jusqu’à l’étape 3/3 incluse, et part (ses séries en texte libre sont gardées)', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await ouvrirEtape2(page, context);
    await page.getByLabel("Nom de l'établissement").fill('[Lycée d’avant]');
    await pastille(page, 'Lycée').click();

    // Le brouillon, tel que l'ancienne version le gardait : du texte libre dans `programmesVus`, et **pas** de
    // champ `formationsVues` (il n'existait pas).
    await page.evaluate(
      () =>
        new Promise<void>((resoudre, rejeter) => {
          const ouverture = indexedDB.open('ntanova-relais');
          ouverture.onerror = () => rejeter(ouverture.error);
          ouverture.onsuccess = () => {
            const transaction = ouverture.result.transaction('fiches', 'readwrite');
            const magasin = transaction.objectStore('fiches');
            magasin.openCursor().onsuccess = (e) => {
              const curseur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
              if (!curseur) return;
              const fiche = curseur.value as Record<string, unknown>;
              delete fiche['formationsVues'];
              fiche['programmesVus'] = 'séries C et D';
              curseur.update(fiche);
              curseur.continue();
            };
            transaction.oncomplete = () => resoudre();
            transaction.onerror = () => rejeter(transaction.error);
          };
        }),
    );
    await page.reload();

    // L'écran 2/3 s'ouvre : le texte d'avant est là (sous « Précisions »), aucune série n'est cochée, rien ne plante.
    await expect(page.getByRole('heading', { name: ETAPE2 })).toBeVisible();
    await expect(page.getByLabel(/Précisions sur les séries/)).toHaveValue('séries C et D');
    const series = page.getByRole('group', { name: /Séries du lycée/ });
    await expect(series.getByRole('button', { pressed: true })).toHaveCount(0);

    // Il se poursuit : le relais coche une série, passe à l'étape 3/3, et la fiche part (le repère est à l'étape 1).
    await series.getByRole('button', { name: 'Série C', exact: true }).click();
    await suivant(page).click();
    await expect(page.getByRole('heading', { name: 'La rencontre' })).toBeVisible();
    await page.getByRole('button', { name: 'Oui', exact: true }).click();
    await page.getByLabel('Sa fonction').selectOption('promoteur');
    await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
    await page.getByLabel(/Son WhatsApp/).fill('06 123 45 62');
    await envoyerSansBonus(page);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
            releves?: Record<
              string,
              { formationsVues?: { titre: string }[]; programmesVus?: string }
            >;
          };
          const [r] = Object.values(etat.releves ?? {});
          return { titres: (r?.formationsVues ?? []).map((f) => f.titre), texte: r?.programmesVus };
        }),
      )
      .toEqual({ titres: ['Série C'], texte: 'séries C et D' });
  });
});
