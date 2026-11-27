import {
  carteDeMission,
  envoyerSansBonus,
  ouvrirGestion,
  ouvrirLaFiche,
  toutEstEnvoye,
  uneFicheEnvoyee,
  ouvrirLesEcoles,
  ficheOuverte,
} from './aides';
import { expect, test } from '@playwright/test';
import { seConnecter } from './aides';

// Une école connue sans position, confiée à un relais, relevée sur place, puis
// située puis publiée par l'administration (faux serveur : l'utilisateur est les deux).

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

test.use({ permissions: ['geolocation'] });

test('une école à situer, confiée à un relais, est relevée sur place puis publiée', async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });

  // L'administration confie l'école à situer.
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await expect(
    ligne
      .getByText(/Sans position|Pas sur la carte/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await ouvrirGestion(ligne, 'Mission');
  // Une école sans position : la mission par défaut est de la situer.
  await expect(ficheOuverte(page).getByLabel('Ce que le relais doit faire')).toHaveValue('locate');
  await ficheOuverte(page).getByLabel('À vérifier').fill('Le nom exact');
  await ficheOuverte(page).getByRole('button', { name: 'Confier', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);

  // Le relais la voit dans « Vos missions » (lot H), ouvre la mission et la complète.
  await page.goto('/relais/');
  await expect(carteDeMission(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(carteDeMission(page)).toContainText('À situer');
  await carteDeMission(page).click();
  await expect(page.getByText('À vérifier : Le nom exact')).toBeVisible();
  await expect(page.getByText(/La situer/)).toBeVisible();
  await page.getByRole('button', { name: 'Prendre la photo' }).click();
  // L'écran dit ce que le relais fait, avec un mot qu'il connaît : « Compléter », comme le bouton qu'il vient de toucher.
  await expect(
    page.getByRole('banner').getByText('Compléter une école', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Compléter\s*: \[École à situer\]/)).toBeVisible();
  // Pour « situer », l'encart dit ce qui manque, d'après ce que NTanova sait de l'école (ticket #55, PR 4).
  const encart = page.getByRole('region', { name: 'À faire sur cette école' });
  await expect(encart).toContainText('sans savoir où elle est');
  await expect(encart).toContainText('Le nom exact');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByText('Position prise')).toBeVisible();
  await page.getByLabel('Comment la trouver ?').fill('Face au marché');
  await expect(page.getByText('Est-ce la même école ?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByLabel("Nom de l'établissement")).toHaveValue('[École à situer]');
  await page.getByLabel("Nom de l'établissement").fill('[École à situer, nom exact]');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Personne', exact: true }).click();
  await envoyerSansBonus(page);
  await page.getByRole('link', { name: 'Missions' }).click();
  await toutEstEnvoye(page, 15_000);
  await expect(page.getByText(/À compléter/)).toHaveCount(0);

  // L'administration la situe et la publie.
  await page.goto('/admin/#valider');
  await page.getByRole('link', { name: /\[École à situer, nom exact\]/ }).click();
  await expect(page.getByText('Contre-visite', { exact: true }).first()).toBeVisible();
  // Ticket 236 : la position manquante se remplit ; le nom ne change que si on le choisit.
  const comparaison = page.getByRole('region', { name: 'Ce qui change sur la fiche' });
  await expect(
    comparaison
      .getByRole('group', { name: 'Position' })
      .getByRole('button', { name: 'Ajouter', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await comparaison
    .getByRole('group', { name: 'Nom de l’école' })
    .getByRole('button', { name: 'Remplacer' })
    .click();
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/est mise à jour/);
  await ouvrirLesEcoles(page);
  const situee = page.getByRole('row', { name: /\[École à situer, nom exact\]/ });
  await expect(situee.getByRole('button', { name: 'Publier', exact: true })).toBeVisible();
  await situee.getByRole('button', { name: 'Publier', exact: true }).click();
  const publiee = page.getByRole('row', { name: /\[École à situer, nom exact\]/ });
  await expect(
    publiee.getByText('Publiée', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  // Le quartier et l'arrondissement du même nom ne s'affichent qu'une fois.
  await expect(publiee).toContainText('Tié-Tié');
});

// Ticket 236 (27/11) : quand la direction a dit non, publier le redit, avec le jour, et demande une confirmation ; rien
// n'est bloqué pour toujours.
test('publier après un refus de la direction demande une confirmation, ligne par ligne ou d’un coup', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  // Le relais avait noté un refus ; une seconde école prête, sans rien à signaler.
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      releves: Record<string, { direction: string }>;
      campus: Record<string, Record<string, unknown>>;
    };
    for (const r of Object.values(e.releves)) r.direction = 'refus';
    const modele = Object.values(e.campus).find((c) => c['nom'] === '[École 1]')!;
    const id = '00000000-0000-4000-8000-0000000000d4';
    e.campus[id] = { ...modele, id, institutionId: id, nom: '[École 2]' };
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await ouvrirLesEcoles(page);
  const etat = () =>
    page.evaluate(() => {
      const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
        campus: Record<string, { nom: string; publication: string }>;
      };
      return Object.fromEntries(
        Object.values(e.campus)
          .filter((c) => /\[École \d\]/.test(c.nom))
          .map((c) => [c.nom, c.publication]),
      );
    });

  await page.getByRole('button', { name: 'Publier les 2 d’un coup' }).click();
  const avant = page.getByRole('alertdialog', { name: /Avant de publier/ });
  await expect(avant).toContainText('[École 1]');
  await expect(avant).toContainText('La direction a dit non');
  await avant.getByRole('button', { name: 'Publier l’autre' }).click();
  await expect.poll(etat).toEqual({ '[École 1]': 'prete', '[École 2]': 'publiee' });

  const publier = page
    .getByRole('row', { name: /\[École 1\]/ })
    .getByRole('button', { name: 'Publier', exact: true });
  await publier.click();
  await avant.getByRole('button', { name: 'Ne pas publier' }).click();
  await expect(avant).toHaveCount(0);
  expect((await etat())['[École 1]']).toBe('prete');
  await publier.click();
  await avant.getByRole('button', { name: 'Publier malgré ce refus' }).click();
  await expect.poll(etat).toEqual({ '[École 1]': 'publiee', '[École 2]': 'publiee' });
});
