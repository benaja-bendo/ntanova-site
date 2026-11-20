// Ticket 205 (20/11/2026), la saisie : un agrément cité par l'école sans date, le site web de l'école dans « En bref »,
// un prospectus gardé en document privé, « En couverture », et le numéro de l'école lu sur l'enseigne. Faux serveur.
import { expect, test, type Page } from '@playwright/test';
import { ficheOuverte, ouvrirFiche, ouvrirGestion, ouvrirLesEcoles, seConnecter } from './aides';

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;
const hier = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function gerer(page: Page, section: string) {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  await ouvrirGestion(page.getByRole('row', { name: /\[École à situer\]/ }), section);
  return ficheOuverte(page);
}

test('un agrément cité par l’école se note sans la date du document ; le site web va dans « En bref »', async ({
  page,
}) => {
  await gerer(page, 'Agrément');
  const agrement = page.getByRole('form', { name: 'Agrément de [École à situer]' });
  await agrement.getByLabel('Intitulé du document').selectOption('agrement');
  await agrement.getByLabel(/^Référence, telle/).fill('arrêté n° 0445');
  await agrement.getByLabel(/^Source, en mots/).fill('Le prospectus de l’école');
  await agrement
    .getByRole('group', { name: 'Vue sur' })
    .getByRole('button', { name: 'Cité par l’école, document pas encore vu' })
    .click();
  await expect(agrement.getByLabel('Date du document (facultative)')).toHaveValue('');
  await agrement.getByLabel(/^Jour où l’école l’a dit/).fill(hier());
  await agrement.getByRole('button', { name: 'Enregistrer l’agrément' }).click();
  await expect(agrement.getByRole('list')).toContainText('arrêté n° 0445');
  await expect(agrement.getByRole('list')).toContainText('document pas encore vu');

  const enBref = page.getByRole('form', { name: 'Modifier [École à situer]' });
  await enBref.getByLabel(/^Site web/).fill('http://ecole.cg');
  await enBref.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(enBref).toContainText('Un lien commence par https://');
  await enBref.getByLabel(/^Site web/).fill('https://ecole.cg');
  await enBref.getByLabel(/^Créée en/).fill('2009');
  await enBref.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status').first()).toContainText('est modifiée');
});

test('un prospectus reste un document privé ; une image de la galerie passe « En couverture »', async ({
  page,
}) => {
  await gerer(page, 'Images');
  const images = page.getByRole('region', { name: 'Images de l’école' });
  const form = images.getByRole('form', { name: 'Ajouter une image' });

  await form.getByLabel('C’est').selectOption('document');
  await expect(form.getByLabel('Elle montre')).toHaveCount(0);
  await expect(form.getByRole('checkbox')).toHaveCount(0);
  await form.getByLabel('Le fichier').setInputFiles(photo);
  await form.getByLabel('Légende').fill('[Prospectus 2026]');
  await form.getByLabel(/^D’où vient l’image/).fill('Reçu par WhatsApp');
  await form.getByRole('button', { name: 'Ajouter l’image' }).click();
  const document = images.getByRole('listitem').filter({ hasText: '[Prospectus 2026]' });
  await expect(document).toContainText('Jamais publique');
  await expect(document).toContainText('Vient de : Reçu par WhatsApp');
  await expect(document.getByRole('button', { name: /publier/i })).toHaveCount(0);

  for (const [genre, legende] of [
    ['cover', '[Ancienne couverture]'],
    ['gallery', '[La cour]'],
  ] as const) {
    await form.getByLabel('C’est').selectOption(genre);
    await form.getByLabel('Le fichier').setInputFiles(photo);
    await form.getByLabel('Légende').fill(legende);
    await form.getByRole('button', { name: 'Ajouter l’image' }).click();
    await expect(images.getByRole('listitem').filter({ hasText: legende })).toBeVisible();
  }
  await images
    .getByRole('listitem')
    .filter({ hasText: '[La cour]' })
    .getByRole('button', { name: 'En couverture' })
    .click();
  await expect(page.getByRole('status').first()).toContainText('mise en couverture');
  await expect(
    images
      .getByRole('listitem')
      .filter({ hasText: '[Ancienne couverture]' })
      .getByRole('button', { name: 'En couverture' }),
  ).toBeVisible();
});

test('le numéro de l’école lu sur l’enseigne, illisible en partie, se garde en mots', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  await ouvrirFiche(page.getByRole('row', { name: /\[École à situer\]/ }));
  const carte = page.getByRole('region', { name: 'Contacts de l’école, privé' });
  await carte.getByRole('button', { name: 'Gérer les contacts de l’école' }).click();
  await page.getByRole('button', { name: 'Ajouter le numéro de l’école' }).click();
  const form = page.getByRole('form', { name: 'Numéro de l’école' });
  await expect(form.getByLabel('Lu sur')).toHaveValue('');
  await form.getByLabel('Lu sur').selectOption('enseigne');
  await form.getByLabel('Numéro').fill('06 506');
  await form.getByRole('button', { name: 'Enregistrer le numéro' }).click();
  await expect(form.getByRole('alert')).toContainText('Illisible en partie');
  await form.getByLabel('Illisible en partie').check();
  await form.getByLabel('Ce qu’on lit').fill('06 506 ou 508 40 46');
  await form.getByRole('button', { name: 'Enregistrer le numéro' }).click();
  await expect(page.getByRole('status').first()).toContainText('numéro de l’école est noté');
  await expect(page.getByRole('list', { name: 'Personnes à contacter' }).first()).toContainText(
    'Numéro de l’école · lu sur l’enseigne',
  );
});
