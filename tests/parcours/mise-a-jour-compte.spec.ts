import { expect, test } from '@playwright/test';
import { seConnecter } from './aides';

// La base du téléphone passe de la version 3 à la version 4 (ticket #55, PR 6) : chaque fiche est liée au compte qui
// l'a commencée. Un téléphone qui a des fiches le jour de la mise à jour ne perd rien :
//   - les fiches d'avant, sans compte, prennent le compte gardé dans le téléphone ;
//   - le brouillon se retrouve d'après la fiche (l'ancien repère « brouillon » n'a plus d'objet et disparaît) ;
//   - la fiche à envoyer part, sous le même compte.

test.use({ permissions: ['geolocation'] });

/** Une fiche telle que la version 3 la gardait : sans `compteId`. */
const ficheDAvant = (id: string, etat: 'brouillon' | 'a_envoyer', nomEnseigne: string) => ({
  id,
  creeeLe: new Date().toISOString(),
  type: 'releve',
  corrigeReleveId: null,
  lotId: null,
  photos: [],
  position: null,
  precisionM: null,
  prisLe: null,
  horsLot: null,
  doublonPropose: null,
  reponseDoublon: null,
  nomEnseigne,
  niveaux: [],
  typeEcole: 'non_indique',
  programme: '',
  programmesVus: '',
  programmesEnPhoto: false,
  repere: '',
  numeroEnseigne: '',
  direction: 'absente',
  contact: null,
  repasser: '',
  etat,
  envoyes: { releve: false, photo: true, contact: true },
  dernierEssai: null,
});

test('les fiches et le brouillon d’avant la mise à jour prennent le compte du téléphone, et la fiche à envoyer part', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 25_000 });

  // Le compte que le téléphone a gardé : la mise à jour le reprend pour les fiches d'avant.
  const profil = await page.evaluate(
    () =>
      new Promise<{ id: string }>((ok, ko) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => ko(ouverture.error);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result
            .transaction('memoire')
            .objectStore('memoire')
            .get('profil');
          lecture.onsuccess = () => {
            ouverture.result.close();
            ok((lecture.result as { valeur: { id: string } }).valeur);
          };
        };
      }),
  );
  expect(profil.id).toBeTruthy();

  // L'ancienne application s'arrête ; sa base reste, telle qu'elle était à la version 3.
  await page.close();
  const telephone = await context.newPage();
  await telephone.goto('/a-propos/');
  await telephone.evaluate(
    async ({ profil, brouillon, aEnvoyer }) => {
      await new Promise<void>((ok, ko) => {
        const effacement = indexedDB.deleteDatabase('ntanova-relais');
        effacement.onsuccess = () => ok();
        effacement.onerror = () => ko(effacement.error);
        effacement.onblocked = () => ko(new Error('la base du téléphone est encore ouverte'));
      });
      // Dexie compte ses versions par dizaines : 3 → 30.
      const base = await new Promise<IDBDatabase>((ok, ko) => {
        const ouverture = indexedDB.open('ntanova-relais', 30);
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
        const ecriture = base.transaction(['fiches', 'memoire'], 'readwrite');
        ecriture.objectStore('memoire').put({ cle: 'profil', valeur: profil });
        // L'ancien repère du brouillon, qui n'existe plus à la version 4.
        ecriture.objectStore('memoire').put({ cle: 'brouillon', valeur: brouillon.id });
        ecriture.objectStore('fiches').put(brouillon);
        ecriture.objectStore('fiches').put(aEnvoyer);
        ecriture.oncomplete = () => ok();
        ecriture.onerror = () => ko(ecriture.error);
      });
      base.close();
    },
    {
      profil,
      brouillon: ficheDAvant('fiche-brouillon-d-avant', 'brouillon', '[École du brouillon]'),
      aEnvoyer: ficheDAvant('fiche-a-envoyer-d-avant', 'a_envoyer', '[École d’avant]'),
    },
  );

  // La nouvelle application ouvre la base, la met à jour, reprend le brouillon et envoie la fiche.
  await telephone.goto('/relais/');
  await expect(telephone.getByText('Tout est envoyé.')).toBeVisible({ timeout: 25_000 });
  await expect(
    telephone.getByRole('button', { name: 'Reprendre la fiche en cours' }),
  ).toBeVisible();

  const apres = await telephone.evaluate(
    () =>
      new Promise<{ comptes: (string | null)[]; repereDuBrouillon: unknown; envoyees: string[] }>(
        (ok, ko) => {
          const ouverture = indexedDB.open('ntanova-relais');
          ouverture.onerror = () => ko(ouverture.error);
          ouverture.onsuccess = () => {
            const base = ouverture.result;
            const lecture = base.transaction(['fiches', 'memoire']);
            const fiches = lecture.objectStore('fiches').getAll();
            const repere = lecture.objectStore('memoire').get('brouillon');
            lecture.oncomplete = () => {
              base.close();
              const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
                releves?: Record<string, { nomEnseigne: string }>;
              };
              ok({
                comptes: (fiches.result as { compteId?: string | null }[]).map(
                  (f) => f.compteId ?? null,
                ),
                repereDuBrouillon: repere.result,
                envoyees: Object.values(etat.releves ?? {}).map((r) => r.nomEnseigne),
              });
            };
          };
        },
      ),
  );
  // Les deux fiches d'avant sont au compte du téléphone ; l'ancien repère a disparu ; seule la fiche à envoyer est partie.
  expect(apres.comptes).toEqual([profil.id, profil.id]);
  expect(apres.repereDuBrouillon).toBeUndefined();
  expect(apres.envoyees).toEqual(['[École d’avant]']);
});
