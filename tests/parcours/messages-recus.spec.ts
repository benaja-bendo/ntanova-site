// « Messages reçus » (refonte publique, lot 3B2 ; planches « Messages reçus » et « Retraits » du canevas admin), avec le scénario
// « admin » du faux serveur : lister sans ouvrir, lire, rattacher, décider, répondre, attendre, clore, rouvrir ; un retrait entier ;
// les indésirables ; les alertes ; les refus, les conflits, les pannes ; un compte qui n'est pas administrateur.
import { expect, test, type Locator, type Page } from '@playwright/test';

interface Enregistre {
  reference: string;
  etat: string;
  version: number;
  ouvertLe: string | null;
  decision: string | null;
  motif: string | null;
  reponse: string;
  reponduLe: string | null;
  ficheId: string | null;
  suiteDe: string | null;
  alerte: { etat: string; prochainEssaiLe: string } | null;
  evenements: { quoi: string }[];
  retrait: { issue: string | null; miseEnLigneLe: string | null; retireLe: string | null } | null;
}

const CLE = 'ntanova-faux-messages';

/** Ce que la base (fausse) garde, à comparer avec ce que l'écran dit. */
const enBase = (page: Page) =>
  page.evaluate(
    (cle) =>
      (JSON.parse(localStorage.getItem(cle) ?? '{"messages":[]}') as { messages: Enregistre[] })
        .messages,
    CLE,
  );
const unEnBase = async (page: Page, reference: string): Promise<Enregistre> => {
  const m = (await enBase(page)).find((x) => x.reference === reference);
  if (!m) throw new Error(`${reference} n'est pas en base`);
  return m;
};
/** L'autre onglet : change la base sans passer par cet écran. */
const modifierEnBase = (page: Page, reference: string, champs: Record<string, unknown>) =>
  page.evaluate(
    ([cle, ref, plus]) => {
      const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as { messages: Enregistre[] };
      e.messages = e.messages.map((m) =>
        m.reference === ref ? { ...m, version: m.version + 1, ...plus } : m,
      );
      localStorage.setItem(cle, JSON.stringify(e));
    },
    [CLE, reference, champs] as const,
  );
const panne = (page: Page, quelle: string | null) =>
  page.evaluate((q) => {
    if (q) localStorage.setItem('ntanova-faux-messages-panne', q);
    else localStorage.removeItem('ntanova-faux-messages-panne');
  }, quelle);

async function ouvrirLaBoite(page: Page, suite = '') {
  await page.goto(`/admin/?scenario=admin#demandes${suite}`);
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Messages reçus' })).toBeAttached();
  // Le scénario repart de zéro à chaque chargement : l'adresse le perd, recharger garde donc l'état.
  await page.evaluate(() => history.replaceState(null, '', location.pathname + location.hash));
}
/** Une autre adresse de la même boîte, sans recharger (l'état du faux serveur ne repart pas de zéro). */
const allerA = (page: Page, suite: string) =>
  page.evaluate((s) => {
    location.hash = `demandes${s}`;
  }, suite);

const titreDuMessage = (page: Page, nom: string | RegExp) =>
  page.getByRole('article').getByRole('heading', { level: 2, name: nom });
const gestes = (page: Page) => page.getByRole('group', { name: 'Traiter ce message' });
const geste = (page: Page, nom: string) => gestes(page).getByRole('button', { name: nom });
const annonce = (page: Page, texte: string | RegExp) =>
  expect(page.getByRole('article').getByRole('status').filter({ hasText: texte })).toBeVisible();
/** Un bloc de retour attendu APRÈS la fermeture d'un tiroir. */
const ferme = (page: Page) => expect(page.getByRole('dialog')).toHaveCount(0);
const rienDeCoche = async (dans: Locator) => {
  await expect(dans.locator('input:checked')).toHaveCount(0);
};
const sansDebordement = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

