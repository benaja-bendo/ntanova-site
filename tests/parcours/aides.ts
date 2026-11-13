import { expect, type BrowserContext, type Page, type Locator } from '@playwright/test';

// Les gestes répétés des parcours, sur le site construit avec le faux serveur.

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

export async function seConnecter(page: Page, adresse: string): Promise<void> {
  await page.goto(adresse);
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
}

/** Ouvre Ajouter 1/3 depuis « Mon secteur », prend la photo, et attend que la position soit prise. */
export async function prendrePhotoEtPosition(page: Page, repere: string | null = 'Face au marché') {
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  // v2 (13/11) : le repère (« Comment la trouver ? ») est à l'étape 1 ; sans lui, « Suivant » fait une relance.
  if (repere !== null) await page.getByLabel('Comment la trouver ?').fill(repere);
}

/** v2 (13/11) : depuis l'étape 3, « Envoyer maintenant » puis « Envoyer sans bonus » (la fenêtre de confirmation). */
export async function envoyerSansBonus(page: Page) {
  await page.getByRole('button', { name: 'Envoyer maintenant' }).click();
  await page
    .getByRole('alertdialog', { name: 'Envoyer sans le bonus ?' })
    .getByRole('button', { name: 'Envoyer sans bonus' })
    .click();
}

/** Remplit Ajouter 1/3 à 3/3 depuis « Mon secteur », puis revient sur « Mon secteur ». */
export async function ajouterUneEcole(
  page: Page,
  n: number,
  options: { programme?: string; numeroEnseigne?: string; repere?: string } = {},
) {
  await prendrePhotoEtPosition(page, options.repere ?? 'Face au marché');
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByLabel("Nom de l'établissement").fill(`[École ${n}]`);
  await page.getByRole('button', { name: 'Primaire' }).click();
  if (options.programme) {
    await page.getByLabel(/Programme, langues ou autre mention écrite/).fill(options.programme);
  }
  if (options.numeroEnseigne) {
    await page.getByLabel(/Numéro écrit sur l.enseigne/).fill(options.numeroEnseigne);
  }
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page.getByLabel('Sa fonction').selectOption('promoteur');
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await page.getByLabel(/Son WhatsApp/).fill(`06 123 45 6${n}`);
  await envoyerSansBonus(page);
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await page.getByRole('link', { name: 'Mon secteur' }).click();
}

/**
 * Un relais saisit une fiche (« [École 1] ») et l'envoie : le faux serveur la garde
 * « à valider », avec sa photo et le contact de la direction.
 * Le test appelant déclare `test.use({ permissions: ['geolocation'] })`.
 */
export async function uneFicheEnvoyee(
  page: Page,
  context: BrowserContext,
  options: {
    programme?: string;
    numeroEnseigne?: string;
    repere?: string;
    position?: { latitude: number; longitude: number };
  } = {},
) {
  await context.setGeolocation({
    ...(options.position ?? { latitude: -4.8, longitude: 11.9 }),
    accuracy: 8,
  });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  // Le secteur est gardé dans le téléphone avec le reste de la lecture : on attend qu'il y soit (le téléphone peut
  // tomber en panne de réseau juste après).
  await expect(
    page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
  ).toBeVisible();
  await ajouterUneEcole(page, 1, options);
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
  // Le faux serveur a bien reçu le relevé, la photo et le contact.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
          string,
          Record<string, unknown> | undefined
        >;
        return ['releves', 'photos', 'contacts'].map((t) => Object.keys(etat[t] ?? {}).length);
      }),
    )
    .toEqual([1, 1, 1]);
}

/** Dans l'onglet « Écoles » : publie d'un coup les écoles prêtes de la zone Tié-Tié (une ville, un arrondissement…). */
export async function publierLaZoneTieTie(page: Page) {
  await page.getByLabel('Zone à publier').selectOption('d-pn-tie-tie');
  await page.getByRole('button', { name: 'Publier cette zone' }).click();
}

/** L'administration ouvre la fiche « [École 1] » dans « À valider ». */
export async function ouvrirLaFiche(page: Page) {
  await page.goto('/admin/#valider');
  await expect(page.getByRole('heading', { name: 'À valider' })).toBeVisible();
  await page.getByRole('link', { name: /\[École 1\]/ }).click();
  await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
}

