// Les formulaires de la fiche admin v2 (ticket 165, lot E, 13/11/2026) : frais par classe et « illisible », « C'est un site
// de… » et son conflit, une nouvelle qui exige l'accord daté de l'école, l'admission du supérieur.
import { expect, test, type Page } from '@playwright/test';
import { ficheOuverte, ouvrirFiche, ouvrirGestion, seConnecter, ouvrirLesEcoles } from './aides';

/** Une seconde école dans le faux serveur (un site à elle seule, du supérieur), à côté de « [École à situer] ». */
async function avecUneSecondeEcole(page: Page) {
  await seConnecter(page, '/admin/#valider');
  // L'état du faux serveur s'écrit à la première lecture : on ouvre « Écoles » d'abord.
  await ouvrirLesEcoles(page);
  await expect(page.getByRole('row', { name: /\[École à situer\]/ })).toBeVisible();
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      campus: Record<string, Record<string, unknown>>;
    };
    const modele = Object.values(e.campus)[0]!;
    const id = '00000000-0000-4000-8000-0000000000f1';
    e.campus[id] = {
      ...modele,
      id,
      institutionId: id,
      nom: '[Institut Exemple]',
      niveaux: ['superieur'],
      confieeA: null,
    };
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await page.reload();
  await ouvrirLesEcoles(page);
}

const ligneDe = (page: Page, nom: RegExp) => page.getByRole('row', { name: nom });
const MENU = 'summary[aria-label^="Autres actions pour "]';

test('frais : une classe, et une ligne illisible devient un manque demandé à l’école', async ({
  page,
}) => {
  await avecUneSecondeEcole(page);
  const ligne = ligneDe(page, /\[Institut Exemple\]/);
  await ouvrirGestion(ligne, 'Frais déclarés');
  // Planche « Frais par classe » : une ligne « Illisible » n'est pas publiée ; « Demander » l'ajoute aux manques.
  const frais = page.getByRole('region', { name: 'Frais déclarés de [Institut Exemple]' });
  await expect(page.getByText(/Pas de prospectus photographié/)).toBeVisible();
  if ((await frais.getByLabel('Classe', { exact: true }).count()) === 0)
    await frais.getByRole('button', { name: '+ Ajouter une ligne' }).click();
  await frais.getByLabel('Classe', { exact: true }).first().fill('3e');
  await frais.getByRole('button', { name: 'Illisible', exact: true }).first().click();
  await frais.getByRole('button', { name: 'Demander 3e' }).click();
  await expect(page.getByRole('status').first()).toContainText('« Frais 3e » : demandé à l’école');
});

test('« C’est un site de… » : ce qui passe et ce qui disparaît est dit ; un conflit de logo dit quoi faire', async ({
  page,
}) => {
  await avecUneSecondeEcole(page);
  const ligne = ligneDe(page, /\[École à situer\]/);
  // Planche : « C'est un site de… » est dans le menu « ⋯ » de la fiche.
  const siteDe = async () => {
    await page.locator(MENU).filter({ visible: true }).first().click();
    await page
      .getByRole('button', { name: 'C’est un site de…' })
      .filter({ visible: true })
      .first()
      .click();
  };
  await ouvrirFiche(ligne);
  await siteDe();
  const form = page.getByRole('form', { name: /Rattacher \[École à situer\]/ });
  await expect(form).toContainText('Son école actuelle n’a pas d’autre site');
  await form.getByLabel('L’école').selectOption({ label: '[Institut Exemple]' });

  await page.evaluate(() => localStorage.setItem('ntanova-faux-conflit-logo', '1'));
  await form.getByRole('button', { name: 'Rattacher ce site' }).click();
  const conflit = form.getByRole('alert');
  await expect(conflit).toContainText('Les deux écoles ont un logo');
  await expect(conflit).toContainText('Garde celui qui vaut');
  await conflit.getByRole('button', { name: 'Voir le logo de ce site' }).click();
  await expect(page.getByRole('region', { name: 'Images de l’école' })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('ntanova-faux-conflit-logo'));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await siteDe();
  await page
    .getByRole('form', { name: /Rattacher/ })
    .getByLabel('L’école')
    .selectOption({ label: '[Institut Exemple]' });
  await page.getByRole('button', { name: 'Rattacher ce site' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Ce site est maintenant un site de [Institut Exemple]',
  );
});

test('une nouvelle ne se publie pas sans l’accord daté de l’école ; la raison est dite à côté du bouton', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  await ouvrirGestion(ligneDe(page, /\[École à situer\]/), 'Nouvelles');
  // Planche « Une nouvelle » : le formulaire, et à côté ce que verra un parent et celles déjà publiées.
  const bloc = ficheOuverte(page);
  const deja = bloc.getByRole('region', { name: 'Déjà publiées' });
  await expect(deja).toContainText('Aucune : la rubrique n’existe pas sur la page.');
  const form = bloc.getByRole('form', { name: 'Une nouvelle' });
  await form.getByLabel('Titre').fill('[Portes ouvertes]');
  await form.getByLabel('Texte').fill('[Visite des classes.]');
  const publier = form.getByRole('button', { name: 'Publier sur la fiche' });
  await expect(publier).toBeDisabled();
  await expect(form).toContainText('L’accord daté de l’école manque');
  await form.getByLabel('Le', { exact: true }).fill('2026-11-01');
  await expect(publier).toBeEnabled();
  await publier.click();
  await expect(deja.getByRole('listitem')).toContainText('[Portes ouvertes]');
  await deja.getByRole('button', { name: 'Retirer [Portes ouvertes]' }).click();
  await expect(deja).toContainText('Aucune : la rubrique n’existe pas sur la page.');
});

test('l’admission du supérieur : une étape qui finit avant de commencer est dite avant l’envoi', async ({
  page,
}) => {
  await avecUneSecondeEcole(page);
  await ouvrirGestion(ligneDe(page, /\[Institut Exemple\]/), 'Admission');
  const form = page.getByRole('form', { name: 'Admission' });
  await form.getByLabel('Année scolaire').fill('2026-2027');
  const dossiers = form.getByRole('group', { name: 'Dossiers' });
  await dossiers.getByLabel(/Dossiers : du/).fill('2026-06-10');
  await dossiers.getByLabel(/^au/).fill('2026-06-01');
  await form.getByRole('button', { name: 'Enregistrer l’admission' }).click();
  await expect(form.getByRole('alert')).toHaveText(
    'Une étape finit avant de commencer : vérifie ses dates.',
  );
  await dossiers.getByLabel(/^au/).fill('2026-07-15');
  await form.getByLabel(/Pièces à fournir/).fill('[Un acte de naissance]\n[4 photos d’identité]');
  await form.getByLabel('Dossiers reçus sur place uniquement').check();
  await form.getByRole('button', { name: 'Enregistrer l’admission' }).click();
  await expect(page.getByRole('status').first()).toContainText('Admission enregistrée');
});