test('lister n’ouvre rien, ouvrir fige : décider, répondre, clore, puis rouvrir', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  // Aucune conversation ne s'ouvre pour de vrai.
  await context.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (r) =>
    r.fulfill({ body: 'conversation' }),
  );
  await ouvrirLaBoite(page);
  const liste = page.getByRole('list', { name: 'Messages', exact: true });
  await expect(liste.getByRole('link')).toHaveCount(4);
  // Rien n'est présélectionné, et la lecture de la file n'a rien ouvert.
  await expect(liste.locator('[aria-current]')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  expect((await unEnBase(page, 'A-7K4P-2QXM')).ouvertLe).toBeNull();

  // Les entrées de la file, sans leur contenu : ni message, ni coordonnée.
  await expect(liste).not.toContainText('242060000013');
  await expect(liste).not.toContainText('[le message');

  await liste.getByRole('link', { name: /A-7K4P-2QXM/ }).click();
  await expect(titreDuMessage(page, '[Complexe scolaire Exemple]')).toBeVisible();
  const ouvert = await unEnBase(page, 'A-7K4P-2QXM');
  expect(ouvert.ouvertLe).not.toBeNull();
  // Rouvrir la page ne l'ouvre pas une seconde fois.
  await page.reload();
  await expect(titreDuMessage(page, '[Complexe scolaire Exemple]')).toBeVisible();
  expect((await unEnBase(page, 'A-7K4P-2QXM')).version).toBe(ouvert.version);

  // Décider vient d'abord ; répondre et clore attendent.
  await expect(geste(page, 'Répondre')).toBeDisabled();
  await expect(geste(page, 'Clore')).toBeDisabled();
  await geste(page, 'Décider').click();
  const decider = page.getByRole('dialog', { name: /^Décider/ });
  await rienDeCoche(decider);
  const enregistrer = decider.getByRole('button', { name: 'Enregistrer la décision' });
  await expect(enregistrer).toBeDisabled();
  // Le motif n'existe que pour les deux décisions qui en demandent un.
  await decider.getByRole('radio', { name: 'Elle est déjà dans l’annuaire' }).check();
  await expect(decider.getByLabel(/^Motif, pour toi/)).toHaveCount(0);
  await decider.getByRole('radio', { name: 'Non retenue' }).check();
  await decider.getByLabel(/^Motif, pour toi/).fill('[motif noté pour toi]');
  await enregistrer.click();
  await ferme(page);
  await annonce(page, 'Décision notée.');
  expect((await unEnBase(page, 'A-7K4P-2QXM')).motif).toBe('[motif noté pour toi]');

  // Ouvrir WhatsApp n'envoie rien et ne note rien : la phrase est neutre, le message n'est jamais recopié.
  await geste(page, 'Répondre').click();
  const repondre = page.getByRole('dialog', { name: 'Répondre sur WhatsApp' });
  await rienDeCoche(repondre);
  const lien = repondre.getByRole('link', { name: 'Ouvrir WhatsApp' });
  const adresse = decodeURIComponent((await lien.getAttribute('href')) ?? '');
  expect(adresse).toContain('A-7K4P-2QXM');
  expect(adresse).not.toContain('Mfilou');
  expect(adresse).not.toContain('Prénom');
  const conversation = page.waitForEvent('popup');
  await lien.click();
  await (await conversation).close();
  await expect(repondre.getByText(/WhatsApp ouvert .* : pas encore noté/)).toBeVisible();
  expect((await unEnBase(page, 'A-7K4P-2QXM')).reponse).toBe('a_faire');
  // Le jour réel : jamais coché d'avance, jamais dans le futur.
  const noter = repondre.getByRole('button', { name: 'Noter l’envoi' });
  await rienDeCoche(repondre);
  await expect(noter).toBeDisabled();
  await repondre.getByRole('radio', { name: 'Un autre jour' }).check();
  await expect(noter).toBeDisabled();
  await repondre.getByLabel('Le jour', { exact: true }).fill('2999-01-01');
  await expect(noter).toBeDisabled();
  await repondre.getByRole('radio', { name: 'Aujourd’hui' }).check();
  await noter.click();
  await ferme(page);
  await annonce(page, 'Réponse notée.');

  // Clore annonce la date d'effacement ; rouvrir l'annule.
  await geste(page, 'Clore').click();
  const clore = page.getByRole('alertdialog', { name: 'Clore A-7K4P-2QXM ?' });
  await expect(clore).toContainText('Effacé automatiquement le');
  await clore.getByRole('button', { name: 'Clore', exact: true }).click();
  // La clôture se dit une fois, avec sa date d'effacement.
  await annonce(page, /^Clos /);
  await expect(page.getByText(/Effacé automatiquement le/)).toBeVisible();
  await allerA(page, '/clos');
  await expect(liste.getByRole('link', { name: /A-7K4P-2QXM/ })).toContainText('effacé le');
  await liste.getByRole('link', { name: /A-7K4P-2QXM/ }).click();
  await geste(page, 'Rouvrir').click();
  await annonce(page, 'Rouvert : la date d’effacement est annulée.');
  await expect(page.getByText(/Effacé automatiquement le/)).toHaveCount(0);
  expect((await unEnBase(page, 'A-7K4P-2QXM')).etat).toBe('ouverte');
});

