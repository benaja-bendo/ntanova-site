import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CHAMPS } from '../../src/modele/demandes';
import type { EnvoiPublic } from '../../src/modele/envoi-public';
import { CHAMP } from '../../src/infra/supabase/champs-demandes';
import {
  creerPortDemandes,
  traduireContenu,
  traduireReponse,
} from '../../src/infra/supabase/demandes-publiques';

// L'adaptateur public (refonte, lot 3C), sans service distant : ce qui part, sous quels noms, et ce qu'une réponse veut dire.
// La même chose a été vérifiée sur la vraie API locale (`outils/essayer-les-envois.mjs`).

const sql = readFileSync('supabase/migrations/20261124140100_messages_envoi.sql', 'utf8');
const URL_BASE = 'https://exemple.test';
const PASSE = { cle: 'd1200000-0000-4000-8000-000000000001', emisLe: 1795500000, sceau: 'abc' };
const ENVOI: EnvoiPublic = {
  passe: PASSE,
  revision: 3,
  nature: 'absente',
  contenu: {
    origine: 'pied',
    nomEcole: '[École « Exemple »]',
    ville: 'Dolisie',
    niveaux: ['P'],
    deLEcole: true,
    reponse: 'whatsapp',
    coordonnee: '242060000000',
  },
  piege: '',
};

type Appel = { url: string; init: RequestInit };
function serveur(reponse: (a: Appel) => Response | Promise<Response>) {
  const appels: Appel[] = [];
  const port = creerPortDemandes(URL_BASE, 'sb_publishable_test', {
    delaiMs: 50,
    fetch: (async (url: string, init: RequestInit) => {
      appels.push({ url, init });
      return reponse({ url, init });
    }) as typeof fetch,
  });
  return { port, appels };
}
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

describe('ce qui part', () => {
  it('l’envoi est un POST dont le corps EST le paramètre, sous les noms de la base', async () => {
    const { port, appels } = serveur(() => json({ code: 'plafond' }));
    await port.envoyer(ENVOI);
    expect(appels).toHaveLength(1);
    const { url, init } = appels[0]!;
    expect(url).toBe('https://exemple.test/rest/v1/rpc/send_public_request');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toEqual({
      key: PASSE.cle,
      issued_at: PASSE.emisLe,
      seal: PASSE.sceau,
      revision: 3,
      kind: 'absente',
      request: {
        origin: 'pied',
        school_name: '[École « Exemple »]',
        town: 'Dolisie',
        levels: ['P'],
        is_from_school: true,
        reply: 'whatsapp',
        contact: '242060000000',
      },
      trap: '',
    });
    // Rien d'écrit ne passe dans l'adresse ni dans un en-tête.
    expect(JSON.stringify([url, init.headers])).not.toMatch(/Exemple|Dolisie|24206/);
  });

  it('les deux portes existent dans les migrations, ouvertes à un visiteur, la seconde sans nom de paramètre', () => {
    expect(sql).toContain('create function public.send_public_request(json) returns jsonb');
    expect(sql).toContain('grant execute on function public.send_public_request(json) to anon');
    expect(sql).toContain('grant execute on function public.issue_public_request_pass() to anon');
    for (const cle of ['key', 'issued_at', 'seal', 'revision', 'kind', 'request', 'trap']) {
      expect(sql, cle).toMatch(new RegExp(`b ->>? '${cle}'`));
    }
    for (const c of CHAMPS) expect(sql, c.nom).toContain(`('${CHAMP[c.nom]}',`);
  });

  it('un texte impossible à lire pour la base part quand même en JSON valable', async () => {
    const { port, appels } = serveur(() => json({ code: 'refusee' }));
    await port.envoyer({ ...ENVOI, contenu: { message: 'a\u0000b\uD800' } });
    expect(() => JSON.parse(String(appels[0]!.init.body))).not.toThrow();
  });
});