/**
 * Les textes d'une zone qui se lisent mal : le contraste (WCAG) de leur couleur sur le
 * fond réel, le premier fond opaque en remontant, est sous 4,5:1 (3:1 pour un grand
 * texte : 24 px, ou 18,7 px en gras). Un contrôle désactivé n'est pas compté.
 * Rend une phrase par défaut, pour que l'échec dise ce qu'il faut corriger.
 */
export async function textesPeuLisibles(page: Page, selecteur: string): Promise<string[]> {
  return page.locator(selecteur).evaluateAll((racines) => {
    type Couleur = [number, number, number, number];
    const lire = (css: string): Couleur => {
      const n = (css.match(/[\d.]+/g) ?? []).map(Number);
      return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
    };
    const sur = (dessus: Couleur, dessous: Couleur): Couleur => {
      const a = dessus[3];
      return [
        dessus[0] * a + dessous[0] * (1 - a),
        dessus[1] * a + dessous[1] * (1 - a),
        dessus[2] * a + dessous[2] * (1 - a),
        1,
      ];
    };
    const fond = (el: Element | null): Couleur => {
      if (!el) return [255, 255, 255, 1];
      const c = lire(getComputedStyle(el).backgroundColor);
      return c[3] >= 1 ? c : sur(c, fond(el.parentElement));
    };
    const luminance = (c: Couleur) => {
      const [r = 0, g = 0, b = 0] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const trouves: string[] = [];
    for (const racine of racines) {
      for (const el of [racine, ...racine.querySelectorAll('*')]) {
        const texte = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (!texte) continue;
        const style = getComputedStyle(el);
        const boite = el.getBoundingClientRect();
        if (style.visibility === 'hidden' || boite.width < 2 || boite.height < 2) continue;
        if (el.closest(':disabled, [aria-disabled="true"]')) continue;

        const dessous = fond(el);
        const lettres = sur(lire(style.color), dessous);
        const [claire = 0, sombre = 0] = [luminance(lettres), luminance(dessous)].sort(
          (a, b) => b - a,
        );
        const rapport = (claire + 0.05) / (sombre + 0.05);
        const taille = parseFloat(style.fontSize);
        const grand = taille >= 24 || (Number(style.fontWeight) >= 700 && taille >= 18.66);
        const seuil = grand ? 3 : 4.5;
        if (rapport < seuil) {
          trouves.push(`« ${texte.slice(0, 48)} » : ${rapport.toFixed(2)}:1, il faut ${seuil}:1`);
        }
      }
    }
    return trouves;
  });
}

/** Ouvre la gestion depuis la liste, sans contourner les contrôles visibles. */
export async function ouvrirGestion(ligne: Locator, section: string) {
  if (section === 'retirer' || section === 'fusionner') {
    await ligne.locator('summary').click();
    await ligne
      .getByRole('button', {
        name: section === 'retirer' ? 'Retirer du site' : 'Fusionner…',
        exact: true,
      })
      .click();
  } else {
    await ligne.getByRole('button', { name: 'Gérer la fiche', exact: true }).click();
    if (section !== 'Informations')
      await ligne
        .getByRole('navigation', { name: 'Sections de la fiche' })
        .getByRole('button', { name: section, exact: true })
        .click();
  }
}

/** Le bloc privé est secondaire ; les parcours de contact l'ouvrent explicitement. */
export async function ouvrirContacts(page: Page): Promise<void> {
  const section = page.locator('details.section-repliable');
  await section.locator('summary').waitFor();
  if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
}

/**
 * Choisit une zone dans l'arbre de l'onglet Zones. Sous 72 rem, une zone choisie remplace la liste : on y revient d'abord
 * par « Toutes les zones ».
 */
export async function choisirLaZone(page: Page, nom: RegExp | string): Promise<void> {
  const retour = page.getByRole('link', { name: '← Toutes les zones' });
  if (await retour.isVisible()) await retour.click();
  await page
    .getByRole('region', { name: 'Liste des zones' })
    .getByRole('button', { name: nom })
    .click();
}