test('versions, suites, rattacher, changer de file, mettre en attente', async ({ page }) => {
  test.setTimeout(90_000);
  await ouvrirLaBoite(page, '/A-9HZE-4NBV');
  await expect(titreDuMessage(page, /Palmiers/)).toBeVisible();

  // Deux versions reçues avant l'ouverture : la courante affichée, l'autre jamais masquée.
  await expect(page.getByText('Version 2 affichée, 2 reçues')).toBeVisible();
  await page.getByRole('button', { name: 'Voir la version 1' }).click();
  const version = page.getByRole('dialog', { name: 'Version 1' });
  await expect(version).toContainText('[première version du texte, plus courte]');
  await page.keyboard.press('Escape');
  await ferme(page);
  await expect(page.getByRole('button', { name: 'Voir la version 1' })).toBeFocused();

  // Une suite, arrivée après l'ouverture : reliée, dans les deux sens ; le texte lu n'a pas changé.
  await page.evaluate((cle) => {
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      messages: (Enregistre & { rang: number })[];
    };
    const lu = e.messages.find((m) => m.reference === 'A-9HZE-4NBV')!;
    e.messages.push({
      ...lu,
      rang: 99,
      reference: 'A-SUYT-E234',
      etat: 'recue',
      ouvertLe: null,
      version: 1,
      suiteDe: 'A-9HZE-4NBV',
    });
    localStorage.setItem(cle, JSON.stringify(e));
  }, CLE);
  await page.reload();
  await expect(page.getByText('Une suite reçue')).toBeVisible();
  await page.getByRole('link', { name: 'A-SUYT-E234' }).first().click();
  await expect(page.getByText('Suite d’un autre message')).toBeVisible();
  await page.getByRole('article').getByRole('link', { name: 'A-9HZE-4NBV' }).click();
  await expect(page.getByText('Une suite reçue')).toBeVisible();

  // Rattacher cherche dans toutes les écoles, ne décide rien et ne change pas la fiche.
  const avant = await page.evaluate(() => localStorage.getItem('ntanova-faux-serveur'));
  await page.getByRole('button', { name: 'Changer de fiche' }).click();
  const rattacher = page.getByRole('dialog', { name: 'Rattacher à une fiche' });
  await expect(rattacher.getByText('Écris deux lettres au moins.')).toBeVisible();
  await rattacher.getByRole('searchbox').fill('zzzz');
  await expect(rattacher.getByText('Aucune école ne correspond.')).toBeVisible();
  await rattacher.getByRole('searchbox').fill('préscolaire');
  await rattacher.getByRole('button', { name: /Centre préscolaire/ }).click();
  await ferme(page);
  await annonce(page, 'Rattaché à la fiche, qui n’a pas changé.');
  const rattache = await unEnBase(page, 'A-9HZE-4NBV');
  expect(rattache.ficheId).toBe('51000000-0000-4000-8000-000000000004');
  expect(rattache.decision).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('ntanova-faux-serveur'))).toBe(avant);
  await page.getByRole('button', { name: 'Détacher' }).click();
  await annonce(page, 'Détaché de la fiche.');

  // Un message de Contact ne se rattache pas : il passe d'abord dans la bonne file. L'original reste lisible, relié.
  await allerA(page, '/C-5TQA-6JKP');
  await expect(page.getByText('C-5TQA-6JKP').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rattacher à une fiche' })).toHaveCount(0);
  await geste(page, 'Décider').click();
  const decider = page.getByRole('dialog', { name: /^Décider/ });
  // Sans coordonnée, jamais vers les retraits : il faut pouvoir répondre.
  await expect(decider.getByRole('radio', { name: 'Le passer en « Retrait »' })).toHaveCount(0);
  await decider.getByRole('radio', { name: 'Le passer en « École absente »' }).check();
  await expect(decider).toContainText('Un nouveau message, relié à celui-ci');
  await decider.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await ferme(page);
  await expect(page.getByText('Passé dans une autre file', { exact: true })).toBeVisible();
  await page
    .getByRole('article')
    .getByRole('link', { name: /^A-[2-9A-Z]{4}-[2-9A-Z]{4}$/ })
    .click();
  await expect(page.getByText('Vient d’un autre message')).toBeVisible();

  // En attente, il change d'onglet et ne se décide plus ; le remettre à traiter rend les gestes.
  await allerA(page, '/C-3MWD-8RTA');
  await expect(page.getByText(/Limite d’envois atteinte/).first()).toBeVisible();
  await gestes(page).getByRole('button', { name: 'Mettre en attente' }).click();
  await annonce(page, 'Mis en attente.');
  await expect(geste(page, 'Décider')).toHaveCount(0);
  await geste(page, 'Remettre à traiter').click();
  await annonce(page, 'Remis à traiter.');
  await expect(geste(page, 'Décider')).toBeEnabled();
});

