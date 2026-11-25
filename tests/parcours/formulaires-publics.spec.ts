// Les formulaires publics (refonte publique, lot 3C ; planches « Contact », « Annuaire » et « Contact · reprise et refus », contrat 3A
// §19) sur le faux serveur : de la saisie à Messages reçus, les coupures, les reprises, les refus, ce qui ne sort jamais de l'onglet.
// Cas du contrat : 5 à 8, 11, 13, 14, 17, 32, 38, 41, 45, 46, 54. Le retrait de bout en bout (35) et les deux positions du réglage sont
// dans `tests/constructions/`.
import { expect, test, type Page } from '@playwright/test';

interface Garde {
  reference: string;
  nature: string;
  etat: string;
  suiteDe: string | null;
  ficheId: string | null;
  limiteLe: string | null;
  versions: {
    revision: number;
    contenu: Record<string, unknown>;
    courante: boolean;
    tardive: boolean;
  }[];
  alerte: unknown;
  decision: string | null;
  reponse: string;
  envoi?: { cle: string };
}

const CLE_BASE = 'ntanova-faux-messages';
const TEXTE = '[un message inventé, écrit pour le parcours]';
const NUMERO = '06 000 00 77';
const REFERENCE = /[CAR]-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}/;

const enBase = (page: Page) =>
  page.evaluate(
    (cle) =>
      (JSON.parse(localStorage.getItem(cle) ?? '{"messages":[]}') as { messages: Garde[] })
        .messages,
    CLE_BASE,
  );
const regler = (page: Page, nom: string, valeur: string | null) =>
  page.evaluate(
    ([n, v]) => {
      if (v === null) localStorage.removeItem(`ntanova-faux-${n}`);
      else localStorage.setItem(`ntanova-faux-${n}`, v as string);
    },
    [nom, valeur] as const,
  );
const racine = (page: Page) => page.locator('[data-formulaire]');
const pret = (page: Page) => expect(racine(page)).toHaveAttribute('data-etat', 'pret');
const bouton = (page: Page, nom: string) => page.getByRole('button', { name: nom, exact: true });
const refus = (page: Page) => page.locator('[data-refus]');
const confirmation = (page: Page) => page.locator('[data-confirmation]');
const brouillon = (page: Page, nom = 'contact') =>
  page.evaluate((n) => sessionStorage.getItem(`ntanova-brouillon-${n}`), nom);

async function ouvrir(page: Page, adresse: string) {
  await page.goto(adresse);
  await pret(page);
}
async function ecrireUnMessage(page: Page, texte = TEXTE) {
  await page.getByLabel('Votre message').fill(texte);
  await page.getByRole('radio', { name: 'Non, merci' }).check();
}
const envoyer = (page: Page) => bouton(page, 'Envoyer le message').click();

