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

/**
 * Attend que le téléphone ait fini sa première lecture (les écoles connues gardées en mémoire). « Mon secteur » s'affiche
 * dès le profil lu : couper le réseau avant la fin laisse le téléphone sans rien à comparer pour « Doublon possible ».
 */
export async function attendreLaLecture(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>((resoudre) => {
              const q = indexedDB.open('ntanova-relais');
              q.onerror = () => resoudre(false);
              q.onsuccess = () => {
                const db = q.result;
                if (!db.objectStoreNames.contains('memoire')) return resoudre(false);
                const l = db.transaction('memoire').objectStore('memoire').get('ecoles');
                l.onsuccess = () => resoudre(l.result !== undefined);
                l.onerror = () => resoudre(false);
              };
            }),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** Lot H : la carte d'une mission sur l'accueil (« Vos missions »). */
export const carteDeMission = (page: Page) =>
  page.getByRole('region', { name: 'Vos missions' }).getByRole('link');

/** Lot H : depuis l'accueil, ouvre la mission (la première), puis « Prendre la photo » (la contre-visite commence). */
export async function commencerLaMission(page: Page) {
  await expect(carteDeMission(page).first()).toBeVisible({ timeout: 15_000 });
  await carteDeMission(page).first().click();
  await page.getByRole('button', { name: 'Prendre la photo' }).click();
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
  await page
    .getByRole('group', { name: 'Qui ?' })
    .getByRole('button', { name: 'Promoteur', exact: true })
    .click();
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await page.getByLabel(/Son WhatsApp/).fill(`06 123 45 6${n}`);
  await envoyerSansBonus(page);
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await page.getByRole('link', { name: 'Missions' }).click();
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
  await attendreLaLecture(page);
  await ajouterUneEcole(page, 1, options);
  await toutEstEnvoye(page);
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
/**
 * Publie « [École 1] », prête, depuis sa ligne (planche « Écoles » : la ligne d'une école prête porte « Publier »). Le
 * nom d'avant reste : les parcours publiaient la zone Tié-Tié, où elle est la seule école prête.
 */
export async function publierLaZoneTieTie(page: Page) {
  await page
    .getByRole('row', { name: /\[École 1\]/ })
    .getByRole('button', { name: 'Publier', exact: true })
    .click();
  await expect(page.getByRole('status').first()).toContainText('[École 1] est publiée');
}

/**
 * Planche « À valider » : l'enseigne se dit publiable d'une bascule « Photo publiable » (ordinateur), ou de « Publique »
 * dans « Photos du relevé » (téléphone). Remplace « Contrôler pour publication ».
 */
export async function marquerPubliable(page: Page) {
  const bascule = page.getByRole('switch', { name: 'Photo publiable' }).filter({ visible: true });
  if ((await bascule.count()) > 0) {
    await bascule.click();
    await expect(bascule).toHaveAttribute('aria-checked', 'true');
    return;
  }
  const publique = page
    .getByRole('group', { name: /^L'enseigne ou l'entrée : publique ou écartée \?$/ })
    .getByRole('button', { name: 'Publique', exact: true });
  await publique.click();
  await expect(publique).toHaveAttribute('aria-pressed', 'true');
}

/** « Refuser » : à droite de la barre sur ordinateur, derrière « ⋯ » sur téléphone (planche). */
export async function ouvrirLeRefus(page: Page) {
  await fermerContacts(page);
  const direct = page
    .getByRole('button', { name: 'Refuser', exact: true })
    .filter({ visible: true });
  if ((await direct.count()) === 0) {
    await page
      .getByRole('group', { name: 'Accepter, corriger ou refuser' })
      .locator('summary')
      .filter({ visible: true })
      .click();
  }
  await page
    .getByRole('button', { name: 'Refuser', exact: true })
    .filter({ visible: true })
    .click();
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

/**
 * Ouvre la fiche d'une école depuis la liste (admin v2 : en plein écran, `#ecoles/fiche/<id>`, par le nom de la ligne),
 * puis sa rubrique : la carte de la rubrique (planche « Fiche d'école »), ou le menu « ⋯ » de la fiche pour la mission,
 * le retrait et la fusion.
 */
export async function ouvrirFiche(ligne: Locator) {
  const page = ligne.page();
  await fermerLeTiroir(page);
  if (page.url().includes('#ecoles/fiche/')) {
    await page.evaluate(() => (location.hash = '#ecoles'));
    await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeAttached();
    await toutesLesEcoles(page);
  }
  // La liste s'ouvre sur « À publier » : la ligne cherchée peut être dans « Toutes ».
  if (!(await ligne.isVisible())) await toutesLesEcoles(page);
  await ligne.getByRole('link').first().click();
  await expect(page.locator('article[aria-label^="Fiche de "]')).toBeVisible();
}

const cartes: Record<string, string> = {
  Informations: 'Modifier les informations',
  Agrément: 'Modifier les informations',
  'Contact public': 'Contact et inscriptions : ouvrir',
  Inscriptions: 'Contact et inscriptions : ouvrir',
  'Frais déclarés': 'Frais : ouvrir',
  Équipements: 'Sur place : ouvrir',
  'Formations du supérieur': 'Formations : ouvrir',
  'Mot de la direction': 'Mot de la direction : ouvrir',
  Nouvelles: 'Nouvelles : ouvrir',
  Admission: 'Admission : ouvrir',
  'À compléter': 'Compléter la fiche',
  Images: 'Changer la couverture',
  Logo: 'Ajouter le logo',
};
const gestes: Record<string, RegExp> = {
  Mission: /^(Confier à un relais|Mission en cours…)$/,
  retirer: /^Retirer de la publication$/,
  fusionner: /^Fusionner avec un doublon$/,
};

export async function ouvrirGestion(ligne: Locator, section: string) {
  const page = ligne.page();
  await ouvrirFiche(ligne);
  const fiche = page.locator('article[aria-label^="Fiche de "]');
  if (gestes[section]) {
    await page
      .locator('summary[aria-label^="Autres actions pour "]')
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole('button', { name: gestes[section] })
      .filter({ visible: true })
      .first()
      .click();
  } else if (section === 'Photo publique') {
    await fiche
      .getByRole('button', { name: /^(Gérer|Photo( de travail)? : .+)$/ })
      .filter({ visible: true })
      .first()
      .click();
  } else {
    await fiche
      .getByRole('button', { name: cartes[section] ?? `${section} : ouvrir`, exact: true })
      .filter({ visible: true })
      .first()
      .click();
  }
}

/** La fiche d'une école ouverte en plein écran (admin v2). */
export const ficheAdmin = (page: Page, nom: string) =>
  // Un tiroir ouvert de la fiche (« Sur place · nom ») est ajouté en fin de page : il passe devant la fiche ; une rubrique
  // en page (« Frais · nom ») remplace la fiche.
  page
    .locator(
      `[role="dialog"][aria-label$="· ${nom}"], [role="alertdialog"][aria-label$="· ${nom}"], article[aria-label$="· ${nom}"], article[aria-label="Fiche de ${nom}"]`,
    )
    .last();

/** La fiche d'école ouverte, ou son tiroir s'il y en a un (admin v2 : l'ancien `article.fiche-admin`). */
export const ficheOuverte = (page: Page) =>
  page
    .locator(
      '[role="dialog"], [role="alertdialog"], article[aria-label^="Fiche de "], article[aria-label*=" · "]',
    )
    .last();

/** Referme le tiroir ou la fenêtre ouverte (Échap), s'il y en a une : la page est derrière. */
export async function fermerLeTiroir(page: Page): Promise<void> {
  const ouvert = page.locator('[role="dialog"], [role="alertdialog"]');
  if ((await ouvert.count()) > 0) {
    await page.keyboard.press('Escape');
    await expect(ouvert).toHaveCount(0);
  }
}

/** Revient de la fiche d'une école à la liste « Écoles » (flèche de la barre du haut, ou lien sur ordinateur). */
export async function retourAuxEcoles(page: Page) {
  await fermerLeTiroir(page);
  await page
    .getByRole('link', { name: /^(Retour : Écoles|← Écoles|Écoles)$/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeAttached();
  await toutesLesEcoles(page);
}

/** Referme le tiroir des contacts, s'il est ouvert : la barre de décision est dessous. */
export async function fermerContacts(page: Page): Promise<void> {
  const tiroir = page.getByRole('dialog', { name: 'Contact et échanges avec la direction' });
  if (await tiroir.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(tiroir).toHaveCount(0);
  }
}

/** Le bloc privé est secondaire ; les parcours de contact l'ouvrent explicitement. */
export async function ouvrirContacts(page: Page): Promise<void> {
  // Admin v2 : la ligne « Contacts de la direction » des faits ouvre le tiroir.
  const tiroir = page.getByRole('dialog', { name: 'Contact et échanges avec la direction' });
  if (await tiroir.isVisible()) return;
  await page.getByRole('button', { name: 'Contact et échanges avec la direction' }).click();
  await expect(tiroir).toBeVisible();
}

/**
 * Choisit une zone dans l'arbre de l'onglet Zones. Sous 72 rem, une zone choisie remplace la liste : on y revient d'abord
 * par « Toutes les zones ».
 */
/** Sur un petit écran, une zone choisie remplace la liste : la flèche de la barre verte la rend. */
export async function retourAuxZones(page: Page): Promise<void> {
  // Sous 64 rem seulement : une zone choisie y remplace la liste.
  if ((page.viewportSize()?.width ?? 0) >= 1024) return;
  if (!/#zones\/./.test(page.url())) return;
  await page
    .getByRole('link', { name: 'Retour : Zones' })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('region', { name: 'Liste des zones' })).toBeVisible();
}

export async function choisirLaZone(page: Page, nom: RegExp | string): Promise<void> {
  await retourAuxZones(page);
  await page
    .getByRole('region', { name: 'Liste des zones' })
    .getByRole('button', { name: nom })
    .click();
}

/**
 * Admin v2 : ouvre un écran par son nom. Aujourd'hui, À valider, Écoles et Relais sont dans la barre (du bas sur téléphone,
 * de côté sur ordinateur) ; Zones, Paie et Santé des envois, sur téléphone, dans la feuille « Plus ».
 */
/** Admin v2 : « Écoles » s'ouvre sur « À publier » (planche) ; les parcours regardent toutes les écoles. */
export async function toutesLesEcoles(page: Page) {
  await page
    .getByRole('group', { name: 'Filtrer par état' })
    .getByRole('button', { name: /^Toutes/ })
    .click();
}

export async function ouvrirLesEcoles(page: Page) {
  await fermerContacts(page);
  await page.getByRole('link', { name: 'Écoles' }).click();
  await toutesLesEcoles(page);
}

export async function ouvrirEcranAdmin(page: Page, nom: string) {
  // Le lien porte aussi son compteur (« Relais 1 relais à activer ») ou son détail (« Paie vendredi »).
  const lien = new RegExp(`^${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zà-ÿ])`, 'i');
  // L'écran doit être là avant de compter les liens (sinon on ouvrirait « Plus » pour rien).
  await expect(
    page
      .getByRole('link', { name: /^Aujourd’hui/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  const direct = page.getByRole('link', { name: lien }).filter({ visible: true });
  if ((await direct.count()) === 0) {
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('button', { name: 'Plus' })
      .click();
  }
  await page.getByRole('link', { name: lien }).filter({ visible: true }).first().click();
}

/** Admin v2 : ouvre le tiroir « Règles » de l'écran (le bouton sur ordinateur, « Plus » sur téléphone). */
export async function ouvrirRegles(page: Page) {
  const bouton = page.getByRole('button', { name: /^Règles : / }).locator('visible=true');
  if ((await bouton.count()) > 0) await bouton.first().click();
  else {
    await page
      .getByRole('navigation', { name: 'Navigation' })
      .getByRole('button', { name: 'Plus' })
      .click();
    await page.getByRole('button', { name: 'Règles de cet écran' }).click();
  }
  await expect(page.getByRole('dialog', { name: /^Règles : / })).toBeVisible();
}

/** v2 (planche « Mes fiches ») : la ligne d'une fiche dans la liste (son état, sa phrase, son badge ; aucun geste). */
export const ligneDeFiche = (page: Page, nom: string) => page.locator(`li[data-fiche="${nom}"]`);

/**
 * v2 : les gestes d'une fiche (Corriger, Réessayer, Modifier, Retirer du téléphone…) sont dans la fiche, pas dans la liste.
 * Ouvre la fiche depuis « Mes fiches » et rend l'écran de la fiche.
 */
export async function ouvrirMaFiche(page: Page, nom: string): Promise<Locator> {
  if (!(await page.getByRole('heading', { level: 1, name: nom }).isVisible())) {
    if (!(await ligneDeFiche(page, nom).isVisible())) await page.goto('/relais/#fiches');
    await ligneDeFiche(page, nom).getByRole('link').click();
  }
  await expect(page.getByRole('heading', { level: 1, name: nom })).toBeVisible();
  return page.getByRole('main');
}

/**
 * Attend que tout soit parti. Planche v2 : « Tout est envoyé » se lit sur l'accueil (Missions), jamais dans « Mes fiches » ;
 * on y passe le temps de le lire, puis on revient sur l'écran d'avant.
 */
export async function toutEstEnvoye(page: Page, timeout = 15_000) {
  const avant = await page.evaluate(() => location.hash);
  const surLAccueil = ['', '#', '#missions', '#lot'].includes(avant);
  const barre = page.getByRole('navigation', { name: 'Espace relais' });
  if (!surLAccueil) await barre.getByRole('link', { name: 'Missions' }).click();
  await expect(page.getByText('Tout est envoyé')).toBeVisible({ timeout });
  if (surLAccueil) return;
  if (avant.startsWith('#fiches')) await barre.getByRole('link', { name: 'Mes fiches' }).click();
  else await page.evaluate((h) => (location.hash = h), avant);
}

/**
 * Attend que la fiche en cours soit écrite dans le téléphone (IndexedDB `fiches`) avec ce qu'on vient d'y mettre.
 * L'écran se met à jour avant l'écriture (`modifier`, `Ajouter.tsx`) : un rechargement juste après un toucher perdrait le
 * dernier choix (17/11 : « 3 filières au lieu de 4 », environ 1 fois sur 8). On attend l'écriture, jamais un délai.
 */
export async function attendreLaFicheGardee(
  page: Page,
  champ: string,
  longueur: number,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ champ }) =>
            new Promise<number>((resoudre) => {
              const q = indexedDB.open('ntanova-relais');
              q.onerror = () => resoudre(-1);
              q.onsuccess = () => {
                const l = q.result.transaction('fiches').objectStore('fiches').getAll();
                l.onsuccess = () =>
                  resoudre(
                    Math.max(
                      -1,
                      ...(l.result as Record<string, unknown>[]).map((f) =>
                        Array.isArray(f[champ]) ? (f[champ] as unknown[]).length : -1,
                      ),
                    ),
                  );
                l.onerror = () => resoudre(-1);
              };
            }),
          { champ },
        ),
      { timeout: 10_000 },
    )
    .toBe(longueur);
}