test('un retrait entier : vérifier, retirer dans Écoles, mettre en ligne, constater, prévenir, clore', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const dehors: string[] = [];
  page.on('request', (r) => {
    if (!new URL(r.url()).hostname.startsWith('127.0.0.1')) dehors.push(r.url());
  });
  await ouvrirLaBoite(page, '/retraits');
  await expect(page.getByRole('list', { name: 'Retraits' }).getByRole('link')).toHaveCount(2);
  expect((await unEnBase(page, 'R-2XFG-7MPA')).ouvertLe).toBeNull();
  await page.getByRole('link', { name: /R-2XFG-7MPA/ }).click();
  const etape = (nom: string) => page.getByRole('region', { name: nom, exact: true });

  // 1. Vérifier : rien de coché d'avance, aucune pièce d'identité demandée.
  const verifier = etape('Vérifier que la personne est concernée');
  await rienDeCoche(verifier);
  const noterVerif = verifier.getByRole('button', { name: 'Noter la vérification' });
  await expect(noterVerif).toBeDisabled();
  await verifier.getByRole('radio', { name: /^Autre vérification/ }).check();
  await expect(noterVerif).toBeDisabled();
  await verifier.getByRole('radio', { name: 'Elle écrit depuis le numéro à retirer' }).check();
  await noterVerif.click();
  await annonce(page, 'Vérification notée.');

  // 2. Retirer : désigner, puis la base refuse tant que c'est publié.
  const retirer = etape('Retirer dans la base');
  await rienDeCoche(retirer);
  await retirer.getByRole('checkbox', { name: 'Le contact public' }).check();
  // Rattacher une fiche en cours d'étape garde ce qui est coché.
  await page.getByRole('button', { name: 'Changer de fiche' }).click();
  await page.getByRole('searchbox').fill('palmiers');
  await page
    .getByRole('button', { name: /Palmiers — Site 1/ })
    .first()
    .click();
  await ferme(page);
  await expect(retirer.getByRole('checkbox', { name: 'Le contact public' })).toBeChecked();
  await retirer.getByRole('button', { name: 'Noter ce qui est à retirer' }).click();
  await annonce(page, 'Noté. Retire-le maintenant dans Écoles.');
  await retirer.getByRole('button', { name: 'Noter : retiré de la base' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Encore publié : le contact public. Retire-le dans Écoles, puis reviens.',
  );
  await expect(page.getByRole('alert')).toContainText('Ce geste n’est pas enregistré.');
  expect((await unEnBase(page, 'R-2XFG-7MPA')).retrait?.retireLe).toBeNull();

  // Le retrait lui-même : dans Écoles, avec l'écran qui existe déjà.
  await retirer.getByRole('link', { name: 'Ouvrir la fiche dans Écoles' }).click();
  await page.getByRole('button', { name: 'Contact et inscriptions : ouvrir' }).click();
  await page.getByRole('button', { name: 'Retirer le contact public' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'retiré de la base' })).toBeVisible();
  await allerA(page, '/R-2XFG-7MPA/retraits');
  await retirer.getByRole('button', { name: 'Noter : retiré de la base' }).click();
  await annonce(page, /Encore visible en ligne/);
  await expect(page.getByRole('article').getByText('Pas encore constaté en ligne')).toBeVisible();

  // 3. Mettre en ligne : une consigne et une date, aucun lancement.
  const enLigne = etape('Demander la mise en ligne');
  await enLigne.getByLabel(/^Numéro de l’exécution/).fill('abc');
  const noterMise = enLigne.getByRole('button', { name: 'Noter : mise en ligne demandée' });
  await expect(noterMise).toBeDisabled();
  await enLigne.getByLabel(/^Numéro de l’exécution/).fill('451000002');
  await noterMise.click();
  await annonce(page, 'Noté : mise en ligne demandée. Reste à constater.');

  // 4. Constater : les deux adresses, chacune à son jour.
  const constater = etape('Constater en ligne');
  await rienDeCoche(constater);
  const noterConstat = constater.getByRole('button', { name: 'Noter : constaté en ligne' });
  await constater
    .getByRole('group', { name: /^ntanova\.com/ })
    .getByRole('radio', { name: 'Aujourd’hui' })
    .check();
  await expect(noterConstat).toBeDisabled();
  await constater
    .getByRole('group', { name: /^essai\.ntanova\.com/ })
    .getByRole('radio', { name: 'Aujourd’hui' })
    .check();
  await noterConstat.click();
  await annonce(page, /constaté en ligne, sur les deux adresses/);

  // 5. Prévenir, puis 6. clore : ouvrir WhatsApp ne note rien, le jour n'est pas coché.
  const prevenir = etape('Prévenir la personne');
  await rienDeCoche(prevenir);
  await prevenir.getByRole('radio', { name: 'Aujourd’hui' }).check();
  await prevenir.getByRole('button', { name: 'Noter : personne prévenue' }).click();
  await annonce(page, 'Réponse notée.');
  await etape('Clore').getByRole('button', { name: 'Clore', exact: true }).click();
  await expect(page.getByText(/Effacé automatiquement le/)).toBeVisible();
  await allerA(page, '/retraits-clos');
  await expect(page.getByRole('link', { name: /R-2XFG-7MPA/ })).toBeVisible();

  // Rien n'est parti du navigateur : ni déploiement, ni message.
  expect(dehors.filter((u) => /github|wa\.me|mailto|resend|smtp/.test(u))).toEqual([]);
});