/** Un refus : dit, jamais « enregistré », et tout ce qui est écrit est encore là. */
async function refuse(page: Page, titre: string, texte = TEXTE) {
  await expect(refus(page)).toBeVisible();
  await expect(refus(page).getByRole('heading')).toHaveText(titre);
  await expect(refus(page)).toBeFocused();
  await expect(confirmation(page)).toBeHidden();
  await expect(page.getByLabel('Votre message')).toHaveValue(texte);
  await expect(page.getByRole('radio', { name: 'Non, merci' })).toBeChecked();
  expect(await brouillon(page)).toContain(texte);
}
async function confirme(page: Page, titre: string): Promise<string> {
  await expect(confirmation(page)).toBeVisible();
  // Le nom accessible : seul le titre de ce cas, les autres sont cachés.
  await expect(
    confirmation(page).getByRole('heading', { level: 2, name: titre, exact: true }),
  ).toBeFocused();
  const reference = await page.locator('[data-ok-reference]').innerText();
  expect(reference).toMatch(REFERENCE);
  return reference;
}
async function administration(page: Page, suite: string) {
  await page.goto(`/admin/#demandes${suite}`);
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Messages reçus' })).toBeAttached();
}
const gestes = (page: Page) => page.getByRole('group', { name: 'Traiter ce message' });
async function decider(page: Page, choix: string) {
  await gestes(page).getByRole('button', { name: 'Décider' }).click();
  const d = page.getByRole('dialog', { name: /^Décider/ });
  await d.getByRole('radio', { name: choix }).check();
  await d.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function noterLaReponse(page: Page, canal: string) {
  await gestes(page).getByRole('button', { name: 'Répondre' }).click();
  const d = page.getByRole('dialog', { name: `Répondre ${canal}` });
  await d.getByRole('radio', { name: 'Aujourd’hui' }).check();
  await d.getByRole('button', { name: 'Noter l’envoi' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function clore(page: Page, reference: string) {
  await gestes(page).getByRole('button', { name: 'Clore' }).click();
  const d = page.getByRole('alertdialog', { name: `Clore ${reference} ?` });
  await d.getByRole('button', { name: 'Clore', exact: true }).click();
  await expect.poll(async () => (await enBase(page))[0]?.etat).toBe('close');
}

test.describe('du formulaire à Messages reçus', () => {
  test('Contact : rien de coché, une référence, puis décider, répondre, clore', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ouvrir(page, '/contact/');
    await expect(page.locator('form input:checked')).toHaveCount(0);
    await page.getByLabel(/^Sujet/).selectOption('trouver');
    await page.getByLabel('Votre message').fill(TEXTE);
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill(NUMERO);
    await envoyer(page);
    const reference = await confirme(page, 'Message enregistré');
    expect(reference).toMatch(/^C-/);
    await expect(confirmation(page)).toContainText('06 ••• •• 77');
    await expect(confirmation(page)).toContainText('Trouver une école ou une formation');
    expect(await brouillon(page)).toBeNull();

    const [m] = await enBase(page);
    expect(m).toMatchObject({ reference, nature: 'contact', etat: 'recue' });
    expect(m!.versions).toHaveLength(1);
    expect(m!.versions[0]!.contenu).toEqual({
      origine: 'direct',
      sujet: 'trouver',
      message: TEXTE,
      reponse: 'whatsapp',
      coordonnee: '242060000077',
    });

    await administration(page, `/${reference}`);
    await expect(page.getByRole('article')).toContainText(TEXTE);
    await decider(page, 'Traité');
    await noterLaReponse(page, 'sur WhatsApp');
    await clore(page, reference);
  });

  test('École absente : nom et ville requis, le reste facultatif, rien de publié', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ouvrir(page, '/contribuer/?type=manque&depuis=ecoles');
    await expect(page.getByRole('radio', { name: /^Une école manque/ })).toBeChecked();
    // Rien d'autre n'est coché : ni la réponse, ni « Je dirige cette école ».
    await expect(page.locator('form input:checked')).toHaveCount(1);
    await page.getByLabel('Nom de l’école', { exact: true }).fill('[Collège Exemple]');
    await page.getByLabel('Ville ou localité').fill('[Ville]');
    await page.getByRole('checkbox', { name: 'Collège' }).check();
    await page.getByRole('radio', { name: 'Non, merci' }).check();
    await bouton(page, 'Envoyer le signalement').click();
    const reference = await confirme(page, 'Signalement enregistré');
    expect(reference).toMatch(/^A-/);
    await expect(confirmation(page)).toContainText('[Collège Exemple], [Ville]');
    await expect(confirmation(page)).toContainText('n’est pas publiée pour autant');
    expect((await enBase(page))[0]!.versions[0]!.contenu).toEqual({
      origine: 'ecoles',
      nomEcole: '[Collège Exemple]',
      ville: '[Ville]',
      niveaux: ['C'],
      reponse: 'non',
    });
    await administration(page, `/${reference}`);
    await decider(page, 'Elle existe : une fiche est à préparer');
    await clore(page, reference);
  });

  test('Erreur depuis une fiche : la fiche est reprise par son numéro public, et se change', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ouvrir(page, '/contribuer/?type=erreur&ecole=482913&depuis=fiche');
    const fiche = page.locator('[data-fiche-choisie]');
    await expect(fiche).toContainText('[Complexe scolaire Exemple]');
    await expect(page.getByLabel('Nom de l’école concernée')).toBeHidden();
    await expect(page.locator('[data-retour-fiche]').first()).toHaveAttribute(
      'href',
      '/ecoles/complexe-scolaire-exemple-482913/',
    );
    await page.getByRole('radio', { name: 'Frais', exact: true }).check();
    await page.getByLabel(/^Qu’est-ce qui est faux/).fill(TEXTE);
    await page.getByLabel(/^Comment le savez-vous/).selectOption('ecole');
    await page.getByRole('radio', { name: 'Oui, par e-mail' }).check();
    await page.getByLabel('Votre adresse e-mail').fill('prenom@exemple.test');
    await bouton(page, 'Envoyer le signalement').click();
    const reference = await confirme(page, 'Signalement enregistré');
    await expect(confirmation(page)).toContainText('La fiche ne change pas à l’envoi');
    expect((await enBase(page))[0]!.versions[0]!.contenu).toEqual({
      origine: 'fiche',
      fiche: '20000000-0000-4000-8000-000000000001',
      information: 'frais',
      correction: TEXTE,
      source: 'ecole',
      reponse: 'email',
      coordonnee: 'prenom@exemple.test',
    });
    await administration(page, `/${reference}`);
    // L'administration lit exactement ce que la personne a choisi.
    await expect(page.getByRole('article')).toContainText(
      'Je travaille dans cette école ou je la dirige',
    );
    await decider(page, 'Correction retenue');
    await noterLaReponse(page, 'par e-mail');
    await clore(page, reference);
  });

  test('Retrait : sa file à part, toujours de quoi répondre, aucune pièce d’identité', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ouvrir(page, '/contribuer/?type=erreur&depuis=pied');
    // Un numéro ou une photo : la page propose le retrait, qui garde l'école écrite.
    await page.getByLabel('Nom de l’école concernée').fill('[Institut Exemple]');
    await page.getByRole('radio', { name: 'Téléphone ou contact' }).check();
    await bouton(page, 'Faire plutôt une demande de retrait').click();
    await expect(page.getByRole('radio', { name: /^Retirer une information/ })).toBeChecked();
    await expect(page.getByLabel('Nom de l’école concernée')).toHaveValue('[Institut Exemple]');
    await expect(page.getByRole('radio', { name: 'Un numéro de téléphone' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Non, merci' })).toBeHidden();
    await expect(page.getByText('Aucune pièce d’identité n’est demandée ici.')).toBeVisible();
    await bouton(page, 'Envoyer la demande').click();
    await expect(page.locator('[data-resume]')).toContainText('Réponse');
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill(NUMERO);
    await bouton(page, 'Envoyer la demande').click();
    const reference = await confirme(page, 'Demande de retrait enregistrée');
    expect(reference).toMatch(/^R-/);
    await expect(confirmation(page)).toContainText('Un numéro de téléphone');
    await expect(confirmation(page)).toContainText(
      'reste visible tant que le retrait n’est pas fait',
    );

    await administration(page, '/retraits');
    await page.getByRole('link', { name: new RegExp(reference) }).click();
    await page.getByRole('button', { name: 'Impossible à vérifier' }).click();
    await page
      .getByRole('alertdialog', { name: 'Impossible à vérifier ?' })
      .getByRole('button', { name: 'Noter : impossible à vérifier' })
      .click();
    const prevenir = page.getByRole('region', { name: 'Prévenir la personne', exact: true });
    await prevenir.getByRole('button', { name: 'Impossible de la prévenir' }).click();
    await page
      .getByRole('region', { name: 'Clore', exact: true })
      .getByRole('button', { name: 'Clore' })
      .click();
    await expect.poll(async () => (await enBase(page))[0]?.etat).toBe('close');
    expect((await enBase(page))[0]!.nature).toBe('retrait');
  });
});

test.describe('contrôler avant d’envoyer', () => {
  test('les erreurs sont sous les champs et dans un résumé ; corriger les efface ; tout au clavier @largeurs', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await page.getByLabel(/^Sujet/).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Votre message')).toBeFocused();
    await bouton(page, 'Envoyer le message').focus();
    await page.keyboard.press('Enter');
    const resume = page.locator('[data-resume]');
    await expect(resume).toBeFocused();
    await expect(resume.getByRole('button')).toHaveCount(2);
    await expect(page.getByLabel('Votre message')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#message-err')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Votre message')).toBeFocused();
    await page.keyboard.type('bonjour');
    await expect(page.locator('#message-err')).toBeHidden();
    await expect(page.getByLabel('Votre message')).not.toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: 'Non, merci' })).toBeChecked();
    await expect(resume).toBeHidden();
    // Le champ piège n'est ni vu, ni atteint au clavier.
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/^Votre nom/)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Confidentialité et vos droits' })).toBeFocused();
    expect(await enBase(page)).toHaveLength(0);
  });

  test('annuaire au clavier : nature aux flèches, retrait proposé, dialogue fermé par Échap, focus toujours visible @largeurs', async ({
    page,
  }) => {
    /** Le focus se voit : un anneau d'au moins 2 px sur l'élément, ou sur la ligne du choix qui porte la case. */
    const anneau = async () =>
      expect
        .poll(() =>
          page.evaluate(() => {
            const e = document.activeElement as HTMLElement | null;
            if (!e || e === document.body) return 'aucun focus';
            const cible = (e.closest('.f-option') as HTMLElement | null) ?? e;
            const s = getComputedStyle(cible);
            return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2
              ? 'visible'
              : `${e.tagName} sans anneau`;
          }),
        )
        .toBe('visible');
    await ouvrir(page, '/contribuer/?type=erreur&depuis=pied');
    const erreur = page.getByRole('radio', { name: /^Une fiche contient une erreur/ });
    const manque = page.getByRole('radio', { name: /^Une école manque/ });
    await expect(erreur).toBeChecked();
    await erreur.focus();
    // La nature se change aux flèches, comme tout groupe de cases rondes ; les champs suivent.
    await page.keyboard.press('ArrowUp');
    await expect(manque).toBeChecked();
    await expect(manque).toBeFocused();
    await anneau();
    await expect(page.getByLabel('Nom de l’école', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(erreur).toBeChecked();
    await expect(page.getByLabel('Nom de l’école concernée')).toBeVisible();
    await page.getByLabel('Nom de l’école concernée').focus();
    await page.keyboard.type('[Institut Exemple]');
    // Un numéro : la page propose le retrait, juste après les choix ; il s'ouvre au clavier et le focus va à la nature choisie.
    await page.getByRole('radio', { name: 'Téléphone ou contact' }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(bouton(page, 'Faire plutôt une demande de retrait')).toBeFocused();
    await anneau();
    await page.keyboard.press('Enter');
    const retrait = page.getByRole('radio', { name: /^Retirer une information/ });
    await expect(retrait).toBeChecked();
    await expect(retrait).toBeFocused();
    await anneau();
    await expect(page.getByLabel('Nom de l’école concernée')).toHaveValue('[Institut Exemple]');
    // Une page de plus de 7 jours : « Envoyer comme nouveau message » ouvre un dialogue, que la touche Échap ferme sans rien envoyer.
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill(NUMERO);
    // Le laissez-passer de CETTE demande (une clé par nature), obtenu avant que le temps passe.
    await expect.poll(() => brouillon(page, 'annuaire')).toContain('"retrait:":{"passe"');
    await regler(page, 'avance', String(7 * 24 * 60));
    await bouton(page, 'Envoyer la demande').focus();
    await page.keyboard.press('Enter');
    await expect(refus(page)).toBeFocused();
    const nouveau = bouton(page, 'Envoyer comme nouveau message');
    await nouveau.focus();
    await anneau();
    await page.keyboard.press('Enter');
    const dialogue = page.getByRole('dialog', { name: /nouveau message/ });
    await expect(dialogue).toBeVisible();
    await expect(
      dialogue.getByRole('button', { name: 'Oui, envoyer un nouveau message' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogue).toBeHidden();
    await expect(nouveau).toBeFocused();
    expect(await enBase(page)).toHaveLength(0);
    await expect(page.getByLabel('Nom de l’école concernée')).toHaveValue('[Institut Exemple]');
  });

  test('un texte trop long n’est pas coupé : il se dit ; une coordonnée incomplète aussi', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    const long = 'é'.repeat(2001);
    await page.getByLabel('Votre message').fill(long);
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill('06 12');
    await page.getByLabel('Votre numéro WhatsApp').blur();
    await expect(page.locator('#numero-err')).toContainText('semble incomplet');
    await envoyer(page);
    await expect(page.locator('#message-err')).toContainText('signes au plus');
    await expect(page.getByLabel('Votre message')).toHaveValue(long);
    // « Non, merci » : la coordonnée disparaît et ne part pas.
    await page.getByRole('radio', { name: 'Non, merci' }).check();
    await expect(page.getByLabel('Votre numéro WhatsApp')).toBeHidden();
    await page.getByLabel('Votre message').fill(TEXTE);
    await envoyer(page);
    await confirme(page, 'Message enregistré');
    expect((await enBase(page))[0]!.versions[0]!.contenu).not.toHaveProperty('coordonnee');
  });

  test('le champ piège rempli : la même confirmation, rangé avec les indésirables', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await page.locator('[data-piege]').evaluate((e: HTMLInputElement) => {
      e.value = 'robot';
    });
    await envoyer(page);
    await confirme(page, 'Message enregistré');
    expect((await enBase(page))[0]).toMatchObject({ etat: 'indesirable', alerte: null });
  });
});

test.describe('coupures et reprises', () => {
  test('effacer pendant un envoi ne perd ni le texte ni la clé de reprise', async ({ page }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await expect.poll(() => brouillon(page)).toContain('"passe"');
    await regler(page, 'latence', '600');
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await expect(page.locator('[data-envoyer]')).toHaveAttribute('aria-busy', 'true');
    const avant = JSON.parse((await brouillon(page))!);
    const effacer = bouton(page, 'Effacer ce que j’ai écrit');
    await expect(effacer).toBeDisabled();
    // Même un événement déjà en attente ne doit pas effacer l'enveloppe du vol.
    await effacer.dispatchEvent('click');
    await refuse(page, 'L’envoi n’est pas confirmé.');
    const apres = JSON.parse((await brouillon(page))!);
    expect(apres.enveloppes).toEqual(avant.enveloppes);
    await expect(effacer).toBeEnabled();
    await regler(page, 'envois', null);
    await bouton(page, 'Réessayer').click();
    await confirme(page, 'Message enregistré');
    expect(await enBase(page)).toHaveLength(1);
  });

  test('copier un retrait rappelle aussi ce qui doit être retiré, sans coordonnée', async ({
    page,
  }) => {
    await ouvrir(page, '/contribuer/?type=retrait');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (texte: string) => {
            document.documentElement.dataset.copie = texte;
          },
        },
      });
    });
    await regler(page, 'envois', 'fermes');
    await page.getByLabel('Nom de l’école concernée').fill('[École Exemple]');
    await page.getByRole('radio', { name: 'Un numéro de téléphone', exact: true }).check();
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill(NUMERO);
    await expect(refus(page)).toBeVisible();
    await bouton(page, 'Copier mon texte').click();
    const copie = await page.locator('html').getAttribute('data-copie');
    expect(copie).toContain('[École Exemple]');
    expect(copie).toContain('Un numéro de téléphone');
    expect(copie).not.toContain(NUMERO);
    expect(copie).not.toContain('242060000077');
  });

  test('double appui : un envoi en vol, une demande, une alerte', async ({ page }) => {
    await ouvrir(page, '/contact/');
    await regler(page, 'latence', '600');
    await ecrireUnMessage(page);
    const b = page.locator('[data-envoyer]');
    await b.click();
    await expect(b).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByLabel('Votre message')).toBeDisabled();
    await b.click({ force: true });
    await b.click({ force: true });
    await confirme(page, 'Message enregistré');
    expect(await enBase(page)).toHaveLength(1);
  });

  test('coupure avant réception : pas confirmé, jamais « pas parti », puis enregistré une fois', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'avant');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    expect(await refus(page).innerText()).not.toMatch(/pas parti|déjà enregistrée/);
    expect(await enBase(page)).toHaveLength(0);
    // Aucun renvoi automatique : le réseau revient, rien ne part sans un appui.
    await regler(page, 'envois', null);
    await page.waitForTimeout(800);
    expect(await enBase(page)).toHaveLength(0);
    await bouton(page, 'Réessayer').click();
    await confirme(page, 'Message enregistré');
    expect(await enBase(page)).toHaveLength(1);
  });

  test('coupure après réception : pas confirmé, puis la même référence, une seule demande', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    const [recu] = await enBase(page);
    expect(recu).toBeDefined();
    await regler(page, 'envois', null);
    await bouton(page, 'Réessayer').click();
    expect(await confirme(page, 'Message enregistré')).toBe(recu!.reference);
    const apres = await enBase(page);
    expect(apres).toHaveLength(1);
    expect(apres[0]!.versions).toHaveLength(1);
  });

  test('recharger avant confirmation : reprendre, avec la même clé ; ou effacer, d’un geste', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    await regler(page, 'envois', null);
    await page.reload();
    await pret(page);
    const reprise = page.locator('[data-reprise]');
    await expect(reprise.getByText('Son envoi n’était pas confirmé.')).toBeVisible();
    // Tant que la personne n'a pas choisi, rien ne s'écrit par-dessus.
    await expect(page.getByLabel('Votre message')).toBeHidden();
    expect(await brouillon(page)).toContain(TEXTE);
    await bouton(page, 'Reprendre').click();
    await refuse(page, 'L’envoi n’est pas confirmé.');
    await bouton(page, 'Réessayer').click();
    await confirme(page, 'Message enregistré');
    expect(await enBase(page)).toHaveLength(1);

    await bouton(page, 'Écrire un autre message').click();
    await expect(page.getByLabel('Votre message')).toHaveValue('');
    await ecrireUnMessage(page, 'un autre texte');
    await page.reload();
    await pret(page);
    await expect(page.locator('[data-reprise-attente]')).toBeHidden();
    await bouton(page, 'Effacer et recommencer').click();
    await expect(page.getByLabel('Votre message')).toHaveValue('');
    expect(await brouillon(page)).toBeNull();
  });

  test('texte modifié avant l’ouverture : la même référence, la dernière version', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    await regler(page, 'envois', null);
    await page.getByLabel('Votre message').fill('texte corrigé');
    await bouton(page, 'Réessayer').click();
    const reference = await confirme(page, 'Message enregistré');
    await expect(confirmation(page)).toContainText('remplace le précédent');
    const [m] = await enBase(page);
    expect(m).toMatchObject({ reference });
    expect(m!.versions.map((v) => [v.revision, v.courante])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  test('texte modifié après l’ouverture : une suite reliée, deux références, le texte lu ne change pas', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    await regler(page, 'envois', null);
    const [lu] = await enBase(page);
    const admin = await context.newPage();
    await administration(admin, `/${lu!.reference}`);
    await expect(admin.getByRole('article')).toContainText(TEXTE);
    await page.getByLabel('Votre message').fill('la suite du texte');
    await bouton(page, 'Réessayer').click();
    const suite = await confirme(page, 'Votre ajout est enregistré');
    expect(suite).not.toBe(lu!.reference);
    await expect(page.locator('[data-ok-precedente]')).toHaveText(lu!.reference);
    const base = await enBase(page);
    expect(base).toHaveLength(2);
    expect(base.find((m) => m.reference === suite)?.suiteDe).toBe(lu!.reference);
    expect(base.find((m) => m.reference === lu!.reference)?.versions).toHaveLength(1);
  });

  test('un onglet ancien : son texte est gardé, sans prétendre remplacer le plus récent', async ({
    page,
    context,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page, 'premier texte');
    await regler(page, 'envois', 'avant');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.', 'premier texte');
    // La fenêtre dupliquée porte la même clé et la même révision.
    const copie = await brouillon(page);
    const ancien = await context.newPage();
    await ancien.addInitScript(
      (b) => sessionStorage.setItem('ntanova-brouillon-contact', b!),
      copie,
    );
    await regler(page, 'envois', null);
    await page.getByLabel('Votre message').fill('texte plus récent');
    await bouton(page, 'Réessayer').click();
    const reference = await confirme(page, 'Message enregistré');
    await ouvrir(ancien, '/contact/');
    await bouton(ancien, 'Reprendre').click();
    await bouton(ancien, 'Réessayer').click();
    expect(await confirme(ancien, 'Ce texte est gardé, sans remplacer le plus récent')).toBe(
      reference,
    );
    const [m] = await enBase(page);
    expect(m!.versions.find((v) => v.courante)?.contenu.message).toBe('texte plus récent');
    expect(m!.versions.find((v) => v.tardive)?.contenu.message).toBe('premier texte');
  });

  test('changer de nature garde le texte non confirmé et sa clé ; y revenir n’en crée pas un second', async ({
    page,
  }) => {
    await ouvrir(page, '/contribuer/?type=erreur&depuis=pied');
    await page.getByLabel('Nom de l’école concernée').fill('[Institut Exemple]');
    await page.getByRole('radio', { name: 'Frais', exact: true }).check();
    await page.getByLabel(/^Qu’est-ce qui est faux/).fill(TEXTE);
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill(NUMERO);
    await regler(page, 'envois', 'apres');
    await bouton(page, 'Envoyer le signalement').click();
    await expect(refus(page)).toBeVisible();
    await regler(page, 'envois', null);

    await page.getByRole('radio', { name: /^Retirer une information/ }).check();
    await expect(refus(page)).toBeHidden();
    await page.getByRole('radio', { name: 'Une photo', exact: true }).check();
    await bouton(page, 'Envoyer la demande').click();
    await confirme(page, 'Demande de retrait enregistrée');
    // Le premier texte n'est ni effacé ni oublié : la page le dit, même après un rechargement.
    await expect(page.locator('[data-autre-attente]')).toBeVisible();
    await page.reload();
    await pret(page);
    await bouton(page, 'Reprendre').click();
    await expect(page.getByLabel(/^Qu’est-ce qui est faux/)).toHaveValue(TEXTE);
    await bouton(page, 'Réessayer').click();
    await confirme(page, 'Signalement enregistré');
    const base = await enBase(page);
    expect(base.map((m) => m.nature).sort()).toEqual(['erreur', 'retrait']);
    expect(new Set(base.map((m) => m.envoi?.cle)).size).toBe(2);
    expect(await brouillon(page, 'annuaire')).toBeNull();
  });

  test('un brouillon de plus de 24 h est effacé, sans proposer de le reprendre', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await page.evaluate(() => {
      const cle = 'ntanova-brouillon-contact';
      const b = JSON.parse(sessionStorage.getItem(cle)!) as { ecritLe: number };
      b.ecritLe -= 24 * 3600 * 1000;
      sessionStorage.setItem(cle, JSON.stringify(b));
    });
    await page.reload();
    await pret(page);
    await expect(page.locator('[data-reprise]')).toBeHidden();
    await expect(page.getByLabel('Votre message')).toHaveValue('');
    expect(await brouillon(page)).toBeNull();
  });
});

