// Ticket 203 (20/11/2026), plusieurs sites : le sigle et le nom du site se disent dans « En bref », le titre de la fiche est
// le sigle, et les formations d'un site se copient sur un autre site de la même école. Construit avec le faux serveur.
import { expect, test, type Page } from '@playwright/test';
import { fermerLeTiroir, ouvrirLesEcoles, seConnecter } from './aides';

const SITE_1 = '00000000-0000-4000-8000-0000000003b1';
const SITE_2 = '00000000-0000-4000-8000-0000000003b2';

/** Un institut du supérieur à deux sites : le premier a deux formations, le second aucune. */
async function unInstitutADeuxSites(page: Page) {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  await expect(page.getByRole('row', { name: /\[École à situer\]/ })).toBeVisible();
  await page.evaluate(
    ([site1, site2]) => {
      const cle = 'ntanova-faux-serveur';
      const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
        campus: Record<string, Record<string, unknown>>;
      };
      const modele = Object.values(e.campus)[0]!;
      const commun = {
        ...modele,
        institutionId: site1,
        nom: '[Institut Deux Sites]',
        niveaux: ['superieur'],
        confieeA: null,
      };
      e.campus[site1!] = {
        ...commun,
        id: site1,
        etiquette: 'Site 1 · Avenue',
        formations: [
          {
            cycle: 'superieur',
            titre: 'Licence Gestion',
            domaine: null,
            serie: null,
            diplome: 'licence',
            rythmes: ['jour'],
          },
          {
            cycle: 'superieur',
            titre: 'BTS Transit',
            domaine: null,
            serie: null,
            diplome: 'bts',
            rythmes: ['soir'],
          },
        ],
      };
      e.campus[site2!] = { ...commun, id: site2, etiquette: 'Site 2 · Mpita', formations: [] };
      localStorage.setItem(cle, JSON.stringify(e));
    },
    [SITE_1, SITE_2],
  );
  await page.reload();
}

async function ouvrirLaFicheDuSite(page: Page, id: string) {
  await page.evaluate((x) => (location.hash = `#ecoles/fiche/${x}`), id);
  await expect(page.locator('article[aria-label^="Fiche de "]')).toBeVisible();
}

test('les formations d’un site se copient sur un autre site de la même école, rien de coché d’avance', async ({
  page,
}) => {
  await unInstitutADeuxSites(page);
  await ouvrirLaFicheDuSite(page, SITE_2);
  await page
    .getByRole('button', { name: 'Formations : ouvrir', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const copie = page.getByRole('form', { name: 'Copier depuis un autre site' });
  await expect(copie.getByLabel('Site')).toHaveValue('');
  await copie.getByLabel('Site').selectOption({ label: 'Site 1 · Avenue' });
  await expect(copie.getByRole('checkbox')).toHaveCount(2);
  for (const c of await copie.getByRole('checkbox').all()) await expect(c).not.toBeChecked();
  await copie.getByRole('checkbox', { name: /Licence Gestion/ }).check();
  await copie.getByRole('button', { name: 'Copier la formation' }).click();
  await expect(page.getByRole('status').first()).toContainText('1 formation copiée');
  const section = page.getByRole('region', { name: /Formations/ }).first();
  await expect(section.getByRole('button', { name: 'Détail : Licence Gestion' })).toBeVisible();

  // Une formation déjà là n'a plus de case.
  await copie.getByLabel('Site').selectOption({ label: 'Site 1 · Avenue' });
  await expect(copie.getByRole('checkbox')).toHaveCount(1);
  await expect(copie).toContainText('Licence Gestion · déjà sur ce site');
});

test('« En bref » dit le sigle et le nom du site ; la fiche prend le sigle pour titre', async ({
  page,
}) => {
  await unInstitutADeuxSites(page);
  await ouvrirLaFicheDuSite(page, SITE_2);
  await page
    .getByRole('button', { name: 'Modifier les informations' })
    .filter({ visible: true })
    .first()
    .click();
  const form = page.getByRole('form', { name: 'Modifier [Institut Deux Sites]' });
  await expect(form.getByLabel(/^Sigle/)).toHaveValue('');
  await expect(form.getByLabel(/^Nom du site/)).toHaveValue('Site 2 · Mpita');
  await form.getByLabel(/^Sigle/).fill('IDS');
  await form.getByLabel(/^Nom du site/).fill('Site 2 · Mpita Socoprise');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(form).toBeHidden();
  await fermerLeTiroir(page);
  const fiche = page.locator('article[aria-label^="Fiche de "]');
  // Le titre : le rond sans logo (ticket 236) écrit aussi le sigle.
  await expect(fiche.getByRole('paragraph').filter({ hasText: /^IDS$/ })).toBeVisible();
  await expect(
    fiche.getByRole('paragraph').filter({ hasText: /^\[Institut Deux Sites\]$/ }),
  ).toBeVisible();
  await expect(fiche.getByRole('navigation', { name: 'Les sites de cette école' })).toContainText(
    'Site 2 · Mpita Socoprise',
  );
});