test('impossible à vérifier : rien n’est retiré, la personne est prévenue ou non, puis clos', async ({
  page,
}) => {
  await ouvrirLaBoite(page, '/R-2XFG-7MPA');
  await page.getByRole('button', { name: 'Impossible à vérifier' }).click();
  const confirmer = page.getByRole('alertdialog', { name: 'Impossible à vérifier ?' });
  await expect(confirmer).toContainText('Rien n’est retiré.');
  // Annuler ne note rien.
  await confirmer.getByRole('button', { name: 'Annuler' }).click();
  expect((await unEnBase(page, 'R-2XFG-7MPA')).retrait?.issue).toBeNull();
  await page.getByRole('button', { name: 'Impossible à vérifier' }).click();
  await confirmer.getByRole('button', { name: 'Noter : impossible à vérifier' }).click();
  await annonce(page, /Rien n’est retiré/);
  const m = await unEnBase(page, 'R-2XFG-7MPA');
  expect(m.retrait).toMatchObject({ issue: 'impossible', retireLe: null, miseEnLigneLe: null });
  const prevenir = page.getByRole('region', { name: 'Prévenir la personne', exact: true });
  await prevenir.getByRole('button', { name: 'Impossible de la prévenir' }).click();
  await annonce(page, 'Noté : réponse impossible.');
  await page
    .getByRole('region', { name: 'Clore', exact: true })
    .getByRole('button', { name: 'Clore' })
    .click();
  await expect(page.getByText(/Effacé automatiquement le/)).toBeVisible();
  // Le contact public n'a pas bougé.
  expect(
    await page.evaluate(() =>
      Boolean(
        (
          JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{"campus":{}}') as {
            campus: Record<string, { contactPublic?: unknown }>;
          }
        ).campus['51000000-0000-4000-8000-000000000001']?.contactPublic,
      ),
    ),
  ).toBe(true);
});

test('un indésirable se restaure, et ne s’ouvre qu’à sa demande', async ({ page }) => {
  await ouvrirLaBoite(page);
  await page.getByRole('link', { name: 'Indésirables (1)' }).click();
  await page.getByRole('link', { name: /C-2GZX-4LWD/ }).click();
  await expect(page.getByText(/Effacé automatiquement le .* si tu ne fais rien/)).toBeVisible();
  await geste(page, 'Ce n’est pas indésirable').click();
  await annonce(page, 'Rendu à sa file.');
  expect((await unEnBase(page, 'C-2GZX-4LWD')).etat).not.toBe('indesirable');
  await allerA(page, '');
  await expect(page.getByRole('link', { name: /C-2GZX-4LWD/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Indésirables/ })).toHaveCount(0);
});

