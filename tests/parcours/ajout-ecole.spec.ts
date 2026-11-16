// Ajouter une école à la main (fondateur, 16/11/2026) : trois problèmes vus en ajoutant « La Colombe de Mavie ».
// A. « + Un site » de la fiche d'une école créait une autre école (le formulaire général) : il ajoute maintenant un site
//    à CETTE école (son nom repris, non modifiable).
// B. Une école du même nom, au même endroit, n'était pas signalée quand l'étiquette du site différait (« Site Primaire »,
//    « Site Collège ») : le formulaire demande maintenant à la base les écoles proches (`similar_schools`).
// C. Le bloc « ajout libre » des formations : replié, renommé, son erreur s'efface à la frappe, un doublon est dit.
import { expect, test, type Page } from '@playwright/test';
import { ouvrirFiche, ouvrirLesEcoles, seConnecter } from './aides';

const POSITION = '-4.79105, 11.92500';

function campusDuServeur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus?: Record<string, { nom: string; etiquette: string | null; institutionId: string }>;
    };
    return Object.values(etat.campus ?? {});
  });
}

async function ouvrirLAjout(page: Page) {
  await page
    .getByRole('button', { name: 'Ajouter une école', exact: true })
    .filter({ visible: true })
    .click();
  return page.getByRole('form', { name: 'Ajouter une école' });
}

async function remplir(
  f: ReturnType<Page['getByRole']>,
  champs: { nom: string; etiquette?: string; position?: string },
) {
  await f.getByLabel('Nom de l’école').fill(champs.nom);
  if (champs.etiquette) await f.getByLabel(/Nom de l’implantation/).fill(champs.etiquette);
  if (champs.position) await f.getByLabel(/^Position/).fill(champs.position);
}

test.beforeEach(async ({ page }) => {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
});

test('A. « + Un site » ajoute un site à cette école : une institution, deux campus', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const f = await ouvrirLAjout(page);
  await remplir(f, { nom: '[École à deux sites]', position: POSITION });
  await f.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(page.getByRole('status').first()).toContainText('[École à deux sites] est ajoutée');

  await ouvrirFiche(page.getByRole('row', { name: /\[École à deux sites\]/ }));
  await page
    .getByRole('navigation', { name: 'Les sites de cette école' })
    .getByRole('link', { name: 'Un site' })
    .click();
  const site = page.getByRole('form', { name: 'Ajouter un site à [École à deux sites]' });
  await expect(site).toBeVisible();
  // Le nom de l'école est repris, non modifiable ; le nom du site est demandé.
  await expect(site.getByLabel('Nom de l’école')).toHaveCount(0);
  await expect(site).toContainText('[École à deux sites]');
  await site.getByRole('button', { name: 'Ajouter le site' }).click();
  await expect(site.getByText(/Écris le nom du site/)).toBeVisible();
  await site.getByLabel(/Nom du site/).fill('Campus de Loandjili');
  await site.getByRole('button', { name: 'Ajouter le site' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Campus de Loandjili est ajouté à [École à deux sites]',
  );

  const campus = (await campusDuServeur(page)).filter((c) => c.nom === '[École à deux sites]');
  expect(campus).toHaveLength(2);
  expect(new Set(campus.map((c) => c.institutionId)).size).toBe(1);
});