test.describe('chaque refus garde la saisie', () => {
  for (const [panne, titre, gestesAttendus] of [
    ['plafond', 'L’envoi n’est pas enregistré.', ['Réessayer', 'Copier mon texte']],
    ['trop', 'L’envoi n’est pas enregistré.', ['Réessayer', 'Copier mon texte']],
    ['illisible', 'L’envoi n’est pas confirmé.', ['Réessayer']],
    ['sans-passe', 'L’envoi n’est pas confirmé.', ['Réessayer']],
  ] as const) {
    test(`${panne} : dit, rien d’écrit, WhatsApp proposé, réessayer fonctionne`, async ({
      page,
    }) => {
      await ouvrir(page, '/contact/');
      await regler(page, 'envois', panne);
      await ecrireUnMessage(page);
      await envoyer(page);
      await refuse(page, titre);
      for (const g of gestesAttendus)
        await expect(refus(page).getByRole('button', { name: g })).toBeVisible();
      const wa = refus(page).getByRole('link', { name: 'Écrire sur WhatsApp' });
      expect(decodeURIComponent((await wa.getAttribute('href')) ?? '')).not.toContain(TEXTE);
      if (panne !== 'illisible') expect(await enBase(page)).toHaveLength(0);
      await regler(page, 'envois', null);
      await bouton(page, 'Réessayer').click();
      await confirme(page, 'Message enregistré');
      expect(await enBase(page)).toHaveLength(1);
    });
  }

  test('envois fermés : reconnu dès les premiers mots, texte gardé, une autre voie, aucune reprise sans fin', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ouvrir(page, '/contact/');
    await regler(page, 'envois', 'fermes');
    await page.getByLabel('Votre message').fill(TEXTE);
    await expect(refus(page).getByRole('heading')).toHaveText(
      'Ce formulaire ne reçoit pas encore d’envois.',
    );
    // Dit sans voler le focus à la personne qui écrit.
    await expect(refus(page)).not.toBeFocused();
    await page.getByRole('radio', { name: 'Non, merci' }).check();
    await expect(refus(page).getByRole('button', { name: 'Réessayer' })).toBeHidden();
    await expect(page.locator('[data-envoyer]')).toBeHidden();
    await expect(refus(page).getByRole('link', { name: 'Écrire sur WhatsApp' })).toBeVisible();
    await bouton(page, 'Copier mon texte').click();
    await expect(page.locator('[data-copie]')).toHaveText('Texte copié.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(TEXTE);
    expect(await brouillon(page)).toContain(TEXTE);
    expect(await enBase(page)).toHaveLength(0);
  });

  test('page de plus de 7 jours, rien de reçu : « nouveau message » demande une confirmation et une clé neuve', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await expect.poll(() => brouillon(page)).toContain('sceau-de-');
    const vieux = JSON.parse((await brouillon(page))!) as {
      enveloppes: Record<string, { passe: { cle: string } }>;
    };
    await regler(page, 'avance', String(7 * 24 * 60));
    await envoyer(page);
    await refuse(page, 'Cette page est trop ancienne pour envoyer.');
    await expect(page.locator('[data-refus-enregistree]')).toBeHidden();
    await expect(refus(page).getByRole('button', { name: 'Réessayer' })).toBeHidden();
    expect(await enBase(page)).toHaveLength(0);
    await bouton(page, 'Envoyer comme nouveau message').click();
    const dialogue = page.getByRole('dialog', { name: /nouveau message/ });
    await expect(dialogue).toBeVisible();
    await dialogue.getByRole('button', { name: 'Annuler' }).click();
    expect(await enBase(page)).toHaveLength(0);
    await bouton(page, 'Envoyer comme nouveau message').click();
    await dialogue.getByRole('button', { name: 'Oui, envoyer un nouveau message' }).click();
    await confirme(page, 'Message enregistré');
    const base = await enBase(page);
    expect(base).toHaveLength(1);
    expect(base[0]!.envoi?.cle).not.toBe(vieux.enveloppes['contact:']!.passe.cle);
  });

  test('page de plus de 7 jours, déjà reçue : identique, la même référence ; modifiée, refusée avec la référence', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    const [recu] = await enBase(page);
    await regler(page, 'envois', null);
    await regler(page, 'avance', String(8 * 24 * 60));
    await page.getByLabel('Votre message').fill('modifié');
    await bouton(page, 'Réessayer').click();
    await refuse(page, 'Ce texte n’est pas enregistré.', 'modifié');
    await expect(page.locator('[data-refus-reference]')).toHaveText(recu!.reference);
    expect((await enBase(page))[0]!.versions).toHaveLength(1);
    await page.reload();
    await pret(page);
    await bouton(page, 'Reprendre').click();
    await page.getByLabel('Votre message').fill(TEXTE);
    await page.locator('[data-envoyer]').click();
    expect(await confirme(page, 'Message enregistré')).toBe(recu!.reference);
    expect(await enBase(page)).toHaveLength(1);
  });

  test('message purgé depuis : la vieille page ne le recrée pas', async ({ page }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    await refuse(page, 'L’envoi n’est pas confirmé.');
    await regler(page, 'envois', null);
    await page.evaluate((cle) => localStorage.removeItem(cle), CLE_BASE);
    await regler(page, 'avance', String(30 * 24 * 60));
    await bouton(page, 'Réessayer').click();
    await refuse(page, 'Cette page est trop ancienne pour envoyer.');
    expect(await enBase(page)).toHaveLength(0);
  });

  test('trop de modifications : le dernier texte n’est pas enregistré, la référence l’est', async ({
    page,
  }) => {
    await ouvrir(page, '/contact/');
    await ecrireUnMessage(page, 'texte 1');
    await regler(page, 'envois', 'apres');
    await envoyer(page);
    for (let i = 2; i <= 8; i++) {
      await expect(refus(page)).toBeVisible();
      await page.getByLabel('Votre message').fill(`texte ${i}`);
      await bouton(page, 'Réessayer').click();
      await expect.poll(async () => (await enBase(page))[0]?.versions.length).toBe(i);
    }
    await regler(page, 'envois', null);
    await page.getByLabel('Votre message').fill('texte 9');
    await bouton(page, 'Réessayer').click();
    await refuse(page, 'Ce dernier texte n’est pas enregistré.', 'texte 9');
    const [m] = await enBase(page);
    await expect(page.locator('[data-refus-reference]')).toHaveText(m!.reference);
    expect(m!.limiteLe).not.toBeNull();
    expect(JSON.stringify(m!.versions)).not.toContain('texte 9');
  });

  test('fiche retirée depuis : son nom se demande, tout le reste est gardé, la clé aussi', async ({
    page,
  }) => {
    await ouvrir(page, '/contribuer/?type=erreur&ecole=482913&depuis=fiche');
    await expect(page.locator('[data-fiche-choisie]')).toBeVisible();
    await page.getByRole('radio', { name: 'Frais', exact: true }).check();
    await page.getByLabel(/^Qu’est-ce qui est faux/).fill(TEXTE);
    await page.getByRole('radio', { name: 'Non, merci' }).check();
    await regler(page, 'fiches-retirees', '20000000-0000-4000-8000-000000000001');
    await bouton(page, 'Envoyer le signalement').click();
    await expect(refus(page).getByRole('heading')).toHaveText('Cette fiche n’est plus publiée.');
    const nom = page.getByLabel('Nom de l’école concernée');
    await expect(nom).toBeFocused();
    await expect(page.locator('[data-fiche-choisie]')).toBeHidden();
    await expect(page.getByLabel(/^Qu’est-ce qui est faux/)).toHaveValue(TEXTE);
    expect(await enBase(page)).toHaveLength(0);
    await nom.fill('[Complexe scolaire]');
    await bouton(page, 'Envoyer le signalement').click();
    await confirme(page, 'Signalement enregistré');
    expect((await enBase(page))[0]!.versions[0]!.contenu).toMatchObject({
      nomEcole: '[Complexe scolaire]',
      correction: TEXTE,
    });
  });

  test('un numéro de fiche inconnu ou fabriqué : le nom se demande, aucune fiche privée révélée', async ({
    page,
  }) => {
    for (const ecole of ['999999', '../482913', 'abc']) {
      await ouvrir(
        page,
        `/contribuer/?type=erreur&ecole=${encodeURIComponent(ecole)}&depuis=fiche`,
      );
      await expect(page.getByLabel('Nom de l’école concernée')).toBeVisible();
      await expect(page.locator('[data-fiche-choisie]')).toBeHidden();
    }
  });
});