test('alertes en échec : relancer avance l’essai, sans ouvrir le message ni rien envoyer d’ici', async ({
  page,
}) => {
  await ouvrirLaBoite(page);
  const bande = page.getByRole('region', { name: 'Alertes en échec' });
  await expect(bande).toContainText('1 message sans alerte par e-mail');
  await bande.getByRole('link', { name: 'Voir ce message' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Alertes en échec' })).toBeVisible();
  await expect(page.getByRole('link', { name: /A-7K4P-2QXM/ })).toBeVisible();
  const avant = await unEnBase(page, 'A-7K4P-2QXM');
  await bande.getByRole('button', { name: 'Relancer maintenant' }).click();
  await expect(bande.getByRole('status')).toContainText('Relance demandée pour 1 alerte');
  const apres = await unEnBase(page, 'A-7K4P-2QXM');
  expect(apres.ouvertLe).toBeNull();
  expect(apres.version).toBe(avant.version);
  expect(Date.parse(apres.alerte!.prochainEssaiLe)).toBeLessThan(
    Date.parse(avant.alerte!.prochainEssaiLe),
  );
  // Un service muet se dit ; jamais passé, il n'est pas « en marche ».
  await page.evaluate((cle) => {
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as Record<string, unknown>;
    e.dernierPassageAlertesLe = null;
    localStorage.setItem(cle, JSON.stringify(e));
  }, CLE);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Alertes par e-mail' })).toContainText(
    'ne sont pas activées',
  );
});

test('relancer toutes les alertes parcourt aussi les pages après la deux-centième', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ouvrirLaBoite(page);
  await page.evaluate((cle) => {
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}');
    const modele = e.messages.find((m: Enregistre) => m.reference === 'A-7K4P-2QXM');
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    e.messages = Array.from({ length: 205 }, (_, i) => ({
      ...structuredClone(modele),
      rang: i + 1,
      reference: `A-2222-22${alphabet[Math.floor(i / alphabet.length)]}${alphabet[i % alphabet.length]}`,
    }));
    localStorage.setItem(cle, JSON.stringify(e));
    localStorage.setItem('ntanova-faux-latence', '0');
  }, CLE);
  await page.reload();
  const bande = page.getByRole('region', { name: 'Alertes en échec' });
  await expect(bande).toContainText('205 messages sans alerte par e-mail');
  await bande.getByRole('button', { name: 'Relancer maintenant' }).click();
  await expect(bande.getByRole('status')).toContainText('Relance demandée pour 205 alertes');
  const messages = await enBase(page);
  expect(messages.every((m) => m.ouvertLe === null)).toBe(true);
  expect(messages.every((m) => m.evenements.some((e) => e.quoi === 'annonce_relancee'))).toBe(true);
});

test('conflit : la saisie reste, il faut relire, rien n’est réappliqué seul', async ({ page }) => {
  await ouvrirLaBoite(page, '/A-7K4P-2QXM');
  await geste(page, 'Décider').click();
  const decider = page.getByRole('dialog', { name: /^Décider/ });
  await decider.getByRole('radio', { name: 'Introuvable pour l’instant' }).check();
  await decider.getByLabel(/^Motif, pour toi/).fill('[motif saisi ici]');
  // Pendant ce temps, dans un autre onglet, le message est décidé.
  await modifierEnBase(page, 'A-7K4P-2QXM', { decision: 'deja_presente' });
  await decider.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(decider.getByRole('alert')).toContainText('Ce message a changé entre-temps.');
  await expect(decider.getByLabel(/^Motif, pour toi/)).toHaveValue('[motif saisi ici]');
  expect((await unEnBase(page, 'A-7K4P-2QXM')).decision).toBe('deja_presente');

  await decider.getByRole('button', { name: 'Relire le message' }).click();
  await annonce(page, /Message relu\. Ta saisie est gardée/);
  await expect(page.getByRole('region', { name: 'Décision' })).toContainText(
    'Elle est déjà dans l’annuaire',
  );
  // Relire n'a rien écrit ; la saisie attend, l'administration décide.
  expect((await unEnBase(page, 'A-7K4P-2QXM')).decision).toBe('deja_presente');
  await geste(page, 'Décider').click();
  await expect(decider.getByLabel(/^Motif, pour toi/)).toHaveValue('[motif saisi ici]');
  await decider.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await ferme(page);
  expect((await unEnBase(page, 'A-7K4P-2QXM')).decision).toBe('introuvable');
});