test('B. le même nom, autrement écrit, au même endroit : la création le dit et propose « un site de… »', async ({
  page,
}) => {
  test.setTimeout(60_000);
  let f = await ouvrirLAjout(page);
  await remplir(f, { nom: 'La colombe de Mavie', etiquette: 'Site Primaire', position: POSITION });
  await f.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(page.getByRole('status').first()).toContainText('est ajoutée');
  const avant = (await campusDuServeur(page)).length;

  f = await ouvrirLAjout(page);
  await remplir(f, { nom: 'La Colombe de Mavie', etiquette: 'Site Collège', position: POSITION });
  await f.getByRole('button', { name: 'Ajouter l’école' }).click();
  const alerte = f.getByRole('region', { name: 'Est-ce une école connue ?' });
  await expect(alerte).toContainText('« La colombe de Mavie — Site Primaire » existe déjà');
  // Rien n'est créé tant que la réponse n'est pas donnée.
  expect((await campusDuServeur(page)).length).toBe(avant);

  await alerte.getByRole('button', { name: 'Oui, un site de cette école' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Site Collège est ajouté à La colombe de Mavie',
  );
  const colombes = (await campusDuServeur(page)).filter((c) => /colombe/i.test(c.nom));
  expect(colombes).toHaveLength(2);
  expect(new Set(colombes.map((c) => c.institutionId)).size).toBe(1);
});

test('B. « Non, une autre école » crée bien une autre école', async ({ page }) => {
  test.setTimeout(60_000);
  let f = await ouvrirLAjout(page);
  await remplir(f, { nom: '[Les Lucioles]', etiquette: 'Site 1', position: POSITION });
  await f.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(page.getByRole('status').first()).toContainText('est ajoutée');

  f = await ouvrirLAjout(page);
  await remplir(f, { nom: '[LES LUCIOLES]', etiquette: 'Site 2', position: POSITION });
  await f.getByRole('button', { name: 'Ajouter l’école' }).click();
  await f
    .getByRole('region', { name: 'Est-ce une école connue ?' })
    .getByRole('button', { name: 'Non, une autre école' })
    .click();
  await expect(page.getByRole('status').first()).toContainText('[LES LUCIOLES] est ajoutée');
  const lucioles = (await campusDuServeur(page)).filter((c) => /lucioles/i.test(c.nom));
  expect(new Set(lucioles.map((c) => c.institutionId)).size).toBe(2);
});

test('C. l’ajout libre des formations : replié, renommé, son erreur s’efface, un doublon est dit', async ({
  page,
}) => {
  const f = await ouvrirLAjout(page);
  await f
    .getByRole('group', { name: 'Niveaux' })
    .getByRole('button', { name: 'Lycée', exact: true })
    .click();
  const lycee = f.getByRole('region', { name: 'Formations : Lycée' });
  // C1 et C2 : replié derrière un lien, le libellé dit ce qu'on recopie.
  const champ = lycee.getByLabel('Nom de la formation (tel qu’écrit sur le panneau)');
  await expect(champ).toHaveCount(0);
  await lycee.getByRole('button', { name: '+ Autre formation (BTS, licence, couture…)' }).click();
  await expect(champ).toBeVisible();

  // C3 : l'erreur s'efface dès la frappe.
  await lycee.getByRole('button', { name: 'Ajouter cette formation' }).click();
  const erreur = lycee.getByText(/Écris le nom de la formation/);
  await expect(erreur).toBeVisible();
  await champ.fill('B');
  await expect(erreur).toHaveCount(0);

  // C5 : une formation déjà notée (une série cochée) le dit.
  await lycee.getByRole('button', { name: 'Série A', exact: true }).click();
  await champ.fill('série a');
  await lycee.getByRole('button', { name: 'Ajouter cette formation' }).click();
  await expect(lycee.getByText('Déjà notée : Série A.')).toBeVisible();
  await expect(
    lycee.getByRole('list', { name: /Formations notées/ }).getByRole('listitem'),
  ).toHaveCount(1);
});

test('C4. un rythme commun aux séries du cycle : « Cours du soir » les marque toutes, une série ajoutée le prend', async ({
  page,
}) => {
  const f = await ouvrirLAjout(page);
  await f
    .getByRole('group', { name: 'Niveaux' })
    .getByRole('button', { name: 'Lycée', exact: true })
    .click();
  const lycee = f.getByRole('region', { name: 'Formations : Lycée' });
  const rythme = lycee.getByRole('group', { name: /Rythme des séries/ });
  // Sans série cochée, pas de rythme à choisir.
  await expect(rythme).toHaveCount(0);
  await lycee.getByRole('button', { name: 'Série C', exact: true }).click();
  await lycee.getByRole('button', { name: 'Série D', exact: true }).click();
  await rythme.getByRole('button', { name: 'Cours du soir' }).click();
  const notees = lycee.getByRole('list', { name: 'Formations notées : Lycée' });
  await expect(notees.getByRole('listitem').filter({ hasText: 'soir' })).toHaveCount(2);
  await lycee.getByRole('button', { name: 'Série A', exact: true }).click();
  await expect(notees.getByRole('listitem').filter({ hasText: 'soir' })).toHaveCount(3);
  await rythme.getByRole('button', { name: 'Cours du soir' }).click();
  await expect(notees.getByRole('listitem').filter({ hasText: 'soir' })).toHaveCount(0);
});
