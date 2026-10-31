import { expect, type Page } from '@playwright/test';

// Les gestes répétés des parcours, sur le site construit avec le faux serveur.

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

export async function seConnecter(page: Page, adresse: string): Promise<void> {
  await page.goto(adresse);
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
}

/** Remplit Ajouter 1/3 à 3/3 depuis « Mon lot », puis revient sur « Mon lot ». */
export async function ajouterUneEcole(page: Page, n: number) {
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  await expect(page.getByText('dans votre lot')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByLabel("Nom sur l'enseigne").fill(`[École ${n}]`);
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page.getByLabel('Sa fonction').selectOption('promoteur');
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await page.getByLabel(/Son WhatsApp/).fill(`06 123 45 6${n}`);
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await page.getByRole('link', { name: 'Mon lot' }).click();
}