test('panne d’un geste, réponse perdue, session, accès : jamais un faux succès, jamais deux écritures', async ({
  page,
}) => {
  await ouvrirLaBoite(page, '/A-7K4P-2QXM');
  await geste(page, 'Décider').click();
  const decider = page.getByRole('dialog', { name: /^Décider/ });
  await decider.getByRole('radio', { name: 'Elle est déjà dans l’annuaire' }).check();
  const enregistrer = decider.getByRole('button', { name: 'Enregistrer la décision' });
  await panne(page, 'geste');
  await enregistrer.click();
  await expect(decider.getByRole('alert')).toContainText('Ce geste n’est pas confirmé.');
  await expect(decider.getByRole('radio', { name: 'Elle est déjà dans l’annuaire' })).toBeChecked();
  expect((await unEnBase(page, 'A-7K4P-2QXM')).decision).toBeNull();

  await panne(page, 'session');
  await enregistrer.click();
  await expect(decider.getByRole('alert')).toContainText('Ta session est terminée.');
  await panne(page, 'acces');
  await enregistrer.click();
  await expect(decider.getByRole('alert')).toContainText('n’est pas, ou plus, administrateur');

  // La réponse se perd après l'écriture : on ne sait pas. Réessayer tombe sur la version, rien n'est écrit deux fois.
  await panne(page, 'reponse');
  await enregistrer.click();
  await expect(decider.getByRole('alert')).toContainText('Ce geste n’est pas confirmé.');
  const version = (await unEnBase(page, 'A-7K4P-2QXM')).version;
  await panne(page, null);
  await enregistrer.click();
  await expect(decider.getByRole('alert')).toContainText('Ce message a changé entre-temps.');
  const m = await unEnBase(page, 'A-7K4P-2QXM');
  expect(m.version).toBe(version);
  expect(m.evenements.filter((e) => e.quoi === 'decidee')).toHaveLength(1);
});

test('chargement, vide et panne ne se confondent pas ; un message effacé se dit', async ({
  page,
}) => {
  await ouvrirLaBoite(page);
  await expect(page.getByRole('list', { name: 'Messages', exact: true })).toBeVisible();
  // Vide : une phrase, pas un échec.
  await allerA(page, '/alertes');
  await modifierEnBase(page, 'A-7K4P-2QXM', { alerte: null });
  await page.reload();
  await expect(page.getByText('Aucune alerte en échec.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Panne : jamais « vide ».
  await panne(page, 'lecture');
  await allerA(page, '/clos');
  await expect(page.getByRole('alert')).toContainText('Les messages ne se chargent pas.');
  await expect(page.getByText('Aucun message clos.')).toHaveCount(0);
  await panne(page, null);
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('link', { name: /C-8PLN-3HDS/ })).toBeVisible();
  // Chargement : dit, et lu par un lecteur d'écran.
  await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '1500'));
  await allerA(page, '/en-attente');
  await expect(page.getByRole('status').filter({ hasText: 'Chargement' })).toBeVisible();
  await expect(page.getByRole('link', { name: /A-4RVB-9CEW/ })).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('ntanova-faux-latence'));
  // Une référence qui n'existe pas, ou plus.
  await allerA(page, '/C-2222-2222');
  await expect(page.getByRole('alert')).toContainText('C-2222-2222 n’existe pas, ou plus.');
  // Le filtre porte sur la file entière, et se quitte.
  await allerA(page, '');
  const natures = page.getByRole('group', { name: 'Nature' });
  await natures.getByRole('button', { name: 'Contact' }).click();
  await expect(page.getByRole('list', { name: 'Messages', exact: true })).not.toContainText(
    'A-9HZE',
  );
  await expect(page.getByRole('link', { name: /C-3MWD-8RTA/ })).toBeVisible();
  await natures.getByRole('button', { name: 'Tous' }).click();
  await expect(page.getByRole('link', { name: /A-9HZE-4NBV/ })).toBeVisible();
});

