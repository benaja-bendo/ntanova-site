import { expect, test } from '@playwright/test';

// Revue du lot 1 (24/11) : une étiquette d'exemple ne s'isole pas du nom ; les 44 px d'un lien doivent lui appartenir.
for (const [chemin, selecteur] of [
  ['/', '.exemple-nom'],
  ['/demo/fiche-ecole/', 'h1'],
] as const) {
  test(`l’étiquette Exemple accompagne le dernier mot du nom (${chemin})`, async ({ page }) => {
    for (const largeur of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto(chemin);
      await page.evaluate(() => document.fonts.ready);
      const position = await page.locator(selecteur).evaluate((nom) => {
        const etiquette = nom.querySelector('.etiquette-exemple')!;
        const textes = document.createTreeWalker(nom, NodeFilter.SHOW_TEXT, {
          acceptNode: (texte) =>
            texte.textContent?.trim() && !etiquette.contains(texte)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        });
        let dernier: Node | null = null;
        while (textes.nextNode()) dernier = textes.currentNode;
        const texte = dernier!.textContent!.trimEnd();
        const mot = document.createRange();
        mot.setStart(dernier!, texte.search(/\S+$/));
        mot.setEnd(dernier!, texte.length);
        const m = mot.getBoundingClientRect();
        const e = etiquette.getBoundingClientRect();
        return {
          recouvrementVertical: Math.min(m.bottom, e.bottom) - Math.max(m.top, e.top),
          espaceHorizontal: e.left - m.right,
          largeurPage: document.documentElement.scrollWidth,
        };
      });
      expect(
        position.recouvrementVertical,
        `${largeur} px : même ligne que le nom`,
      ).toBeGreaterThan(0);
      expect(
        position.espaceHorizontal,
        `${largeur} px : après le dernier mot`,
      ).toBeGreaterThanOrEqual(0);
      expect(position.largeurPage, `${largeur} px : aucun débordement`).toBeLessThanOrEqual(
        largeur,
      );
    }
  });
}

for (const largeur of [390, 768, 1440]) {
  test(`chaque lien du pied dispose de sa propre cible à la souris (${largeur} px)`, async ({
    browser,
    baseURL,
  }) => {
    // Le profil Android des parcours a un pointeur tactile ; le défaut hérité n'existait qu'à la souris.
    const contexte = await browser.newContext({
      baseURL: baseURL ?? '',
      viewport: { width: largeur, height: 900 },
      hasTouch: false,
      isMobile: false,
    });
    const page = await contexte.newPage();
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    for (const lien of await page.locator('.pied-groupe a').all()) {
      await lien.scrollIntoViewIfNeeded();
      const cible = await lien.evaluate((element) => {
        const b = element.getBoundingClientRect();
        const x = b.x + b.width / 2;
        return {
          nom: element.textContent?.trim(),
          hauteur: b.height,
          haut: document.elementFromPoint(x, b.top + 1)?.closest('a') === element,
          bas: document.elementFromPoint(x, b.bottom - 1)?.closest('a') === element,
        };
      });
      expect(cible.hauteur, cible.nom).toBeGreaterThanOrEqual(44);
      expect(cible.haut, `${cible.nom} : haut de la cible`).toBe(true);
      expect(cible.bas, `${cible.nom} : bas de la cible`).toBe(true);
    }
    await contexte.close();
  });
}
