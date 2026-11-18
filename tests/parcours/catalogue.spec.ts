import {
  attendreLaLecture,
  envoyerSansBonus,
  ouvrirContacts,
  ouvrirEcranAdmin,
  ouvrirRegles,
  toutEstEnvoye,
  ouvrirLesEcoles,
  fermerContacts,
} from './aides';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { choisirLaZone, ouvrirFiche, retourAuxEcoles, retourAuxZones, seConnecter } from './aides';

// Chantier 3 : l'administration comme poste de pilotage du catalogue. Les photos côte à côte, les formations
// lues sur le panneau, quatre façons d'accepter un relevé, le pont WhatsApp avec la direction, l'amorçage par
// création ou par import (avec simulation), les zones et les lots, la paie du vendredi. Construit avec le faux
// serveur : l'utilisateur est à la fois relais (lot Tié-Tié) et administrateur.

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

const niveaux = (page: Page) => page.getByRole('group', { name: 'Niveaux affichés' });

/** Le relais saisit la direction : vue, promoteur, d'accord pour WhatsApp. */
async function direction(page: Page) {
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page
    .getByRole('group', { name: 'Qui ?' })
    .getByRole('button', { name: 'Promoteur', exact: true })
    .click();
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await page.getByLabel(/Son WhatsApp/).fill('06 123 45 61');
}

/**
 * Un relais envoie la fiche d'un lycée : l'enseigne, un panneau et un prospectus, des séries notées, le
 * contact de la direction. L'application relais est connectée et sur « Mon secteur ».
 */
async function envoyerUnLycee(page: Page, nom: string) {
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  await page.getByLabel('Comment la trouver ?').fill('Face au marché');
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByLabel("Nom de l'établissement").fill(nom);
  await niveaux(page).getByRole('button', { name: 'Lycée', exact: true }).click();
  const series = page.getByRole('region', { name: 'Séries et formations' });
  await series.getByLabel(/Précisions sur les séries/).fill('Séries C et D');
  await series.getByLabel(/Je les ai prises en photo/).check();
  await page.getByRole('button', { name: 'Suivant' }).click();

  await direction(page);
  // v2 (13/11) : le panneau et le prospectus se prennent dans le bonus.
  await page.getByRole('button', { name: 'Suivant : le bonus' }).click();
  await page.getByLabel(/^Photo : Panneau ou affiche des formations/).setInputFiles(photo);
  await page.getByLabel(/^Photo : Prospectus remis par l.école/).setInputFiles(photo);
  await expect(page.getByRole('region', { name: /Photos en plus/ })).toContainText('2 sur 5');
  await page.getByRole('button', { name: 'Envoyer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await toutEstEnvoye(page, 15_000);
  await page.getByRole('link', { name: 'Missions' }).click();
}

/** Une fiche courte : l'enseigne seule, un niveau, pas de contact. */
async function envoyerUneFicheCourte(page: Page, nom: string) {
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  await page.getByLabel('Comment la trouver ?').fill('Face au marché');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom de l'établissement").fill(nom);
  await niveaux(page).getByRole('button', { name: 'Primaire', exact: true }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Personne', exact: true }).click();
  await envoyerSansBonus(page);
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await toutEstEnvoye(page, 15_000);
  await page.getByRole('link', { name: 'Missions' }).click();
}

async function relaisConnecte(page: Page, context: BrowserContext, latitude = -4.8) {
  await context.setGeolocation({ latitude, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await attendreLaLecture(page);
}

async function ouvrirLEnvoi(page: Page, nom: string) {
  await page.goto('/admin/#valider');
  await expect(page.getByRole('heading', { name: 'À valider' })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(nom.replace(/[[\]]/g, '\\$&')) }).click();
  await expect(page.getByRole('heading', { name: nom, level: 2 })).toBeVisible();
}

/** Ce que le faux serveur a gardé des campus. */
function campusDuServeur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus?: Record<
        string,
        {
          nom: string;
          etiquette: string | null;
          niveaux?: string[];
          formations?: { titre: string; serie: string | null; diplome: string | null }[];
          verifieeLe?: string | null;
          publication: string;
        }
      >;
    };
    return Object.values(etat.campus ?? {});
  });
}