test('le lien d’une alerte ouvre son message après la connexion ; un autre compte ne charge rien', async ({
  page,
}) => {
  await page.goto('/admin/?scenario=admin#demandes/R-2XFG-7MPA');
  await expect(page.getByText('Connecte-toi pour ouvrir')).toContainText('R-2XFG-7MPA');
  // Avant la connexion, rien ne se lit.
  expect(await page.evaluate((cle) => localStorage.getItem(cle), CLE)).toBeNull();
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(titreDuMessage(page, /^Retirer/)).toBeVisible();

  // Un compte qui n'est pas administrateur : refusé, sans un seul message.
  await page.evaluate((cle) => {
    localStorage.clear();
    localStorage.setItem('ntanova-faux-scenario', '');
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify({ admin: false }));
    localStorage.removeItem(cle);
  }, CLE);
  await page.goto('/admin/#demandes/R-2XFG-7MPA');
  await page.reload();
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
  await expect(page.getByText('Aucun message n’est chargé.')).toBeVisible();
  expect(await page.evaluate((cle) => localStorage.getItem(cle), CLE)).toBeNull();

  // Un droit retiré en cours de route : la base refuse, l'écran le dit et ne montre rien.
  await page.evaluate(() => localStorage.clear());
  await page.goto('/admin/?scenario=admin');
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('region', { name: 'Ce qui t’attend' })).toBeVisible();
  await panne(page, 'acces');
  await allerA(page, '');
  await expect(page.getByRole('alert')).toContainText(
    'Cette page est réservée à l’administration.',
  );
  await expect(page.getByRole('list', { name: 'Messages', exact: true })).toHaveCount(0);
});

test(
  'Aujourd’hui et la navigation mènent à la boîte ; le clavier suffit ; rien ne déborde',
  { tag: '@largeurs' },
  async ({ page }) => {
    const large = (page.viewportSize()?.width ?? 0) >= 1024;
    await ouvrirLaBoite(page);
    await page.evaluate(() => {
      location.hash = 'accueil';
    });
    // Distincte de « Les familles demandent » (des comptes sans nom).
    const carte = page
      .getByRole('region', { name: 'Ce qui t’attend' })
      .getByRole('link', { name: /messages reçus/ });
    await expect(carte).toBeVisible();
    if (large) {
      await page
        .getByRole('link', { name: /^Messages reçus/ })
        .first()
        .click();
    } else {
      const bas = page.getByRole('navigation', { name: 'Navigation' });
      await expect(bas.getByRole('link')).toHaveCount(4);
      await bas.getByRole('button', { name: 'Plus' }).click();
      await page
        .getByRole('dialog', { name: 'Plus' })
        .getByRole('link', { name: /^Messages reçus/ })
        .click();
      await expect(bas.getByRole('button', { name: 'Plus' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    const ligne = page.getByRole('link', { name: /A-9HZE-4NBV/ });
    await expect(ligne).toBeVisible();
    await sansDebordement(page);

    // Au clavier : ouvrir, décider, Échap (le focus revient au bouton), choisir aux flèches, enregistrer.
    await ligne.focus();
    await page.keyboard.press('Enter');
    await expect(titreDuMessage(page, /Palmiers/)).toBeVisible();
    if (large) await expect(ligne).toHaveAttribute('aria-current', 'true');
    else await expect(titreDuMessage(page, /Palmiers/)).toBeFocused();
    await sansDebordement(page);
    await geste(page, 'Décider').focus();
    await page.keyboard.press('Enter');
    const tiroir = page.getByRole('dialog', { name: /^Décider/ });
    await expect(tiroir).toBeVisible();
    expect(await tiroir.evaluate((e) => e.contains(document.activeElement))).toBe(true);
    expect(await tiroir.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await ferme(page);
    await expect(geste(page, 'Décider')).toBeFocused();
    await page.keyboard.press('Enter');
    await tiroir.getByRole('radio').first().focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await expect(tiroir.getByRole('radio').nth(1)).toBeChecked();
    await tiroir.getByRole('button', { name: 'Enregistrer la décision' }).focus();
    await page.keyboard.press('Enter');
    await ferme(page);
    await annonce(page, 'Décision notée.');
    // Le focus n'est jamais perdu en haut de page.
    await expect
      .poll(() => page.evaluate(() => document.activeElement !== document.body))
      .toBe(true);
    if (!large) {
      await page
        .getByRole('link', { name: /Messages reçus/ })
        .first()
        .click();
      await expect(page.getByRole('heading', { level: 1, name: 'Messages reçus' })).toBeFocused();
    }
    // Les gestes sont à 44 px au moins.
    for (const b of await page.getByRole('article').getByRole('button').all()) {
      const boite = await b.boundingBox();
      if (boite) expect(boite.height).toBeGreaterThanOrEqual(44);
    }
    await sansDebordement(page);
  },
);