describe('le laissez-passer', () => {
  it('accordé', async () => {
    const { port } = serveur(() =>
      json({ key: PASSE.cle, issued_at: PASSE.emisLe, seal: PASSE.sceau }),
    );
    expect(await port.demanderLaissezPasser()).toEqual({ genre: 'accorde', passe: PASSE });
  });

  it('fermé : le code 55000 est reconnu, même rendu en HTTP 500 ; une porte absente aussi', async () => {
    for (const [status, code] of [
      [500, '55000'],
      [400, '55000'],
      [404, 'PGRST202'],
    ] as const) {
      const { port } = serveur(() => json({ code, message: 'x', details: null }, status));
      expect(await port.demanderLaissezPasser(), `${status} ${code}`).toEqual({ genre: 'ferme' });
    }
  });

  it('une autre panne n’est pas « fermé », et une réponse incomplète n’est pas accordée', async () => {
    const reponses = [
      () => json({ code: '53300' }, 500),
      () => new Response('<html>', { status: 502 }),
      () => json({ key: 'x', issued_at: 'hier', seal: 's' }),
      () => json(null),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ];
    for (const r of reponses) {
      expect(await serveur(r).port.demanderLaissezPasser()).toEqual({ genre: 'non_confirme' });
    }
  });
});

describe('ce que la réponse veut dire', () => {
  it('enregistré seulement avec une référence du serveur', async () => {
    const { port } = serveur(() => json({ code: 'enregistree', reference: 'A-7K4P-2QXM' }));
    expect(await port.envoyer(ENVOI)).toMatchObject({
      genre: 'enregistre',
      reference: 'A-7K4P-2QXM',
    });
    const sans = serveur(() => json({ code: 'enregistree' }));
    expect(await sans.port.envoyer(ENVOI)).toEqual({ genre: 'non_confirme' });
  });

  it('une suite porte ses deux références, sous les noms de la base', async () => {
    const { port } = serveur(() =>
      json({ code: 'suite', reference: 'A-9HZE-4NBV', previous_reference: 'A-7K4P-2QXM' }),
    );
    expect(await port.envoyer(ENVOI)).toEqual({
      genre: 'enregistre',
      code: 'suite',
      reference: 'A-9HZE-4NBV',
      precedente: 'A-7K4P-2QXM',
    });
  });

  it('les champs refusés reviennent sous les noms du modèle ; l’inconnu vise l’envoi entier', () => {
    expect(
      traduireReponse({
        code: 'refusee',
        errors: { school_name: 'requis', contact: 'format', request: 'trop_long' },
      }),
    ).toMatchObject({
      erreurs: { nomEcole: 'requis', coordonnee: 'format', demande: 'trop_long' },
    });
  });

  it('coupure, délai, 5xx, HTML, code inconnu : pas confirmé, jamais une erreur levée', async () => {
    const reponses: (() => Response | Promise<Response>)[] = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json({ code: 'enregistree', reference: 'A-7K4P-2QXM' }, 500),
      () => new Response('<html>', { status: 200 }),
      () => json({ code: 'autre_chose', reference: 'A-7K4P-2QXM' }),
      () => new Promise<Response>(() => {}),
    ];
    for (const r of reponses.slice(0, 4)) {
      expect(await serveur(r).port.envoyer(ENVOI)).toEqual({ genre: 'non_confirme' });
    }
  });

  it('un serveur muet : le délai coupe la requête elle-même', async () => {
    let coupee = false;
    const { port } = serveur(
      ({ init }) =>
        new Promise<Response>((_, rejeter) => {
          init.signal?.addEventListener('abort', () => {
            coupee = true;
            rejeter(new DOMException('coupé', 'AbortError'));
          });
        }),
    );
    expect(await port.envoyer(ENVOI)).toEqual({ genre: 'non_confirme' });
    expect(coupee).toBe(true);
  });

  it('rien n’est écrit dans la console, quoi qu’il arrive', async () => {
    const sorties = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    await serveur(() => Promise.reject(new Error('x'))).port.envoyer(ENVOI);
    await serveur(() => json({ code: 'refusee', errors: { request: 'x' } })).port.envoyer(ENVOI);
    for (const s of sorties) {
      expect(s).not.toHaveBeenCalled();
      s.mockRestore();
    }
  });

  it('chaque champ du modèle a son nom dans la base, une seule fois', () => {
    expect(Object.keys(CHAMP).sort()).toEqual(CHAMPS.map((c) => c.nom).sort());
    expect(new Set(Object.values(CHAMP)).size).toBe(CHAMPS.length);
    expect(traduireContenu({ fiche: 'x', precision: 'y' })).toEqual({
      campus_id: 'x',
      removal_details: 'y',
    });
  });
});
