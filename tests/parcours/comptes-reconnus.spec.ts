import { expect, test } from '@playwright/test';
import { seConnecter, ouvrirRegles } from './aides';

// Un compte en attente que l'administration reconnaît (ticket #78), construit avec le faux serveur : l'adresse de
// connexion du relais s'affiche à côté de son prénom (de quoi relier le compte à la personne), « Écarter » met de côté
// un inconnu, le menu dit combien attendent, et le relais en attente sait quoi faire (écrire à NTanova avec son adresse).

test.describe('l’administration reconnaît un compte à activer', () => {
  test('l’adresse s’affiche, le compte à activer est en bandeau, et on peut l’activer ou l’écarter', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#relais');
    await expect(page.getByRole('heading', { name: 'Relais', level: 1 })).toBeVisible();

    // Planche : le compte à activer est un bandeau au-dessus du tableau, avec son adresse et « Activer ».
    const attente = page.getByRole('region', { name: 'Compte à activer : [Relais en attente]' });
    await expect(attente).toContainText('marie@exemple.test');
    await expect(attente).toContainText('Un compte à activer');
    await expect(attente.getByRole('button', { name: 'Activer', exact: true })).toBeVisible();

    // Écarter (menu « ⋯ ») : un compte inconnu passe « suspendu », il ne reste pas « à activer ».
    await attente.locator('summary').click();
    await attente.getByRole('button', { name: 'Écarter ce compte' }).click();
    await expect(page.getByRole('status')).toHaveText(/est écarté/);
    await expect(attente).toHaveCount(0);
    const ligne = page.getByRole('row', { name: /\[Relais en attente\]/ });
    const autres = page.getByText(/autres? relais, sans envoi cette semaine/);
    if (!(await ligne.isVisible())) await autres.click();
    await expect(ligne).toContainText('Suspendu');

    // Et il peut revenir : « Réactiver ».
    await ligne.locator('summary').click();
    await ligne.getByRole('button', { name: 'Réactiver' }).click();
    await expect(page.getByRole('status')).toHaveText(/est actif/);
    if (!(await ligne.isVisible())) await autres.click();
    await expect(ligne).toContainText(/Actif|Jamais connecté/);
  });

  test('le menu dit combien de comptes attendent, dès la page d’arrivée', async ({ page }) => {
    await seConnecter(page, '/admin/');
    await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeAttached();
    const menu = page.getByRole('link', { name: /^Relais/ }).locator('visible=true');
    await expect(menu).toContainText('1');

    await menu.click();
    await page
      .getByRole('region', { name: 'Compte à activer : [Relais en attente]' })
      .getByRole('button', { name: 'Activer', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText(/est actif/);
    // Plus aucun compte à activer : le compteur disparaît.
    await expect(page.getByRole('link', { name: /^Relais/ })).not.toContainText('1');
  });

  test('l’écran ne demande plus d’ajouter l’adresse dans Google Cloud, mais garde la note pour le mode test', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#relais');
    await expect(page.getByRole('heading', { name: 'Relais', level: 1 })).toBeVisible();
    await expect(page.getByText(/Avant, ajoute son adresse Gmail/)).toHaveCount(0);
    // Admin v2 : la règle est dans le tiroir « Règles ».
    await ouvrirRegles(page);
    await expect(page.getByText(/dès sa première connexion, « à activer »/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByText('Quelqu’un ne peut pas se connecter ?').click();
    await expect(page.getByText(/mode « test »/)).toBeVisible();
  });
});

test.describe('le relais en attente sait quoi faire', () => {
  test('il écrit à NTanova avec l’adresse de son compte : NTanova ne peut pas le prévenir sans son numéro', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.evaluate(() => {
      const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
        statut?: string;
      };
      etat.statut = 'en_attente';
      localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
    });
    await page.reload();

    await expect(page.getByText('Compte en attente')).toBeVisible();
    // Plus de « nous vous prévenons sur WhatsApp » : NTanova n'a pas le numéro.
    await expect(page.getByText(/Nous vous prévenons/)).toHaveCount(0);
    await expect(page.getByText(/en donnant l’adresse/)).toBeVisible();

    const lien = page.getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' });
    const adresse = new URL((await lien.getAttribute('href')) ?? '');
    const numero = (process.env['PUBLIC_WHATSAPP'] || '242000000000').replace(/[\s.+()-]/g, '');
    expect(adresse.origin + adresse.pathname).toBe(`https://wa.me/${numero}`);
    const message = adresse.searchParams.get('text') ?? '';
    expect(message).toContain('relais@exemple.test');
    expect(message).toMatch(/activer mon compte/);
  });
});
