// Lot 2 du site public (15/11/2026) : l'administration saisit les champs du lot 1 de la base. Les mois facturés et le OUI
// daté de l'école sur ses frais, les séries du bac admises par une formation, les places annoncées (30 jours) et
// l'effectif des classes en tranches, la lecture des demandes des familles sur « Aujourd'hui ».
import { expect, test, type Page } from '@playwright/test';
import {
  fermerLeTiroir,
  ouvrirGestion,
  ouvrirLaFiche,
  ouvrirLesEcoles,
  seConnecter,
  uneFicheEnvoyee,
} from './aides';

test.use({ permissions: ['geolocation'] });

/** Le jour (ISO) au Congo, décalé de `jours`. */
const jourDuCongo = (jours = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Brazzaville' }).format(
    new Date(Date.now() + jours * 86_400_000),
  );
/** « 15 déc. », comme l'écran. */
const jourEtMois = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Brazzaville',
  }).format(new Date(iso));

/** [École 1] relevée par un relais, acceptée : sa fiche d'administration est à portée. */
async function uneEcoleAcceptee(page: Page, context: Parameters<typeof uneFicheEnvoyee>[1]) {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await ouvrirLesEcoles(page);
  return page.getByRole('row', { name: /\[École 1\]/ });
}

test('frais : les mois facturés, puis le OUI daté de l’école ; un montant modifié attend un nouveau OUI', async ({
  page,
  context,
}) => {
  const ligne = await uneEcoleAcceptee(page, context);
  await ouvrirGestion(ligne, 'Frais déclarés');
  const frais = page.getByRole('region', { name: 'Frais déclarés de [École 1]' });
  // Rien à confirmer tant qu'aucune ligne n'est enregistrée.
  await expect(page.getByRole('region', { name: 'Le OUI de l’école' })).toHaveCount(0);
  if ((await frais.getByLabel('Cycle', { exact: true }).count()) === 0)
    await frais.getByRole('button', { name: '+ Ajouter une ligne' }).click();
  const premiere = frais.locator('tbody tr').first();
  await frais.getByLabel('Mois facturés').selectOption('10');
  await premiere.getByLabel('Cycle', { exact: true }).selectOption('primaire');
  await premiere.getByLabel('Classe', { exact: true }).fill('CP1');
  await premiere.getByLabel('Montant (FCFA)').fill('20 000');
  await premiere.getByLabel('Période', { exact: true }).selectOption('mois');
  // Ticket 199 (A2) : le jour de la déclaration n'est jamais pré-rempli ; sans lui, rien ne part.
  await expect(frais.getByLabel('Déclarés par l’école le')).toHaveValue('');
  await frais.getByRole('button', { name: 'Enregistrer 1 ligne publiable' }).click();
  await expect(frais.getByRole('alert')).toBeVisible();
  await frais.getByLabel('Déclarés par l’école le').fill(jourDuCongo());
  await frais.getByRole('button', { name: 'Enregistrer 1 ligne publiable' }).click();
  // Une ligne enregistrée ne paraît pas avant le OUI de l'école : l'écran ne promet plus « visible à la mise à jour ».
  await expect(page.getByRole('status').first()).toContainText(
    'elle attend le OUI de l’école pour paraître sur le site',
  );
  const fiche = page.getByRole('article', { name: 'Fiche de [École 1]' });
  const carteFrais = fiche.getByRole('button', { name: 'Frais : ouvrir' });
  await expect(carteFrais).toContainText('En attente du OUI de l’école');

  // Le OUI se note dans la page des frais, avec le jour où l'école l'a écrit.
  await carteFrais.click();
  const oui = page.getByRole('region', { name: 'Le OUI de l’école' });
  await expect(oui).toContainText('En attente du OUI de l’école');
  await expect(frais.getByLabel('Mois facturés')).toHaveValue('10');
  await expect(premiere.getByText('En attente du OUI').filter({ visible: true })).toBeVisible();
  await oui.getByRole('button', { name: 'Noter le OUI de l’école' }).click();
  const fenetre = page.getByRole('alertdialog', { name: 'Noter le OUI de l’école' });
  await expect(fenetre).toContainText('CP1');
  await fenetre.getByLabel('Le jour où l’école a répondu OUI').fill(jourDuCongo(2));
  await fenetre.getByRole('button', { name: 'Noter le OUI', exact: true }).click();
  await expect(fenetre.getByRole('alert')).toHaveText(
    'Donne le jour réel où l’école a répondu OUI.',
  );
  await fenetre.getByLabel('Le jour où l’école a répondu OUI').fill(jourDuCongo());
  await fenetre.getByRole('button', { name: 'Noter le OUI', exact: true }).click();
  await expect(fenetre).toBeHidden();
  await expect(page.getByRole('status').first()).toContainText(
    '1 ligne de frais de [École 1] paraîtra à la prochaine mise à jour du site',
  );
  await expect(carteFrais).toContainText('OUI de l’école le');
  await expect(carteFrais).not.toContainText('En attente');

  // Modifier le montant retire le OUI : la ligne le redemande, puis l'attend de nouveau.
  await carteFrais.click();
  await expect(page.getByRole('region', { name: 'Le OUI de l’école' })).toContainText(
    'OUI de l’école le',
  );
  const resume = premiere.locator('button[aria-expanded]');
  if (await resume.isVisible()) await resume.click();
  await premiere.getByLabel('Montant (FCFA)').fill('22 000');
  await expect(premiere.getByText('OUI à redemander').filter({ visible: true })).toBeVisible();
  await frais.getByRole('button', { name: 'Enregistrer 1 ligne publiable' }).click();
  await expect(carteFrais).toContainText('En attente du OUI de l’école');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('places et effectifs : une annonce vaut 30 jours, un effectif se dit en tranches, tout se retire', async ({
  page,
  context,
}) => {
  const ligne = await uneEcoleAcceptee(page, context);
  await ouvrirGestion(ligne, 'Places et effectifs');
  const tiroir = page.getByRole('dialog', { name: 'Places et effectifs · [École 1]' });
  const places = tiroir.getByRole('region', { name: 'Places annoncées' });
  await expect(places).toContainText('Aucune place annoncée.');
  await places.getByRole('button', { name: '+ Annoncer des places' }).click();
  const annonce = places.getByRole('row', { name: 'Annonce en cours d’écriture' });
  await annonce.getByLabel('Classe', { exact: true }).fill('CP1');
  await annonce.getByLabel('Ce que dit l’école').selectOption('peu');
  // Une annonce de plus de 30 jours ne se publie plus : elle se redemande à l'école.
  await annonce.getByLabel('Dit par l’école le').fill(jourDuCongo(-40));
  await annonce.getByRole('button', { name: 'Enregistrer l’annonce' }).click();
  await expect(tiroir.getByRole('alert')).toContainText('Une annonce de plus de 30 jours');
  await annonce.getByLabel('Dit par l’école le').fill(jourDuCongo());
  await annonce.getByRole('button', { name: 'Enregistrer l’annonce' }).click();
  await expect(tiroir.getByRole('status')).toContainText('Places de CP1 enregistrées');
  const cp1 = places.getByRole('row', { name: 'Places : CP1' });
  await expect(cp1).toContainText('Peu de places');
  await expect(cp1).toContainText(`Jusqu’au ${jourEtMois(jourDuCongo(30))}`);

  const effectifs = tiroir.getByRole('region', { name: 'Effectif par classe' });
  await effectifs.getByRole('button', { name: '+ Dire un effectif' }).click();
  const effectif = effectifs.getByRole('row', { name: 'Effectif en cours d’écriture' });
  await effectif.getByLabel('Classe', { exact: true }).fill('CP1');
  await effectif.getByLabel('Tranche d’effectif').selectOption('35_a_49');
  // Ticket 199 (A2) : le jour où l'école l'a dit se tape.
  await effectif.getByLabel('Dit par l’école le').fill(jourDuCongo());
  await effectif.getByRole('button', { name: 'Enregistrer l’effectif' }).click();
  await expect(effectifs.getByRole('row', { name: 'Effectif : CP1' })).toContainText(
    '35 à 49 élèves',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  // La fiche le résume ; retirer l'annonce la fait disparaître de la liste.
  await fermerLeTiroir(page);
  const carte = page
    .getByRole('article', { name: 'Fiche de [École 1]' })
    .getByRole('button', { name: 'Places et effectifs : ouvrir' });
  await expect(carte).toContainText('CP1 : peu de places');
  await expect(carte).toContainText('1 effectif de classe');
  await carte.click();
  await places.locator('summary[aria-label="Autres actions pour les places de CP1"]').click();
  await places.getByRole('button', { name: 'Retirer les places de CP1' }).click();
  await expect(places).toContainText('Aucune place annoncée.');
});

/** Un institut du supérieur dans le faux serveur, avec une formation (comme le lot F). */
async function unInstitut(page: Page) {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  await expect(page.getByRole('row', { name: /\[École à situer\]/ })).toBeVisible();
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      campus: Record<string, Record<string, unknown>>;
    };
    const modele = Object.values(e.campus)[0]!;
    const id = '00000000-0000-4000-8000-0000000000f3';
    e.campus[id] = {
      ...modele,
      id,
      institutionId: id,
      nom: '[Institut Lot 2]',
      niveaux: ['superieur'],
      confieeA: null,
      formations: [
        {
          cycle: 'superieur',
          titre: 'Licence Informatique',
          domaine: null,
          serie: null,
          diplome: 'licence',
          rythmes: ['jour'],
        },
      ],
    };
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await page.reload();
  await ouvrirLesEcoles(page);
  return page.getByRole('row', { name: /\[Institut Lot 2\]/ });
}

test('les séries du bac admises par une formation du supérieur : des puces, gardées, et « pas dit » quand aucune', async ({
  page,
}) => {
  const ligne = await unInstitut(page);
  await ouvrirGestion(ligne, 'Formations du supérieur');
  const section = page.getByRole('region', { name: 'Formations du supérieur' });
  await section.getByRole('button', { name: 'Détail : Licence Informatique' }).click();
  const form = page.getByRole('form', { name: 'Détail de Licence Informatique' });
  const series = form.getByRole('group', { name: 'Séries du bac admises' });
  await series.getByRole('button', { name: 'Série D' }).click();
  await series.getByRole('button', { name: 'Série C' }).click();
  await expect(series.getByRole('button', { name: 'Série C' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(form).toBeHidden();
  // Dans l'ordre de la liste, quel que soit l'ordre des touchers.
  await expect(section).toContainText('Séries admises : C, D');
  await section.getByRole('button', { name: 'Détail : Licence Informatique' }).click();
  await expect(series.getByRole('button', { name: 'Série D' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await series.getByRole('button', { name: 'Série C' }).click();
  await series.getByRole('button', { name: 'Série D' }).click();
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(form).toBeHidden();
  await expect(section).not.toContainText('Séries admises');
});

test('« Aujourd’hui » : les demandes des familles, sans nom ; une fiche demandée s’ouvre d’un toucher', async ({
  page,
}) => {
  await page.goto('/admin/?scenario=admin#aujourdhui');
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  const demandes = page.getByRole('region', { name: 'Les familles demandent' });
  const verifications = demandes.getByRole('region', { name: 'Vérifications demandées' });
  await expect(verifications.getByRole('link').first()).toHaveAccessibleName(
    'Complexe scolaire Les Palmiers · Site 1 : 7 demandes',
  );
  await expect(
    demandes.getByRole('region', { name: 'Tests d’orientation sans résultat' }),
  ).toContainText('Au lycée, ou j’ai le bac · Informatique · Pointe-Noire · Cours du soir');
  await expect(demandes).not.toContainText(/@|\+242/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await verifications.getByRole('link').first().click();
  await expect(
    page.getByRole('article', { name: 'Fiche de Complexe scolaire Les Palmiers' }),
  ).toBeVisible();
});

test('frais : une ligne liée à une formation du supérieur le reste quand la page est enregistrée de nouveau', async ({
  page,
}) => {
  // Avant le lot 2, la page des frais réécrivait chaque ligne sans sa formation : la ligne « par an » d'une licence s'en
  // détachait dès qu'on changeait la note commune.
  const ligne = await unInstitut(page);
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      campus: Record<string, Record<string, unknown>>;
    };
    e.campus['00000000-0000-4000-8000-0000000000f3']!['frais'] = [
      {
        id: 'fr-licence',
        cycle: 'superieur',
        classe: null,
        minimum: 450000,
        maximum: 450000,
        periode: 'annee',
        precisionPeriode: null,
        inscription: null,
        anneeScolaire: null,
        declaresLe: '2026-11-02',
        note: null,
        formationId: 'superieur|Licence Informatique',
        preuve: 'declaration',
        confirmeLe: '2026-11-03',
      },
    ];
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await page.reload();
  await ouvrirLesEcoles(page);
  await ouvrirGestion(ligne, 'Frais déclarés');
  const frais = page.getByRole('region', { name: 'Frais déclarés de [Institut Lot 2]' });
  await frais.getByLabel('Note (tenue, fournitures…)').fill('Tenue : [à préciser]');
  await frais.getByRole('button', { name: 'Enregistrer 1 ligne publiable' }).click();
  await expect(page.getByRole('status').first()).toContainText('1 ligne de frais enregistrée');
  const gardee = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus: Record<string, { frais?: { formationId?: string | null; note?: string | null }[] }>;
    };
    return e.campus['00000000-0000-4000-8000-0000000000f3']!.frais![0];
  });
  expect(gardee).toMatchObject({
    formationId: 'superieur|Licence Informatique',
    note: 'Tenue : [à préciser]',
  });
});
