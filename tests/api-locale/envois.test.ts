// L'adaptateur public contre la VRAIE API locale (refonte, lot 3C) : `pnpm base:demarrer`, les migrations de la branche, puis
// `pnpm test:api-locale`. À la main, jamais dans la CI. Données inventées, retirées à la fin ; les envois sont rouverts puis
// refermés dans la base locale seulement : l'adresse est lue de la pile locale, et refusée si elle n'est pas 127.0.0.1.
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creerPortDemandes } from '../../src/infra/supabase/demandes-publiques';
import type { Contenu, Issue, Nature } from '../../src/modele/demandes';
import type { LaissezPasser, PortDemandes } from '../../src/modele/envoi-public';

const CONTENEUR = 'supabase_db_ntanova-site';
const sql = (requete: string): string =>
  execFileSync(
    'docker',
    ['exec', CONTENEUR, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', requete],
    { encoding: 'utf8' },
  ).trim();

let url = '';
let cle = '';
let port: PortDemandes;
const references: string[] = [];
let fiche = '';

beforeAll(() => {
  const etat = JSON.parse(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as { API_URL: string; PUBLISHABLE_KEY: string };
  url = etat.API_URL;
  cle = etat.PUBLISHABLE_KEY;
  if (new URL(url).hostname !== '127.0.0.1') throw new Error('Pile locale seulement.');
  if (sql('select count(*) from prive.public_request_secrets') !== '0') {
    throw new Error('La base locale a déjà un secret d’envoi : cet essai part d’une base fermée.');
  }
  port = creerPortDemandes(url, cle);
});
afterAll(() => {
  if (!url) return;
  if (references.length > 0) {
    const liste = references.map((r) => `'${r}'`).join(',');
    sql(`delete from prive.public_requests where reference in (${liste})`);
  }
  sql('delete from prive.public_request_secrets');
  sql('delete from prive.public_request_counters');
  expect(sql('select count(*) from prive.public_requests')).toBe('0');
});

async function passe(): Promise<LaissezPasser> {
  const r = await port.demanderLaissezPasser();
  if (r.genre !== 'accorde') throw new Error(r.genre);
  return r.passe;
}
async function envoyer(
  p: LaissezPasser,
  nature: Nature,
  contenu: Contenu,
  revision = 1,
  piege = '',
): Promise<Issue> {
  const i = await port.envoyer({ passe: p, revision, nature, contenu, piege });
  if (i.genre === 'enregistre' && !references.includes(i.reference)) references.push(i.reference);
  return i;
}
const contact = (message: string): Contenu => ({ origine: 'pied', message, reponse: 'non' });
const brut = (fonction: string, init: RequestInit) =>
  fetch(`${url}/rest/v1/rpc/${fonction}`, {
    ...init,
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
  });

describe('envois fermés', () => {
  it('la pile locale rend 55000 ; l’adaptateur le reconnaît, quel que soit le numéro HTTP', async () => {
    const r = await brut('issue_public_request_pass', { method: 'POST', body: '{}' });
    const corps = (await r.json()) as { code?: string };
    console.info(`Fermé : HTTP ${r.status}, code ${corps.code}`);
    expect(corps.code).toBe('55000');
    expect(r.ok).toBe(false);
    expect(await port.demanderLaissezPasser()).toEqual({ genre: 'ferme' });
  });
  it('un laissez-passer fabriqué n’écrit rien', async () => {
    const faux = { cle: crypto.randomUUID(), emisLe: 1795500000, sceau: 'a'.repeat(64) };
    expect(await envoyer(faux, 'contact', contact('a'))).toMatchObject({ code: 'expiree' });
    expect(sql('select count(*) from prive.public_requests')).toBe('0');
  });
});

describe('envois ouverts, dans la base locale seulement', () => {
  beforeAll(() => {
    sql('select prive.renew_public_request_secret()');
  });

  it('les quatre natures arrivent dans la boîte, sous les noms de la base', async () => {
    const cas: [Nature, Contenu, RegExp][] = [
      ['contact', { ...contact('[message inventé]'), sujet: 'autre' }, /^C-/],
      [
        'absente',
        {
          origine: 'ecoles',
          nomEcole: '[École]',
          ville: '[Ville]',
          repere: '[repère]',
          autreChose: '[détail]',
          niveaux: ['P', 'C'],
          deLEcole: true,
          reponse: 'non',
        },
        /^A-/,
      ],
      [
        'erreur',
        {
          origine: 'pied',
          nomEcole: '[École]',
          information: 'frais',
          correction: '[juste]',
          source: 'document',
          reponse: 'email',
          coordonnee: 'prenom@exemple.test',
          nomPersonne: '[Prénom]',
        },
        /^A-/,
      ],
      [
        'retrait',
        {
          origine: 'confidentialite',
          nomEcole: '[École]',
          aRetirer: 'tel',
          precision: '[où]',
          reponse: 'whatsapp',
          coordonnee: '242060000077',
        },
        /^R-/,
      ],
    ];
    for (const [nature, contenu, forme] of cas) {
      const i = await envoyer(await passe(), nature, contenu);
      expect(i, nature).toMatchObject({ genre: 'enregistre', code: 'enregistree' });
      expect(i.genre === 'enregistre' && i.reference).toMatch(forme);
    }
    expect(sql('select count(*) from prive.public_request_notices')).toBe('4');
  });

  it('répétition, modification, ancien texte, suite : les codes de la base, lus par le modèle', async () => {
    const p = await passe();
    const un = await envoyer(p, 'contact', contact('texte 1'));
    const reference = un.genre === 'enregistre' ? un.reference : '';
    expect(await envoyer(p, 'contact', contact('texte 1'))).toMatchObject({
      code: 'deja_enregistree',
      reference,
    });
    expect(await envoyer(p, 'contact', contact('texte 3'), 3)).toMatchObject({
      code: 'mise_a_jour',
      reference,
    });
    expect(await envoyer(p, 'contact', contact('texte 2'), 2)).toMatchObject({
      code: 'version_ancienne',
      reference,
    });
    sql(
      `update prive.public_requests set opened_at = now(), opened_revision = current_revision, state = 'ouverte' where reference = '${reference}'`,
    );
    expect(await envoyer(p, 'contact', contact('texte 4'), 4)).toMatchObject({
      code: 'suite',
      precedente: reference,
    });
    expect(
      await envoyer(p, 'absente', { origine: 'pied', nomEcole: 'x', ville: 'y', reponse: 'non' }),
    ).toMatchObject({ code: 'cle_deja_utilisee' });
  });

  it('les refus : champs, fiche inconnue, sceau faux, texte trop long ; rien d’écrit', async () => {
    const avant = sql('select count(*) from prive.public_requests');
    fiche = crypto.randomUUID();
    expect(
      await envoyer(await passe(), 'erreur', {
        origine: 'fiche',
        fiche,
        information: 'nom',
        correction: 'x',
        reponse: 'non',
      }),
    ).toMatchObject({ code: 'ecole_inconnue' });
    expect(await envoyer(await passe(), 'contact', { origine: 'pied' })).toMatchObject({
      code: 'refusee',
      erreurs: { message: 'requis', reponse: 'requis' },
    });
    expect(await envoyer(await passe(), 'contact', contact('é'.repeat(2001)))).toMatchObject({
      erreurs: { message: 'trop_long' },
    });
    expect(await envoyer(await passe(), 'contact', contact('x'.repeat(20_000)))).toMatchObject({
      erreurs: { demande: 'trop_long' },
    });
    const p = await passe();
    expect(await envoyer({ ...p, sceau: '0'.repeat(64) }, 'contact', contact('b'))).toMatchObject({
      code: 'expiree',
    });
    expect(
      await envoyer({ ...p, emisLe: p.emisLe + 86_400 }, 'contact', contact('b')),
    ).toMatchObject({ code: 'expiree' });
    expect(sql('select count(*) from prive.public_requests')).toBe(avant);
  });

  it('un signe impossible, des émojis, un guillemet : jamais une erreur du serveur', async () => {
    const nul = await envoyer(await passe(), 'contact', contact('a\u0000b'));
    expect(['refuse', 'enregistre']).toContain(nul.genre);
    expect(nul.genre === 'refuse' ? nul.code : 'enregistree').toMatch(/refusee|enregistree/);
    expect(await envoyer(await passe(), 'contact', contact('🙂 « l’école » \\ "x"'))).toMatchObject(
      { code: 'enregistree' },
    );
  });

  it('le champ piège : la même réponse, rangé avec les indésirables', async () => {
    const i = await envoyer(await passe(), 'contact', contact('robot'), 1, 'x');
    expect(i).toMatchObject({ code: 'enregistree' });
    const reference = i.genre === 'enregistre' ? i.reference : '';
    expect(sql(`select state from prive.public_requests where reference = '${reference}'`)).toBe(
      'indesirable',
    );
  });

  it('aucune porte par GET, aucune lecture par un visiteur', async () => {
    const get = await brut('send_public_request', { method: 'GET' });
    expect(get.ok).toBe(false);
    const lire = await brut('list_public_requests', {
      method: 'POST',
      body: JSON.stringify({ p_tab: 'a_traiter', p_limit: 1, p_before: null, p_kind: null }),
    });
    expect(lire.ok).toBe(false);
  });

  it('refermés : le même navigateur l’apprend au laissez-passer suivant', async () => {
    const p = await passe();
    sql('delete from prive.public_request_secrets');
    expect(await port.demanderLaissezPasser()).toEqual({ genre: 'ferme' });
    expect(await envoyer(p, 'contact', contact('après la fermeture'))).toMatchObject({
      code: 'expiree',
    });
  });
});
