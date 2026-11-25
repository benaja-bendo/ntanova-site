import { expect, test, type Page } from '@playwright/test';

// Refonte publique, lot 2 (24/11/2026 ; canevas « Points de repère », planches « S'orienter » 1440 et 390 px, lancement du
// fondateur qui accepte les six choix du lot) : cinq sections, cinq ancres ; les situations, le schéma et les domaines ouvrent
// des listes au nombre annoncé ; six activités, une réponse par geste, des pistes sans doublon ; rien ne quitte le navigateur.
// Remplace les parcours de la page de passage du lot 3 (« trois profils vers leur liste ») en gardant ses invariants : l'entrée
// courante dans l'en-tête, aucun lien vers une liste vide, « pas un avis officiel ».

const sousTitre = (page: Page) => page.locator('[data-sous-titre]');

/** Le nombre d'écoles que dit la liste, une fois le fichier de recherche lu et l'adresse appliquée. */
async function nombreDeLaListe(page: Page): Promise<number> {
  await expect(page.locator('[data-liste][data-pret]')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  const texte = (await sousTitre(page).innerText()).trim();
  if (texte.startsWith('Aucune')) return 0;
  return Number(/^(\d+)/.exec(texte)?.[1] ?? NaN);
}

const activites = (page: Page) => page.locator('[data-activites]');
const progression = (page: Page) => activites(page).locator('[data-progression]');
const bouton = (page: Page, nom: 'J’aime' | 'Je ne sais pas' | 'Je n’aime pas') =>
  activites(page).getByRole('button', { name: nom, exact: true });

/** Une réponse, puis la pause qui suit (l'horloge de la page est simulée). */
async function repondre(page: Page, nom: 'J’aime' | 'Je ne sais pas' | 'Je n’aime pas') {
  await bouton(page, nom).click();
  await page.clock.runFor(500);
}

test.describe('S’orienter', () => {
  test('cinq sections et leurs ancres, l’entrée courante dans l’en-tête', async ({ page }) => {
    await page.goto('/orienter/');
    await expect(page.locator('header a[href="/orienter/"]').first()).toHaveAttribute(
      'aria-current',
      'page',
    );
    const ancres = page.getByRole('navigation', { name: 'Sur cette page' }).getByRole('link');
    const cibles = ['#o-situation', '#o-parcours', '#o-activites', '#o-domaines', '#o-faq'];
    expect(await ancres.evaluateAll((liens) => liens.map((l) => l.getAttribute('href')))).toEqual(
      cibles,
    );
    expect(
      await page.locator('main section[id^="o-"]').evaluateAll((s) => s.map((x) => `#${x.id}`)),
    ).toEqual(cibles);
    for (const cible of cibles) await expect(page.locator(`${cible} h2`)).toHaveCount(1);
    await expect(page.locator('main')).toContainText('Ce n’est pas un document officiel');
  });

  test('une situation, un niveau du schéma et un domaine ouvrent leur liste, au nombre annoncé', async ({
    page,
  }) => {
    await page.goto('/orienter/');
    const situation = page.locator('#o-situation').getByRole('link', { name: /^Après le CM2/ });
    await expect(situation).toHaveAttribute('href', '/ecoles/?niveau=C');
    const annonce = Number(/(\d+) écoles?/.exec(await situation.innerText())?.[1]);
    await situation.click();
    expect(await nombreDeLaListe(page)).toBe(annonce);

    await page.goto('/orienter/');
    const lycee = page.locator('#o-parcours').getByRole('link', { name: /^Lycée général/ });
    await expect(lycee).toHaveAttribute('href', '/ecoles/?niveau=L');
    const ecolesDuLycee = Number(/(\d+) écoles?/.exec(await lycee.innerText())?.[1]);
    await lycee.click();
    expect(await nombreDeLaListe(page)).toBe(ecolesDuLycee);

    // Les dix domaines : un groupe fourni est un lien, un groupe sans formation n'en est pas un.
    await page.goto('/orienter/');
    const domaines = page.locator('#o-domaines li');
    await expect(domaines).toHaveCount(10);
    const fournis = page.locator('#o-domaines li a');
    expect(await fournis.count()).toBeGreaterThan(0);
    expect(await fournis.count()).toBeLessThan(10);
    await expect(page.locator('#o-domaines li:not(:has(a))').first()).toContainText(
      'Pas encore de formation documentée',
    );
    const domaine = fournis.first();
    expect(await domaine.getAttribute('href')).toMatch(/^\/ecoles\/\?domaine=[a-z-]+(,[a-z-]+)*$/);
    const ecolesDuDomaine = Number(/(\d+) écoles?/.exec(await domaine.innerText())?.[1]);
    await domaine.click();
    expect(await nombreDeLaListe(page)).toBe(ecolesDuDomaine);
  });

  test(
    'six activités, une réponse par geste, des pistes vers leur liste, et rien ne quitte le navigateur',
    { tag: '@critique' },
    async ({ page, context, baseURL }) => {
      await page.clock.install();
      const requetes: { methode: string; url: string }[] = [];
      const journal: string[] = [];
      page.on('console', (m) => journal.push(m.text()));
      await page.goto('/orienter/#o-activites');
      await expect(activites(page)).toHaveAttribute('data-script', 'pret');
      page.on('request', (r) => requetes.push({ methode: r.method(), url: r.url() }));
      await expect(progression(page)).toContainText('Activité 1 sur 6');

      // Un double appui ne répond qu'une fois : la question suivante attend un nouveau geste.
      await bouton(page, 'J’aime').dblclick();
      await expect(progression(page)).toContainText('Activité 2 sur 6');
      await page.clock.runFor(500);
      await expect(progression(page)).toContainText('Activité 2 sur 6');
      await expect(activites(page).locator('[data-annonce]')).toHaveText(/^Activité 2 sur 6 : /);

      // Au clavier : Entrée et Espace répondent, une fois chacun.
      await bouton(page, 'Je ne sais pas').focus();
      await page.keyboard.press('Enter');
      await page.clock.runFor(500);
      await expect(progression(page)).toContainText('Activité 3 sur 6');
      await bouton(page, 'Je n’aime pas').focus();
      await page.keyboard.press(' ');
      await page.clock.runFor(500);
      await expect(progression(page)).toContainText('Activité 4 sur 6');
      await repondre(page, 'Je ne sais pas');
      await repondre(page, 'Je n’aime pas');
      await repondre(page, 'J’aime');

      // Le résultat : le titre reçoit le focus ; les pistes des deux activités aimées, et elles seules.
      const titre = page.getByRole('heading', { name: 'Des pistes à explorer' });
      await expect(titre).toBeFocused();
      const pistes = activites(page).locator('[data-piste]:visible');
      await expect(pistes).toHaveCount(2);
      await expect(pistes.first()).toContainText('réparer un téléphone');
      await expect(pistes.last()).toContainText('ranger et suivre les dossiers');
      await expect(activites(page).locator('[data-aucune]')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );

      // Rien dans l'adresse, aucun stockage, aucun cookie, aucun journal ; seuls des fichiers du site ont été lus.
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/orienter/');
      expect(
        await page.evaluate(async () => ({
          local: localStorage.length,
          session: sessionStorage.length,
          cookie: document.cookie,
          bases: (await indexedDB.databases()).length,
        })),
      ).toEqual({ local: 0, session: 0, cookie: '', bases: 0 });
      expect(await context.cookies()).toEqual([]);
      expect(journal).toEqual([]);
      for (const r of requetes) {
        expect(r.methode, r.url).toBe('GET');
        expect(r.url.startsWith(baseURL ?? ''), r.url).toBe(true);
        expect(new URL(r.url).pathname, r.url).toMatch(/^\/(_astro|dessins)\//);
        expect(new URL(r.url).search, r.url).toBe('');
      }

      // Une piste fournie ouvre la liste de son domaine, au nombre annoncé.
      const lien = pistes.getByRole('link').first();
      expect(await lien.getAttribute('href')).toMatch(/^\/ecoles\/\?domaine=[a-z-]+$/);
      const annonce = Number(/(\d+) écoles?/.exec(await lien.innerText())?.[1]);
      await page.clock.resume();
      await lien.click();
      expect(await nombreDeLaListe(page)).toBe(annonce);
    },
  );

  test('aucune activité aimée : les dix domaines, ou recommencer depuis la première', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/orienter/#o-activites');
    await expect(activites(page)).toHaveAttribute('data-script', 'pret');
    for (let i = 0; i < 6; i++) await repondre(page, 'Je ne sais pas');
    await expect(page.getByRole('heading', { name: 'Des pistes à explorer' })).toBeFocused();
    await expect(activites(page).locator('[data-piste]:visible')).toHaveCount(0);
    await expect(activites(page).locator('[data-aucune]')).toBeVisible();
    await expect(activites(page).getByRole('link', { name: 'Les dix domaines' })).toHaveAttribute(
      'href',
      '#o-domaines',
    );

    await activites(page).getByRole('button', { name: 'Recommencer' }).press('Enter');
    await expect(progression(page)).toBeFocused();
    await expect(progression(page)).toContainText('Activité 1 sur 6');
    await expect(activites(page).locator('[data-resultat]')).toBeHidden();
    await page.clock.runFor(500);
    await repondre(page, 'J’aime');
    await expect(progression(page)).toContainText('Activité 2 sur 6');
  });

  test('maintenir Entrée ne répond pas aux activités suivantes', async ({ page }) => {
    await page.clock.install();
    await page.goto('/orienter/#o-activites');
    await bouton(page, 'J’aime').focus();
    await page.waitForLoadState('networkidle');
    await page.keyboard.down('Enter');
    await expect(progression(page)).toContainText('Activité 2 sur 6');
    // La répétition du clavier est toujours le même appui, même après la pause entre deux réponses.
    await page.clock.runFor(1000);
    await page.keyboard.down('Enter');
    await expect(progression(page)).toContainText('Activité 2 sur 6');
    await page.keyboard.up('Enter');
    await page.clock.runFor(500);
    await page.keyboard.press('Enter');
    await expect(progression(page)).toContainText('Activité 3 sur 6');
  });
});

test.describe('S’orienter, sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('les situations, le schéma, les domaines et les questions restent utiles ; les activités renvoient aux domaines', async ({
    page,
  }) => {
    await page.goto('/orienter/');
    const renvoi = activites(page).getByRole('link', { name: 'Voir les dix domaines' });
    await expect(renvoi).toBeVisible();
    await expect(renvoi).toHaveAttribute('href', '#o-domaines');
    // Aucun bouton qui ne répondrait pas.
    await expect(activites(page).getByRole('button')).toHaveCount(0);
    await expect(page.locator('#o-situation').getByRole('link').first()).toBeVisible();
    await expect(page.locator('#o-parcours').getByRole('link').first()).toBeVisible();
    await expect(page.locator('#o-domaines').getByRole('link').first()).toBeVisible();
    // Une question s'ouvre sans script (un `<details>`).
    const question = page.locator('#o-faq details').first();
    await question.locator('summary').click();
    await expect(question).toHaveAttribute('open', '');
    await expect(page.locator('#o-faq')).toContainText('Ces réponses sont-elles officielles ?');
  });
});
