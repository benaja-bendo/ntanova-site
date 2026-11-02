import { expect, test } from '@playwright/test';
import { ajouterUneEcole, seConnecter } from './aides';

// Un téléphone qui a des fiches en attente le jour où l'application change : rien ne se perd. La base du téléphone passe
// de la version 2 (une photo par fiche) à la version 3 (jusqu'à quatre photos, des séries ou filières) ; une fiche d'avant,
// encore à envoyer, garde sa photo, qui devient la photo d'enseigne, et part comme les autres.

test.use({ permissions: ['geolocation'] });

const CLE_DE_PASSAGE = 'test-fiche-d-avant-la-mise-a-jour';

test('une fiche faite avant la mise à jour, avec sa photo unique, part quand le téléphone passe à la nouvelle version', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
  ).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Une fiche faite sans réseau : elle attend dans le téléphone.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
  await ajouterUneEcole(page, 1);
  await expect(page.getByText('1 fiche attend le réseau.')).toBeVisible();

  // On la ramène à la forme d'avant : une seule photo (`photo`), ni séries ni filières.
  const avant = await page.evaluate(async (cle) => {
    const base = await new Promise<IDBDatabase>((ok, ko) => {
      const ouverture = indexedDB.open('ntanova-relais');
      ouverture.onsuccess = () => ok(ouverture.result);
      ouverture.onerror = () => ko(ouverture.error);
    });
    const fiches = await new Promise<Record<string, unknown>[]>((ok, ko) => {
      const lecture = base.transaction('fiches').objectStore('fiches').getAll();
      lecture.onsuccess = () => ok(lecture.result as Record<string, unknown>[]);
      lecture.onerror = () => ko(lecture.error);
    });
    base.close();
    const fiche = fiches[0];
    const photos = fiche?.['photos'] as { blob: Blob; role: string }[] | undefined;
    if (!fiche || !photos?.[0]?.blob) throw new Error('la fiche ou sa photo manque');
    const blob = photos[0].blob;
    const adresse = await new Promise<string>((ok) => {
      const lecteur = new FileReader();
      lecteur.onload = () => ok(String(lecteur.result));
      lecteur.readAsDataURL(blob);
    });
    const { photos: _photos, programmesVus: _vus, programmesEnPhoto: _enPhoto, ...reste } = fiche;
    void _photos;
    void _vus;
    void _enPhoto;
    localStorage.setItem(cle, JSON.stringify({ ...reste, adressePhoto: adresse }));
    return { nombre: fiches.length, role: photos[0].role, octets: blob.size };
  }, CLE_DE_PASSAGE);
  expect(avant).toMatchObject({ nombre: 1, role: 'signboard' });
  expect(avant.octets).toBeGreaterThan(0);

  // Le téléphone se met à jour : l'ancienne application s'arrête, le réseau revient.
  await page.close();
  await context.setOffline(false);
  const telephone = await context.newPage();
  await telephone.goto('/a-propos/');
  await telephone.evaluate(async (cle) => {
    const brute = localStorage.getItem(cle);
    if (!brute) throw new Error('la fiche d’avant manque');
    localStorage.removeItem(cle);
    const { adressePhoto, ...fiche } = JSON.parse(brute) as Record<string, unknown> & {
      adressePhoto: string;
    };
    const photo = await (await fetch(adressePhoto)).blob();
    await new Promise<void>((ok, ko) => {
      const effacement = indexedDB.deleteDatabase('ntanova-relais');
      effacement.onsuccess = () => ok();
      effacement.onerror = () => ko(effacement.error);
      effacement.onblocked = () => ko(new Error('la base du téléphone est encore ouverte'));
    });
    // Une base de la version 2 de l'application (Dexie compte ses versions par dizaines : 2 → 20).
    const base = await new Promise<IDBDatabase>((ok, ko) => {
      const ouverture = indexedDB.open('ntanova-relais', 20);
      ouverture.onupgradeneeded = () => {
        const nouvelle = ouverture.result;
        const fiches = nouvelle.createObjectStore('fiches', { keyPath: 'id' });
        for (const index of ['etat', 'creeeLe', 'type']) fiches.createIndex(index, index);
        nouvelle.createObjectStore('memoire', { keyPath: 'cle' });
        nouvelle.createObjectStore('erreurs', { keyPath: 'id' });
      };
      ouverture.onsuccess = () => ok(ouverture.result);
      ouverture.onerror = () => ko(ouverture.error);
    });
    await new Promise<void>((ok, ko) => {
      const ecriture = base.transaction('fiches', 'readwrite');
      ecriture.objectStore('fiches').put({ ...fiche, photo });
      ecriture.oncomplete = () => ok();
      ecriture.onerror = () => ko(ecriture.error);
    });
    base.close();
  }, CLE_DE_PASSAGE);

  // La nouvelle application ouvre la base, la met à jour, et envoie la fiche avec sa photo, comme une fiche d'aujourd'hui.
  await telephone.goto('/relais/');
  await expect(telephone.getByText('Tout est envoyé.')).toBeVisible({ timeout: 25_000 });
  const recu = await telephone.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves?: Record<string, { nomEnseigne: string }>;
      photos?: Record<string, { role: string; octets: number }>;
      contacts?: Record<string, unknown>;
    };
    return {
      releves: Object.values(etat.releves ?? {}).map((r) => r.nomEnseigne),
      photos: Object.values(etat.photos ?? {}).map((p) => p.role),
      contacts: Object.keys(etat.contacts ?? {}).length,
    };
  });
  expect(recu).toEqual({ releves: ['[École 1]'], photos: ['signboard'], contacts: 1 });
});