test.describe('ce que la page ne fait jamais', () => {
  test('stockage refusé : l’envoi marche, et la limite est dite', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        get() {
          throw new DOMException('refusé', 'SecurityError');
        },
      });
    });
    await ouvrir(page, '/contact/');
    await expect(page.getByText('Ce navigateur ne garde pas votre texte')).toBeVisible();
    await expect(page.getByText('Votre texte reste dans cet onglet')).toBeHidden();
    await ecrireUnMessage(page);
    await envoyer(page);
    await confirme(page, 'Message enregistré');
  });

  test('rien d’écrit dans une adresse, une requête, un journal, un cookie ou localStorage', async ({
    page,
    context,
  }) => {
    const prive = [TEXTE, NUMERO, '242060000077', 'Prénom Exemple'];
    const vus: string[] = [];
    page.on('request', (r) => vus.push(`${r.url()} ${r.postData() ?? ''}`));
    page.on('console', (m) => vus.push(m.text()));
    page.on('framenavigated', (f) => vus.push(f.url()));
    await ouvrir(page, '/contact/?sujet=site&depuis=pied');
    await page.getByLabel('Votre message').fill(TEXTE);
    await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
    await page.getByLabel('Votre numéro WhatsApp').fill(NUMERO);
    await page.getByLabel(/^Votre nom/).fill('Prénom Exemple');
    await regler(page, 'envois', 'avant');
    await envoyer(page);
    await refuse2(page);
    await page.getByRole('link', { name: 'Confidentialité et vos droits' }).click();
    await page.goBack();
    await pret(page);
    for (const p of prive) {
      expect(vus.join('\n')).not.toContain(p);
      expect(vus.join('\n')).not.toContain(encodeURIComponent(p));
      expect(page.url()).not.toContain(p);
    }
    const ailleurs = await page.evaluate(() =>
      JSON.stringify(
        Object.entries(localStorage).filter(([cle]) => cle !== 'ntanova-faux-messages'),
      ),
    );
    for (const p of prive) expect(ailleurs).not.toContain(p);
    expect(await context.cookies()).toEqual([]);
  });

  test('sans JavaScript : aucun formulaire trompeur, la page l’explique et propose WhatsApp', async ({
    browser,
  }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false });
    const page = await contexte.newPage();
    for (const adresse of ['/contact/', '/contribuer/']) {
      await page.goto(adresse);
      await expect(page.locator('form[data-form]')).toBeHidden();
      await expect(page.getByText(/s’ouvre avec JavaScript/)).toBeVisible();
      await expect(
        page.locator('[data-sans-script]').getByRole('link', { name: 'Écrire sur WhatsApp' }),
      ).toBeVisible();
      await expect(page.locator('[data-confirmation]')).toBeHidden();
      await expect(page.locator('[data-refus]')).toBeHidden();
    }
    await contexte.close();
  });

  test('réglage fermé : aucun lien public vers les formulaires, « noindex », ni plan ni llms.txt', async ({
    page,
    request,
  }) => {
    const plan = await (await request.get('/sitemap.xml')).text();
    const llms = await (await request.get('/llms.txt')).text();
    for (const nom of ['/contact/', '/contribuer/']) {
      expect(plan).not.toContain(nom);
      expect(llms).not.toContain(nom);
      await page.goto(nom);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    }
    for (const adresse of [
      '/',
      '/ecoles/',
      '/ecoles/pointe-noire/',
      '/ecoles/complexe-scolaire-exemple-482913/',
      '/pour-les-ecoles/',
      '/pour-les-ecoles/outils/',
      '/methode/',
      '/confidentialite/',
    ]) {
      await page.goto(adresse);
      await expect(page.locator('a[href*="/contact/"], a[href*="/contribuer/"]')).toHaveCount(0);
      await expect(
        page.locator('footer').getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' }),
      ).toBeVisible();
    }
  });

  test('aucun débordement, des cibles de 44 px, dans chaque état @largeurs', async ({ page }) => {
    test.setTimeout(60_000);
    const controler = async (etat: string) => {
      const mesure = await page.evaluate(() => {
        const cibles = [
          ...document.querySelectorAll<HTMLElement>(
            'main a, main button, main .f-option, main select, main input.champ, main textarea',
          ),
        ].filter((e) => e.getClientRects().length > 0);
        return {
          deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          petites: cibles
            .filter((e) => e.getBoundingClientRect().height < 43.5)
            .map((e) => e.textContent?.trim().slice(0, 40) ?? e.tagName),
        };
      });
      expect(mesure, etat).toEqual({ deborde: false, petites: [] });
    };
    await ouvrir(page, '/contact/');
    await controler('contact, vide');
    await envoyer(page);
    await expect(page.locator('[data-resume]')).toBeVisible();
    await controler('contact, erreurs');
    await ecrireUnMessage(page);
    await regler(page, 'envois', 'plafond');
    await envoyer(page);
    // Attendre le refus : mesurer avant mesurait l'état d'avant, et recharger pendant l'envoi laissait (à juste titre) un envoi
    // « pas confirmé » à reprendre, qui cache le bouton d'envoi (constaté sous charge, lot 3C).
    await expect(refus(page).getByRole('heading')).toHaveText('L’envoi n’est pas enregistré.');
    await controler('contact, refus');
    await page.reload();
    await pret(page);
    await controler('contact, reprise');
    await regler(page, 'envois', null);
    await bouton(page, 'Reprendre').click();
    await page.locator('[data-envoyer]').click();
    await confirme(page, 'Message enregistré');
    await controler('contact, enregistré');
    // Une adresse sans espace, plus longue que la ligne d'un téléphone : rappelée masquée, elle passe à la ligne, jamais hors de
    // l'écran (constaté sur les captures du lot 3C).
    await bouton(page, 'Écrire un autre message').click();
    await page.getByLabel('Votre message').fill(TEXTE);
    await page.getByRole('radio', { name: 'Oui, par e-mail' }).check();
    await page
      .getByLabel('Votre adresse e-mail')
      .fill('prenom@undomainevraimenttreslongpouruneseulelignedetelephone.test');
    await envoyer(page);
    await confirme(page, 'Message enregistré');
    await controler('contact, enregistré, adresse longue');
    for (const type of ['', '?type=manque', '?type=erreur&ecole=482913', '?type=retrait']) {
      await ouvrir(page, `/contribuer/${type}`);
      if (type.includes('ecole')) await expect(page.locator('[data-fiche-choisie]')).toBeVisible();
      await controler(`annuaire ${type}`);
    }
  });
});

/** Un refus sur un envoi qui demande une réponse : la saisie entière est encore là. */
async function refuse2(page: Page) {
  await expect(refus(page)).toBeVisible();
  await expect(page.getByLabel('Votre message')).toHaveValue(TEXTE);
  await expect(page.getByLabel('Votre numéro WhatsApp')).toHaveValue(NUMERO);
  await expect(page.getByLabel(/^Votre nom/)).toHaveValue('Prénom Exemple');
}