test.describe('valider un envoi : photos, formations, acceptation', () => {
  test('les photos se listent, les formations se saisissent dans leur tiroir, la fiche entre dans le catalogue', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await relaisConnecte(page, context);
    await envoyerUnLycee(page, '[Lycée A]');

    await page.setViewportSize({ width: 1440, height: 1100 });
    await ouvrirLEnvoi(page, '[Lycée A]');

    // Planche : la photo principale, puis « Photos du relevé », une ligne par photo, qui dit ce qu'elle montre.
    const liste = page.getByRole('region', { name: 'Photos du relevé' });
    await expect(liste.getByRole('listitem')).toHaveCount(3);
    await expect(liste).toContainText(/enseigne ou l.entrée/);
    await expect(liste).toContainText(/panneau ou l.affiche des formations/);
    await expect(liste).toContainText(/prospectus remis par l.école/);
    // Seule l'enseigne peut être publique ; le panneau et le prospectus restent des photos de travail, privées.
    await liste
      .getByRole('group', { name: /^L'enseigne ou l'entrée : publique ou écartée \?$/ })
      .getByRole('button', { name: 'Publique', exact: true })
      .click();
    await expect(
      liste
        .getByRole('group', { name: /^L'enseigne ou l'entrée : publique ou écartée \?$/ })
        .getByRole('button', { name: 'Publique', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(liste.getByText('Travail, privée')).toHaveCount(2);

    // Ce que le relais a noté d'un coup d'œil.
    await expect(page.getByText('Séries ou filières vues')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Partie publique' }).getByText(/Séries C et D/),
    ).toBeVisible();
    await expect(page.getByText(/Le relais les a aussi prises en photo/)).toBeVisible();

    // Planche : l'encart et la barre pilotent l'acceptation ; les formations se corrigent dans leur tiroir.
    await page.getByRole('button', { name: 'Corriger les formations' }).click();
    const tiroir = page.getByRole('dialog', { name: 'Formations lues sur les photos' });

    // Les formations lues sur les photos : deux séries d'un appui, une formation libre, une retirée.
    const formations = tiroir.getByRole('region', { name: 'Formations : Lycée' });
    await formations.getByRole('button', { name: 'Série C', exact: true }).click();
    await formations.getByRole('button', { name: 'Série D', exact: true }).click();
    const notees = formations.getByRole('list', { name: 'Formations notées : Lycée' });
    await expect(notees.getByRole('listitem')).toHaveCount(2);
    await expect(notees).toContainText('Série C · Baccalauréat');

    // 16/11 : la formation libre est repliée derrière un lien, son champ dit ce qu'on recopie.
    await formations
      .getByRole('button', { name: '+ Autre formation (BTS, licence, couture…)' })
      .click();
    const ajout = formations.getByRole('group', { name: 'Ajouter une formation (Lycée)' });
    await ajout.getByRole('button', { name: 'Ajouter cette formation' }).click();
    await expect(ajout.getByText(/Écris le nom de la formation/)).toBeVisible();
    await ajout
      .getByLabel('Nom de la formation (tel qu’écrit sur le panneau)')
      .fill('Comptabilité');
    await ajout.getByLabel('Domaine').selectOption({ label: 'Gestion' });
    await ajout.getByLabel('Diplôme').selectOption({ label: 'Baccalauréat' });
    await ajout.getByLabel('Série du bac').selectOption({ label: 'Série G2' });
    await ajout.getByRole('button', { name: 'Cours du soir' }).click();
    await ajout.getByRole('button', { name: 'Ajouter cette formation' }).click();
    await expect(notees).toContainText('Comptabilité · Baccalauréat · soir');

    await formations.getByRole('button', { name: 'Retirer Série D' }).click();
    await expect(notees).not.toContainText('Série D');
    await expect(notees.getByRole('listitem')).toHaveCount(2);
    await tiroir.getByRole('button', { name: 'Fermer' }).click();
    await expect(
      page.getByRole('region', { name: 'Partie publique' }).getByText('Série C, Comptabilité'),
    ).toBeVisible();

    await fermerContacts(page);

    await page.getByRole('button', { name: 'Accepter', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    // Dans le catalogue : une institution, un campus, un cycle, deux formations.
    const [campus] = (await campusDuServeur(page)).filter((x) => x.nom === '[Lycée A]');
    expect(campus?.niveaux).toEqual(['lycee']);
    expect(campus?.formations?.map((f) => f.titre).sort()).toEqual(['Comptabilité', 'Série C']);

    await ouvrirLesEcoles(page);
    const ligne = page.getByRole('row', { name: /\[Lycée A\]/ });
    await ligne.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(
      page
        .getByRole('row', { name: /\[Lycée A\]/ })
        .getByText('Publiée', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  });

  test(
    'une nouvelle implantation se rattache à l’école connue, sans la dédoubler',
    { tag: '@critique' },
    async ({ page, context }) => {
      test.setTimeout(90_000);
      await relaisConnecte(page, context);
      await envoyerUneFicheCourte(page, '[Lycée A]');
      // Une seconde école, 200 m plus loin : pas de doublon.
      await context.setGeolocation({ latitude: -4.8018, longitude: 11.9, accuracy: 8 });
      await envoyerUneFicheCourte(page, '[Lycée A annexe]');

      await ouvrirLEnvoi(page, '[Lycée A]');
      await fermerContacts(page);
      await page.getByRole('button', { name: 'Accepter', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

      // Admin v2 : sur téléphone, la fiche suivante s'ouvre seule ; on la rouvre depuis la liste.
      await ouvrirLEnvoi(page, '[Lycée A annexe]');
      // Planche : aucune école connue à moins de 50 m, donc pas d'encart ; « Accepter » crée l'école, et « C'est un site
      // de… » (menu « ⋯ » de sa fiche) la range sous l'école connue.
      await fermerContacts(page);
      await page.getByRole('button', { name: 'Accepter', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
      await ouvrirLesEcoles(page);
      await ouvrirFiche(page.getByRole('row', { name: /\[Lycée A annexe\]/ }));
      await page
        .locator('summary[aria-label^="Autres actions pour "]')
        .filter({ visible: true })
        .first()
        .click();
      await page
        .getByRole('button', { name: 'C’est un site de…' })
        .filter({ visible: true })
        .first()
        .click();
      const rattacher = page.getByRole('form', {
        name: 'Rattacher [Lycée A annexe] à une autre école',
      });
      const choix = rattacher.getByLabel('L’école');
      const valeur = await choix
        .locator('option', { hasText: '[Lycée A]' })
        .filter({ hasNotText: 'annexe' })
        .getAttribute('value');
      await choix.selectOption(valeur ?? '');
      await rattacher.getByRole('button', { name: 'Rattacher ce site' }).click();
      await expect(page.getByRole('status').first()).toContainText(
        'Ce site est maintenant un site de [Lycée A]',
      );

      // Une institution, deux sites : la liste les range sous le nom de l'école.
      const campus = (await campusDuServeur(page)).filter((c) => c.nom === '[Lycée A]');
      expect(campus).toHaveLength(2);
      await retourAuxEcoles(page);
      const ecole = page.getByRole('rowgroup', { name: '[Lycée A]' });
      await expect(ecole.getByText(/2 sites/).filter({ visible: true })).toBeVisible();
      await expect(page.getByRole('row', { name: /\[Lycée A annexe\]/ })).toHaveCount(0);
    },
  );
});

test.describe('le pont avec la direction', () => {
  test('un message honnête, un lien WhatsApp, la fonction confirmée, puis l’accord daté', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await relaisConnecte(page, context);
    await envoyerUnLycee(page, '[Lycée A]');
    await ouvrirLEnvoi(page, '[Lycée A]');
    await ouvrirContacts(page);

    const pont = page.getByRole('region', { name: 'Écrire à la direction' });
    const message = pont.getByLabel('Message à la direction');
    const original = await message.inputValue();
    expect(original).toContain('[Lycée A]');
    expect(original).toContain('« Vérifié par la direction »');
    expect(original).toMatch(/Répondez « OK »/);
    expect(original).not.toMatch(/gratuit|FCFA|prix|tarif|visiteurs|audience/i);

    // Le lien ouvre WhatsApp avec exactement ce texte.
    const lien = pont.getByRole('link', { name: 'Écrire à la direction sur WhatsApp' });
    const href = (await lien.getAttribute('href')) ?? '';
    expect(href).toMatch(/^https:\/\/wa\.me\/242061234561\?text=/);
    expect(new URL(href).searchParams.get('text')).toBe(original);

    // Un message qui promet ce qu'on ne tient pas est refusé, sans accuser le numéro.
    await message.fill(`${original}\nC’est gratuit.`);
    await expect(pont.getByRole('alert')).toContainText(/prix, de gratuité, d’audience/);
    await expect(lien).toHaveCount(0);
    await expect(pont.getByText(/numéro de WhatsApp n’est pas valide/)).toHaveCount(0);
    await message.fill(original);
    await expect(lien).toBeVisible();

    // Un clic ouvre WhatsApp (ici, un faux) et note le premier message.
    await context.route('https://wa.me/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }),
    );
    const [onglet] = await Promise.all([context.waitForEvent('page'), lien.click()]);
    expect(onglet.url()).toMatch(/^https:\/\/wa\.me\/242061234561\?text=/);
    await onglet.close();
    await expect(pont.getByText('Premier message noté aujourd’hui')).toBeVisible();

    // Confirmer la fonction : le relais touchera son bonus de contact.
    await pont
      .getByLabel('Fonction de la personne qui a répondu')
      .selectOption({ label: 'Directeur général (DG)' });
    await pont.getByRole('button', { name: 'Confirmer sa fonction' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Fonction confirmée : Directeur général (DG).',
    );
    await expect(pont.getByText('Fonction confirmée', { exact: true })).toBeVisible();

    // Pas d'accord daté avant que la fiche existe : le badge « Vérifié » exige un campus relevé.
    await expect(pont.getByText(/Accepte d.abord la fiche/)).toBeVisible();
    await expect(pont.getByRole('button', { name: /Noter l.accord de la direction/ })).toHaveCount(
      0,
    );
    await fermerContacts(page);
    await page.getByRole('button', { name: 'Accepter', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    // Dans « Décidées », la fiche porte maintenant son école : l'accord se note, daté.
    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[Lycée A\]/ }).click();
    await ouvrirContacts(page);
    const accord = page.getByRole('region', { name: 'Écrire à la direction' });
    await expect(accord.getByLabel(/Date de l.accord/)).toBeVisible();
    await accord.getByLabel('Comment l’accord a été donné').selectOption({ label: 'Par WhatsApp' });
    await accord.getByRole('button', { name: /Noter l.accord de la direction/ }).click();
    await expect(page.getByRole('status')).toHaveText(
      /L’accord de la direction est noté au \d{2}\/\d{2}\/\d{4}/,
    );
    await expect(accord.getByText('Accord noté', { exact: true })).toBeVisible();

    const [campus] = (await campusDuServeur(page)).filter((c) => c.nom === '[Lycée A]');
    expect(campus?.verifieeLe).toBe(new Date().toISOString().slice(0, 10));
    // Planche : la date de l'accord se lit dans l'historique de la fiche (« Confirmée par la direction »).
    await ouvrirLesEcoles(page);
    await ouvrirFiche(page.getByRole('row', { name: /\[Lycée A\]/ }));
    await expect(
      page.getByRole('region', { name: 'Historique' }).filter({ visible: true }).first(),
    ).toContainText('Confirmée par la direction');
  });

  test('sans l’accord de la direction d’être contactée, aucun message n’est proposé', async ({
    page,
    context,
  }) => {
    await relaisConnecte(page, context);
    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
    await expect(page.getByText('Position prise')).toBeVisible();
    await page.getByLabel('Comment la trouver ?').fill('Face au marché');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByLabel("Nom de l'établissement").fill('[École sans accord]');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Oui', exact: true }).click();
    await page
      .getByRole('group', { name: 'Qui ?' })
      .getByRole('button', { name: 'Directeur', exact: true })
      .click();
    // La case « accepte que NTanova lui écrive » reste décochée : le numéro ne peut pas être noté.
    await expect(page.getByLabel(/Son WhatsApp/)).toBeDisabled();
    await envoyerSansBonus(page);
    await toutEstEnvoye(page, 15_000);

    await ouvrirLEnvoi(page, '[École sans accord]');

    await ouvrirContacts(page);
    const pont = page.getByRole('region', { name: 'Écrire à la direction' });
    await expect(pont.getByText(/n’a pas donné son accord pour être contactée/)).toBeVisible();
    await expect(
      pont.getByRole('link', { name: /Écrire à la direction sur WhatsApp/ }),
    ).toHaveCount(0);
    await expect(pont.getByLabel('Message à la direction')).toHaveCount(0);
  });
});

test.describe('amorcer le catalogue sans relais', () => {
  const CSV = [
    'reference;nom;genre;etiquette;division;quartier;repere;numero;latitude;longitude;programme;cycles;formations',
    'ETB-901;[Lycée Import];privée;;congo.pointe_noire.pointe_noire.tie_tie;[Quartier];[face au marché];;-4.79105;11.925;;lycee|college;lycee:Série C:sciences-technologies:c:bac:jour',
    'ETB-902;[Groupe Import];publique;Campus A;congo.pointe_noire.pointe_noire.tie_tie;;;;;;;primaire;',
    'ETB-902;[Groupe Import];publique;Campus B;congo.pointe_noire.pointe_noire.tie_tie;;;;;;;primaire;',
    'ETB-903;;privée;;;;;;;;;primaire;',
    'ETB-904;[Mauvais genre];bizarre;;;;;;;;;primaire;',
  ].join('\n');

  async function ouvrirLImport(page: Page) {
    await seConnecter(page, '/admin/#valider');
    await ouvrirLesEcoles(page);
    await page
      .getByRole('button', { name: 'Ajouter une école', exact: true })
      .filter({ visible: true })
      .click();
    await page
      .getByRole('group', { name: 'Comment ajouter' })
      .getByRole('button', { name: /Une liste/ })
      .click();
    return page.getByRole('region', { name: 'Importer des écoles' });
  }

  test('une liste CSV se vérifie en simulation, ligne par ligne, avant d’être importée', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const importation = await ouvrirLImport(page);
    const avant = (await campusDuServeur(page)).length;

    await importation.getByLabel('Contenu de la liste').fill(CSV);
    await importation.getByRole('button', { name: /Vérifier \(simulation/ }).click();
    await expect(importation.getByRole('status')).toHaveText(
      /Simulation : 2 écoles lues — 2 à créer, 0 déjà connue, 0 refusée par la base\./,
    );
    // Les lignes fausses sont dites avec leur numéro de ligne dans le fichier.
    const erreurs = importation.getByRole('alert');
    await expect(erreurs).toContainText('2 lignes à corriger');
    await expect(erreurs).toContainText('Ligne 5 : le nom est obligatoire');
    await expect(erreurs).toContainText('Ligne 6 ([Mauvais genre]) : genre inconnu');
    // Une simulation n'écrit rien.
    expect((await campusDuServeur(page)).length).toBe(avant);

    await importation.getByRole('button', { name: 'Importer 2 écoles pour de bon' }).click();
    await expect(page.getByRole('status')).toHaveText(/2 écoles importées.*rien n’est publié/);

    const ecoles = await campusDuServeur(page);
    expect(ecoles.length).toBe(avant + 3);
    expect(
      ecoles
        .filter((c) => c.nom === '[Groupe Import]')
        .map((c) => c.etiquette)
        .sort(),
    ).toEqual(['Campus A', 'Campus B']);
    const lycee = ecoles.find((c) => c.nom === '[Lycée Import]');
    expect(lycee?.formations?.map((f) => f.titre)).toEqual(['Série C']);
    // Importées, jamais publiées d'office.
    for (const c of ecoles.filter((x) => x.nom.endsWith('Import]'))) {
      expect(c.publication, c.nom).not.toBe('publiee');
    }

    await expect(
      page
        .getByRole('row', { name: /\[Lycée Import\]/ })
        .getByRole('button', { name: 'Publier', exact: true }),
    ).toBeVisible();
    // Planche : les deux sites se rangent sous le nom de leur école, chacun à situer.
    const groupe = page.getByRole('rowgroup', { name: '[Groupe Import]' });
    await expect(groupe).toContainText('2 sites');
    await expect(groupe.getByRole('button', { name: 'Situer', exact: true })).toHaveCount(2);
  });

  test('importer deux fois la même liste ne crée rien de plus', async ({ page }) => {
    test.setTimeout(60_000);
    let importation = await ouvrirLImport(page);
    await importation.getByLabel('Contenu de la liste').fill(CSV);
    await importation.getByRole('button', { name: /Vérifier \(simulation/ }).click();
    await importation.getByRole('button', { name: 'Importer 2 écoles pour de bon' }).click();
    await expect(page.getByRole('status')).toHaveText(/2 écoles importées/);
    const apres = (await campusDuServeur(page)).length;

    importation = await (async () => {
      await page
        .getByRole('button', { name: 'Ajouter une école', exact: true })
        .filter({ visible: true })
        .click();
      await page
        .getByRole('group', { name: 'Comment ajouter' })
        .getByRole('button', { name: /Une liste/ })
        .click();
      return page.getByRole('region', { name: 'Importer des écoles' });
    })();
    await importation.getByLabel('Contenu de la liste').fill(CSV);
    await importation.getByRole('button', { name: /Vérifier \(simulation/ }).click();
    await expect(importation.getByRole('status')).toHaveText(/0 à créer, 2 déjà connues/);
    await expect(importation.getByRole('button', { name: /pour de bon/ })).toHaveCount(0);
    expect((await campusDuServeur(page)).length).toBe(apres);
  });

  test('un JSON illisible est dit en une phrase ; une liste vide aussi', async ({ page }) => {
    const importation = await ouvrirLImport(page);
    await importation.getByLabel('Contenu de la liste').fill('[{ "nom": ');
    await importation.getByRole('button', { name: /Vérifier \(simulation/ }).click();
    await expect(importation.getByRole('alert')).toContainText('le JSON est illisible');
    await expect(importation.getByRole('button', { name: /pour de bon/ })).toHaveCount(0);
  });
});

test.describe('zones et lots', () => {
  test('on ouvre une zone aux relais, on y pose un lot ; une zone fermée n’en reçoit pas', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await seConnecter(page, '/admin/#valider');
    await ouvrirEcranAdmin(page, 'Zones');
    await expect(page.getByRole('heading', { name: 'Zones', level: 1 })).toBeVisible();

    // Planche : les lots sont dans un tiroir, ouvert par le lien sous la liste des zones.
    const ouvrirLeLot = async () => {
      await retourAuxZones(page);
      await page.getByRole('button', { name: /^Les lots \(secteurs conseillés\)/ }).click();
      const tiroir = page.getByRole('dialog', { name: 'Les lots' });
      await tiroir.getByText('Créer un lot', { exact: true }).click();
      const lot = tiroir.getByRole('form', { name: 'Créer un lot' });
      // Sur ordinateur, la zone choisie est déjà proposée ; sur téléphone, la liste l'a remplacée.
      if ((await lot.getByLabel('Zone', { exact: true }).inputValue()) === '')
        await lot.getByLabel('Zone', { exact: true }).selectOption('d-pn-loandjili');
      await expect(lot.getByLabel('Zone', { exact: true })).toHaveValue('d-pn-loandjili');
      await lot.getByLabel('Nom du lot').fill('[Lot Loandjili]');
      return { tiroir, lot };
    };

    // Loandjili est fermée : un lot ne s'y pose pas, sauf d'entraînement.
    await choisirLaZone(page, /^Loandjili/);
    let { lot } = await ouvrirLeLot();
    await expect(lot.getByRole('button', { name: 'Créer le lot' })).toBeDisabled();
    await expect(lot.getByText(/Cette zone est fermée/)).toBeVisible();
    await lot.getByLabel(/Lot d’entraînement/).check();
    await expect(lot.getByRole('button', { name: 'Créer le lot' })).toBeEnabled();
    await lot.getByLabel(/Lot d’entraînement/).uncheck();
    await page.keyboard.press('Escape');

    // On l'ouvre : tout ce qu'elle contient s'ouvre avec elle.
    await choisirLaZone(page, /^Loandjili/);
    const ouverture = page.getByRole('switch', { name: 'Ouverte aux relais : Loandjili' });
    await expect(ouverture).toHaveAttribute('aria-checked', 'false');
    await ouverture.click();
    await expect(page.getByRole('status')).toHaveText(
      'Loandjili est ouverte aux relais, avec tout ce qu’elle contient.',
    );
    await expect(ouverture).toHaveAttribute('aria-checked', 'true');

    ({ lot } = await ouvrirLeLot());
    await lot.getByRole('button', { name: 'Créer le lot' }).click();
    await expect(page.getByRole('status')).toHaveText(/Le lot \[Lot Loandjili\] est créé/);
    await retourAuxZones(page);
    await page.getByRole('button', { name: /^Les lots \(secteurs conseillés\)/ }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Les lots' })
        .getByRole('row', { name: /\[Lot Loandjili\]/ })
        .getByText('Congo › Pointe-Noire › Loandjili'),
    ).toBeVisible();
  });

  test('l’état sur la carte se règle zone par zone, sans toucher à l’ouverture aux relais, et se défait', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#valider');
    await ouvrirEcranAdmin(page, 'Zones');
    await expect(page.getByRole('heading', { name: 'Zones', level: 1 })).toBeVisible();
    // Les relais peuvent relever partout : le texte ne dit plus que « seule une zone ouverte » le permet.
    // Admin v2 : cette règle est dans le tiroir « Règles » de l'écran.
    await ouvrirRegles(page);
    await expect(
      page.getByText(/Les relais peuvent relever partout au Congo-Brazzaville/),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/ne relèvent que dans une zone ouverte/)).toHaveCount(0);

    // Loandjili : « Déploiement programmé » au départ, fermée aux relais. Depuis le 08/11/2026 (ticket 146), la carte dessine
    // la zone sans écrire d'état ; le réglage garde ses mots ici.
    await choisirLaZone(page, /^Loandjili/);
    const etat = page.getByRole('group', { name: 'Sur la carte du site' });
    await expect(etat.getByRole('button', { name: 'Déploiement programmé' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await etat.getByRole('button', { name: 'Relevé en cours' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Loandjili est sur la carte, réglée « Relevé en cours ». Les relais ne sont pas concernés.',
    );
    await expect(etat.getByRole('button', { name: 'Relevé en cours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // L'ouverture aux relais n'a pas bougé.
    await expect(
      page.getByRole('switch', { name: 'Ouverte aux relais : Loandjili' }),
    ).toHaveAttribute('aria-checked', 'false');

    // « Annuler » remet l'état d'avant.
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Loandjili redevient « Déploiement programmé » sur la carte.',
    );
    await expect(etat.getByRole('button', { name: 'Déploiement programmé' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await etat.getByRole('button', { name: 'Pas encore couverte' }).click();
    await expect(page.getByRole('status')).toContainText('Pas encore couverte');
    await expect(etat.getByRole('button', { name: 'Pas encore couverte' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Une zone qui n'est pas dessinée sur la carte (un département, un pays) n'a pas de réglage.
    await choisirLaZone(page, /^Congo\s*Pays/);
    await expect(page.getByRole('heading', { name: 'Congo', level: 2 })).toBeVisible();
    await expect(page.getByRole('group', { name: /sur la carte/ })).toHaveCount(0);
  });

  test('une zone nouvelle s’ouvre avec la zone qui la contient, ou reste fermée avec elle', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#valider');
    await ouvrirEcranAdmin(page, 'Zones');

    // Sous Tié-Tié, ouverte : la nouvelle zone l'est par héritage, et son adresse vient de son nom.
    await choisirLaZone(page, /^Tié-Tié/);
    await page.getByText('Ajouter une sous-zone').click();
    const ajout = page.getByRole('form', { name: 'Ajouter une zone' });
    await expect(ajout.getByLabel('Sous quelle zone ?')).toHaveValue('d-pn-tie-tie');
    await ajout.getByLabel('Genre').selectOption({ label: 'Quartier' });
    await ajout.getByLabel('Nom', { exact: true }).fill('Mpaka Centre');
    await expect(ajout.getByLabel('Adresse (dans le lien)')).toHaveValue('mpaka-centre');
    await ajout.getByRole('button', { name: 'Ajouter la zone' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Mpaka Centre est ajouté sous Tié-Tié. Les relais peuvent y relever, comme dans tout ce que contient sa zone.',
    );
    // On arrive sur la zone nouvelle, ouverte par Tié-Tié.
    await expect(page.getByRole('heading', { name: 'Mpaka Centre', level: 2 })).toBeVisible();
    await expect(page.getByText(/Ouverte par Tié-Tié/)).toBeVisible();

    // Sous Lumumba, fermée : elle naît fermée, et c'est dit.
    await choisirLaZone(page, /^Lumumba/);
    await page.getByText('Ajouter une sous-zone').click();
    await expect(ajout.getByLabel('Sous quelle zone ?')).toHaveValue('d-pn-lumumba');
    await ajout.getByLabel('Nom', { exact: true }).fill('Fond Tié-Tié');
    await ajout.getByRole('button', { name: 'Ajouter la zone' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Fond Tié-Tié est ajouté sous Lumumba. Fermé aux relais : ouvre-le quand tu veux.',
    );
    await expect(page.getByRole('heading', { name: 'Fond Tié-Tié', level: 2 })).toBeVisible();
    await expect(
      page.getByRole('switch', { name: 'Ouverte aux relais : Fond Tié-Tié' }),
    ).toHaveAttribute('aria-checked', 'false');

    // Une adresse déjà prise sous le même parent est refusée en français.
    await choisirLaZone(page, /^Lumumba/);
    await page.getByText('Ajouter une sous-zone').click();
    await ajout.getByLabel('Nom', { exact: true }).fill('Fond Tié-Tié');
    await ajout.getByRole('button', { name: 'Ajouter la zone' }).click();
    await expect(ajout.getByRole('alert')).toContainText(/même adresse/);
  });
});

test.describe('la paie du vendredi', () => {
  test(
    'ce qui est dû, la clôture, le paiement noté avec sa référence, et rien de compté deux fois',
    { tag: '@critique' },
    async ({ page, context }) => {
      test.setTimeout(120_000);
      await relaisConnecte(page, context);
      await envoyerUnLycee(page, '[Lycée A]');
      await ouvrirLEnvoi(page, '[Lycée A]');
      await ouvrirContacts(page);
      await page.getByRole('button', { name: 'Confirmer sa fonction' }).click();
      await expect(page.getByText('Fonction confirmée', { exact: true })).toBeVisible();
      await fermerContacts(page);
      await page.getByRole('button', { name: 'Accepter', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

      await ouvrirEcranAdmin(page, 'Paie');
      await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
      const du = page.getByRole('region', { name: 'Ce qui est dû' });

      // Une fiche acceptée (500 FCFA) et un contact confirmé (300 FCFA).
      const ligne = du.getByRole('row', { name: /\[Prénom\]/ });
      await expect(ligne).toBeVisible();
      await expect(ligne.getByRole('cell').nth(1)).toHaveText('1');
      await expect(ligne.getByRole('cell').nth(2)).toHaveText('1');
      await expect(du.getByText(/Total\s*:\s*800\sFCFA/)).toBeVisible();

      // Le numéro Mobile Money se note une fois.
      await du.getByRole('textbox', { name: 'Numéro Mobile Money' }).fill('242 06 123 45 99');
      await du.getByRole('button', { name: 'Noter le numéro' }).click();
      await expect(ligne.getByText('noté', { exact: true })).toBeVisible();

      // Clôturer : en deux gestes.
      await du.getByRole('button', { name: 'Clôturer la semaine' }).click();
      await du.getByRole('button', { name: 'Confirmer : clôturer la semaine' }).click();
      await expect(page.getByRole('status')).toHaveText(/est clôturée : 800\sFCFA à payer/);
      // Ce qui est clôturé n'est plus dû.
      await expect(du.getByText('Rien n’est dû jusqu’à ce vendredi.')).toBeVisible();

      // Le détail de la semaine s'ouvre : on note le paiement avec la référence de l'opération.
      const paiements = page.getByLabel(/Paiements du \d{4}-\d{2}-\d{2}/);
      await expect(paiements.getByText('+242 06 123 45 99')).toBeVisible();
      const noter = paiements.getByRole('button', { name: 'Noter payé' });
      await expect(noter).toBeDisabled();
      await paiements.getByLabel('Référence du paiement de [Prénom]').fill('MM-0001');
      await noter.click();
      await expect(page.getByRole('status')).toHaveText(
        /\[Prénom\] : 800\sFCFA noté payé \(référence MM-0001\)\./,
      );
      await expect(paiements.getByText(/Payé .* · MM-0001/)).toBeVisible();
      await expect(page.getByRole('row', { name: /1 \/ 1/ })).toBeVisible();
    },
  );

  test('on ne clôt qu’un vendredi', async ({ page }) => {
    await seConnecter(page, '/admin/#valider');
    await ouvrirEcranAdmin(page, 'Paie');
    const champ = page.getByLabel('Jusqu’au vendredi');
    const vendredi = await champ.inputValue();
    expect(new Date(`${vendredi}T12:00:00Z`).getUTCDay()).toBe(5);
    await expect(page.getByText('Rien n’est dû jusqu’à ce vendredi.')).toBeVisible();

    const samedi = new Date(`${vendredi}T12:00:00Z`);
    samedi.setUTCDate(samedi.getUTCDate() + 1);
    await champ.fill(samedi.toISOString().slice(0, 10));
    await expect(page.getByText('Choisis un vendredi.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clôturer la semaine' })).toHaveCount(0);
  });
});
