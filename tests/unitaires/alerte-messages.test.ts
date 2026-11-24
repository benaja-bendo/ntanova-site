// L'alerte e-mail des messages reçus (refonte, lot 3B2) : le service, sans Deno, avec un registre et un courrier fictifs. Aucun
// service distant, aucune donnée réelle. Le moteur Edge, la base et un serveur TLS local ont été joués à la main (PR du lot).
import { readFileSync } from 'node:fs';
import { createServer, connect, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listes } from '../../src/modele/listes';
import { lireReference, adresseMessage } from '../../src/modele/messages-recus';
import { creerPorte, lireConfiguration } from '../../supabase/functions/alerte-messages/porte';
import { creerRegistre } from '../../supabase/functions/alerte-messages/registre';
import {
  composer,
  EchecCourrier,
  lireReservation,
  NATURES,
  passer,
  type Annonce,
  type Courrier,
  type Registre,
  type Transport,
} from '../../supabase/functions/alerte-messages/service';
import {
  ecrireCourrier,
  enTete,
  ouvrirSession,
  type Fil,
} from '../../supabase/functions/alerte-messages/smtp';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SIGNES = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const reference = (n: number, lettre = 'A') =>
  `${lettre}-7K4P-2Q${SIGNES[Math.floor(n / 32)]}${SIGNES[n % 32]}`;
const annonce = (n: number, nature: Annonce['nature'] = 'absente'): Annonce => ({
  bail: uuid(n),
  reference: reference(n),
  nature,
  messageId: uuid(1000 + n),
});
const brut = (a: Annonce) => ({
  lease: a.bail,
  reference: a.reference,
  kind: a.nature,
  message_id: a.messageId,
  attempts: 1,
});

/** Une base et un serveur de courrier fictifs, tenus par le test. */
function scene(
  annonces: Annonce[],
  options: {
    envoyeesDansLHeure?: number;
    envoyer?: (c: Courrier, n: number) => void;
    ouvrir?: () => void;
    marquer?: (bail: string, n: number) => boolean | void;
  } = {},
) {
  const envois: Courrier[] = [];
  const marques: [string, string][] = [];
  let essais = 0;
  const registre: Registre = {
    async reserver() {
      return {
        annonces,
        illisibles: [],
        envoyeesDansLHeure: options.envoyeesDansLHeure ?? 0,
      };
    },
    async marquer(bail, resultat) {
      options.marquer?.(bail, essais++);
      marques.push([bail, resultat]);
      return true;
    },
  };
  const transport: Transport = {
    async ouvrir() {
      options.ouvrir?.();
      return {
        async envoyer(c) {
          options.envoyer?.(c, envois.length);
          envois.push(c);
        },
        async fermer() {},
      };
    },
  };
  return { registre, transport, envois, marques };
}

describe('ce que l’alerte contient', () => {
  it('une référence, une nature, un lien vers l’administration ; rien d’autre', async () => {
    const [g] = await composer([annonce(1)], 0);
    expect(g!.courrier).toEqual({
      objet: `NTanova · nouveau message ${reference(1)} (école absente)`,
      corps: `Un message est arrivé. Ouvrir dans l'administration :\n\n${reference(1)} (école absente)\nhttps://ntanova.com/admin/#demandes/${reference(1)}\n`,
      messageId: `${uuid(1001)}@ntanova.com`,
    });
  });

  it('le lien est l’adresse que l’administration sait lire', async () => {
    const [g] = await composer([annonce(1)], 0);
    const lien = /#(\S+)/.exec(g!.courrier.corps)![1]!;
    expect(lien).toBe(adresseMessage(reference(1)));
    expect(lireReference(lien.split('/')[1])).toBe(reference(1));
  });

  it('chaque nature de la base a ses mots', () => {
    expect(Object.keys(NATURES).sort()).toEqual([...listes.public_request_kind].sort());
  });

  it('une ligne inattendue ne devient jamais un courrier, et rien d’un message ne passe', () => {
    const lue = lireReservation({
      notices: [
        { ...brut(annonce(1)), message: 'TEXTE', contact: '242060000001', school_name: 'ÉCOLE' },
        { ...brut(annonce(2)), reference: 'A-7K4P-2QXM\r\nBcc: autre@exemple.test' },
        { ...brut(annonce(3)), kind: 'constructor' },
        { ...brut(annonce(4)), message_id: 'x' },
        { ...brut(annonce(5)), lease: 'pas un bail' },
      ],
      sent_last_hour: 3,
    });
    expect(lue).toEqual({
      annonces: [annonce(1)],
      illisibles: [uuid(2), uuid(3), uuid(4)],
      envoyeesDansLHeure: 3,
    });
    expect(() => lireReservation({})).toThrow();
    expect(() => lireReservation(null)).toThrow();
  });

  it('au-delà de vingt dans l’heure, un seul courrier regroupe, et aucune référence ne se perd', async () => {
    const vingt = Array.from({ length: 20 }, (_, i) => annonce(i));
    const groupes = await composer(vingt, 15);
    expect(groupes.map((g) => g.annonces.length)).toEqual([1, 1, 1, 1, 1, 15]);
    expect(groupes.at(-1)!.courrier.objet).toBe('NTanova · 15 nouveaux messages');
    const liens = groupes.flatMap((g) =>
      [...g.courrier.corps.matchAll(/#demandes\/(\S+)/g)].map((m) => m[1]),
    );
    expect(liens).toEqual(vingt.map((a) => a.reference));
    // Déjà vingt dans l'heure : tout ensemble. Une seule de plus : son propre courrier.
    expect((await composer(vingt, 20)).length).toBe(1);
    expect((await composer(vingt, 999)).length).toBe(1);
    expect((await composer([annonce(1)], 20))[0]!.courrier.objet).toContain('nouveau message');
  });

  it('le même groupe garde son Message-ID ; un groupe différent en a un autre', async () => {
    const id = async (l: Annonce[]) => (await composer(l, 20))[0]!.courrier.messageId;
    const trois = [annonce(1), annonce(2), annonce(3)];
    expect(await id(trois)).toBe(await id([...trois].reverse()));
    expect(await id(trois)).not.toBe(await id([...trois, annonce(4)]));
    expect(await id(trois)).toMatch(/^groupe-[0-9a-f]{32}@ntanova\.com$/);
  });
});

describe('un passage', () => {
  it('rien à annoncer : aucune connexion au courrier', async () => {
    const ouvrir = vi.fn();
    const s = scene([], { ouvrir });
    expect(await passer(s.registre, s.transport)).toEqual({
      reservees: 0,
      envoyees: 0,
      echecs: {},
      nonMarquees: 0,
    });
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it('chaque courrier accepté est marqué aussitôt', async () => {
    const s = scene([annonce(1), annonce(2)]);
    expect(await passer(s.registre, s.transport)).toMatchObject({ envoyees: 2, echecs: {} });
    expect(s.marques).toEqual([
      [uuid(1), 'envoyee'],
      [uuid(2), 'envoyee'],
    ]);
  });

  it('courrier injoignable : toutes marquées, un code seulement', async () => {
    const s = scene([annonce(1), annonce(2)], {
      ouvrir: () => {
        throw new Error('getaddrinfo mail.exemple.test mot-de-passe');
      },
    });
    const bilan = await passer(s.registre, s.transport);
    expect(bilan).toEqual({ reservees: 2, envoyees: 0, echecs: { connexion: 2 }, nonMarquees: 0 });
    expect(JSON.stringify(bilan)).not.toContain('mot-de-passe');
  });

  it('un refus sur un courrier ne bloque pas le suivant', async () => {
    const s = scene([annonce(1), annonce(2)], {
      envoyer: (c) => {
        if (c.messageId.startsWith(uuid(1001))) throw new EchecCourrier('refus_definitif', false);
      },
    });
    await passer(s.registre, s.transport);
    expect(s.marques).toEqual([
      [uuid(1), 'refus_definitif'],
      [uuid(2), 'envoyee'],
    ]);
  });

  it('une session rompue : le reste attend le prochain passage, avec le même motif', async () => {
    const s = scene([annonce(1), annonce(2), annonce(3)], {
      envoyer: (_, n) => {
        if (n === 1) throw new EchecCourrier('delai', true);
      },
    });
    await passer(s.registre, s.transport);
    expect(s.marques.map(([, r]) => r)).toEqual(['envoyee', 'delai', 'delai']);
  });

  it('le temps manque : le reste est marqué « delai », sans être tenté', async () => {
    let t = 0;
    const s = scene([annonce(1), annonce(2), annonce(3)], { envoyer: () => void (t += 50_000) });
    const bilan = await passer(s.registre, s.transport, { maintenant: () => t });
    expect(s.envois.length).toBe(2);
    expect(bilan.echecs).toEqual({ delai: 1 });
  });

  it('coupure après l’acceptation : le bail expire, l’annonce repart avec le même Message-ID', async () => {
    const premiere = scene([annonce(1)], {
      marquer: () => {
        throw new Error('réseau');
      },
    });
    expect(await passer(premiere.registre, premiere.transport)).toMatchObject({
      envoyees: 1,
      nonMarquees: 1,
    });
    // Le passage suivant, après l'expiration du bail : un nouveau bail, la même annonce.
    const seconde = scene([{ ...annonce(1), bail: uuid(77) }]);
    await passer(seconde.registre, seconde.transport);
    expect(seconde.envois[0]!.messageId).toBe(premiere.envois[0]!.messageId);
    expect(seconde.marques).toEqual([[uuid(77), 'envoyee']]);
  });

  it('un marquage raté se rejoue une fois', async () => {
    const s = scene([annonce(1)], {
      marquer: (_, n) => {
        if (n === 0) throw new Error('réseau');
      },
    });
    expect(await passer(s.registre, s.transport)).toMatchObject({ envoyees: 1, nonMarquees: 0 });
  });

  it('un marquage muet ne dépasse pas la durée du passage et aucun autre courrier ne part', async () => {
    vi.useFakeTimers();
    try {
      const s = scene([annonce(1), annonce(2)]);
      s.registre.marquer = () => new Promise(() => undefined);
      const passage = passer(s.registre, s.transport);
      await vi.advanceTimersByTimeAsync(100_001);
      const bilan = await passage;
      expect(s.envois).toHaveLength(1);
      expect(bilan.nonMarquees).toBe(2);
      expect(bilan.echecs).toEqual({ delai: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('un bail périmé et repris ailleurs : rien n’est affirmé, rien ne casse', async () => {
    const s = scene([annonce(1)]);
    s.registre.marquer = async () => false;
    expect(await passer(s.registre, s.transport)).toMatchObject({ envoyees: 1, nonMarquees: 0 });
  });
});

// Le registre : deux fonctions de la base, et elles seules ---------------------------------------------------

describe('le registre', () => {
  const appels: { url: string; init: RequestInit }[] = [];
  const faux =
    (statut: number, corps: unknown): typeof fetch =>
    async (url, init) => {
      appels.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(corps), { status: statut });
    };
  afterEach(() => void (appels.length = 0));
  const reglages = { url: 'https://base.exemple.test/', cle: 'sb_secret_fictive' };

  it('réserve et marque, avec la clé du service dans `apikey` seulement', async () => {
    const r = creerRegistre(
      reglages,
      faux(200, { notices: [brut(annonce(1))], sent_last_hour: 0 }),
    );
    expect((await r.reserver(20)).annonces).toEqual([annonce(1)]);
    const m = creerRegistre(reglages, faux(200, true));
    expect(await m.marquer(uuid(1), 'envoyee')).toBe(true);
    expect(appels.map((a) => [a.url, a.init.body])).toEqual([
      ['https://base.exemple.test/rest/v1/rpc/claim_public_request_notices', '{"p_limit":20}'],
      [
        'https://base.exemple.test/rest/v1/rpc/report_public_request_notice',
        `{"p_lease":"${uuid(1)}","p_result":"envoyee"}`,
      ],
    ]);
    expect(appels[0]!.init.headers).toEqual({
      'content-type': 'application/json',
      apikey: 'sb_secret_fictive',
    });
    expect(appels[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('un refus de la base (401, 403, 5xx) lève une erreur sans son corps', async () => {
    for (const statut of [401, 403, 500]) {
      const r = creerRegistre(
        reglages,
        faux(statut, { message: 'permission denied, TEXTE PRIVÉ' }),
      );
      await expect(r.reserver(20)).rejects.toThrow(`registre ${statut}`);
    }
  });

  it('les deux fonctions et leurs paramètres existent dans les migrations', () => {
    const sql = readFileSync(
      'supabase/migrations/20261124140300_messages_annonces_et_purge.sql',
      'utf8',
    );
    expect(sql).toContain('public.claim_public_request_notices(p_limit integer default 20)');
    expect(sql).toContain('public.report_public_request_notice(p_lease uuid, p_result text)');
    for (const code of listes.public_notice_error) expect(sql).toContain(`'${code}'`);
  });
});

// La porte : qui réveille le service ----------------------------------------------------------------------------

describe('la porte', () => {
  const JETON = 'j'.repeat(40);
  const env: Record<string, string> = {
    ALERTE_JETON: JETON,
    SUPABASE_URL: 'https://base.exemple.test',
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_autre","alerte_messages":"sb_secret_fictive"}',
    ALERTE_SMTP_HOTE: 'mail.exemple.test',
    ALERTE_SMTP_UTILISATEUR: 'alerte@exemple.test',
    ALERTE_SMTP_MOT_DE_PASSE: 'fictif',
    ALERTE_DESTINATAIRE: 'fondateur@exemple.test',
  };
  const configuration = lireConfiguration((n) => env[n])!;
  const post = (jeton?: string) =>
    new Request('https://f.exemple.test/', {
      method: 'POST',
      headers: jeton === undefined ? {} : { 'x-ntanova-jeton': jeton },
      body: '{}',
    });
  const bilan = { reservees: 1, envoyees: 1, echecs: {}, nonMarquees: 0 };

  function porte(plus: Partial<Parameters<typeof creerPorte>[0]> = {}) {
    const journal: string[] = [];
    const passerSpy = vi.fn(async () => bilan);
    return {
      journal,
      passerSpy,
      traiter: creerPorte({
        jeton: JETON,
        configuration,
        passer: passerSpy,
        journal: (l) => journal.push(l),
        ...plus,
      }),
    };
  }

  it('sans jeton ou avec un autre : 401, et rien ne se fait', async () => {
    const p = porte();
    for (const j of [undefined, '', 'faux', `${JETON}x`, JETON.slice(1)]) {
      expect((await p.traiter(post(j))).status).toBe(401);
    }
    expect(p.passerSpy).not.toHaveBeenCalled();
    expect(p.journal).toEqual([]);
  });

  it('seulement en POST', async () => {
    expect((await porte().traiter(new Request('https://f.exemple.test/'))).status).toBe(405);
  });

  it('avec le bon jeton : un passage, et seulement des nombres', async () => {
    const p = porte();
    const r = await p.traiter(post(JETON));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ code: 'passage', ...bilan });
    expect(p.journal).toEqual([JSON.stringify({ alerte: 'passage', ...bilan })]);
  });

  it('sans réglage complet : 503, aucune annonce réservée ; un service qui ne passe pas se verra', async () => {
    const p = porte({ configuration: null });
    expect((await p.traiter(post(JETON))).status).toBe(503);
    expect(p.passerSpy).not.toHaveBeenCalled();
    expect((await porte({ jeton: null }).traiter(post(JETON))).status).toBe(503);
    expect((await porte({ jeton: 'court' }).traiter(post('court'))).status).toBe(503);
  });

  it('la base ne répond pas : 502, sans rien recopier de l’erreur', async () => {
    const p = porte({
      passer: async () => {
        throw new Error('https://base.exemple.test sb_secret_fictive TEXTE PRIVÉ');
      },
    });
    const r = await p.traiter(post(JETON));
    expect([r.status, await r.text()]).toEqual([502, '{"code":"base"}']);
    expect(p.journal).toEqual(['{"alerte":"base"}']);
  });

  it('les réglages : tous nécessaires, la clé du service par son nom, jamais celle par défaut', () => {
    expect(configuration.cle).toBe('sb_secret_fictive');
    expect(configuration.smtp.expediteur).toBe('alerte@exemple.test');
    for (const manque of Object.keys(env)) {
      expect(
        lireConfiguration((n) => (n === manque ? undefined : env[n])),
        manque,
      ).toBeNull();
    }
    const avec = (nom: string, valeur: string) =>
      lireConfiguration((n) => (n === nom ? valeur : env[n]));
    expect(avec('SUPABASE_SECRET_KEYS', '{"default":"sb_secret_autre"}')).toBeNull();
    expect(avec('SUPABASE_SECRET_KEYS', 'pas du json')).toBeNull();
    expect(avec('ALERTE_DESTINATAIRE', 'a@exemple.test>\r\nRCPT TO:<b@exemple.test')).toBeNull();
    expect(avec('ALERTE_SMTP_HOTE', 'mail exemple')).toBeNull();
    expect(avec('ALERTE_JETON', 'court')).toBeNull();
  });
});

// Le dialogue SMTP, avec un serveur local fictif (sans TLS : la connexion chiffrée est celle de Deno) -------------------

describe('le dialogue SMTP', () => {
  let serveur: Server | null = null;
  let ouvertes: Socket[] = [];
  afterEach(() => {
    for (const s of ouvertes) s.destroy();
    ouvertes = [];
    serveur?.close();
    serveur = null;
  });
  const reglages = {
    utilisateur: 'alerte@exemple.test',
    motDePasse: 'mot de passe fictif',
    expediteur: 'alerte@exemple.test',
    destinataire: 'fondateur@exemple.test',
  };
  const courrier: Courrier = {
    objet: 'NTanova · é',
    corps: 'Corps\n.\nfin',
    messageId: 'x@ntanova.com',
  };
  const delais = { reponseMs: 200, rangementMs: 300 };

  /** Un serveur qui répond ce qu'on lui dit, commande par commande ; `null` : il se tait ; `fin` : il raccroche. */
  async function brancher(
    reponses: Record<string, string | null | 'fin'> = {},
    accueil: string | null = '220 fictif',
  ) {
    const recu: string[] = [];
    const courriers: string[] = [];
    serveur = createServer((s) => {
      ouvertes.push(s);
      s.on('error', () => undefined);
      let texte = '';
      let donnees = false;
      let base64 = 0;
      const dire = (r: string | null | undefined, defaut: string) => {
        if (r === null) return;
        if (r === 'fin') s.destroy();
        else s.write(`${r ?? defaut}\r\n`);
      };
      if (accueil !== null) s.write(`${accueil}\r\n`);
      s.on('data', (o) => {
        texte += o.toString();
        for (let i = texte.indexOf('\r\n'); i >= 0; i = texte.indexOf('\r\n')) {
          const l = texte.slice(0, i);
          texte = texte.slice(i + 2);
          if (donnees) {
            if (l === '.') {
              donnees = false;
              dire(reponses['.'], '250 range');
            } else courriers.push(l);
            continue;
          }
          recu.push(l);
          const mot = l.split(/[ :]/)[0]!;
          if (mot === 'EHLO') dire(reponses.EHLO, '250-fictif\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE');
          else if (mot === 'AUTH') dire(reponses.AUTH, '235 ok');
          else if (mot === 'DATA') {
            donnees = (reponses.DATA ?? '354').startsWith('354');
            dire(reponses.DATA, '354 allez');
          } else if (mot !== 'RSET' && mot !== 'QUIT' && /^[A-Za-z0-9+/=]+$/.test(l)) {
            // L'identifiant, puis le mot de passe (AUTH LOGIN).
            dire(reponses.base64, (base64 += 1) === 1 ? '334 UGFzc3dvcmQ6' : '235 ok');
          } else dire(reponses[mot], '250 ok');
        }
      });
    });
    await new Promise<void>((r) => serveur!.listen(0, '127.0.0.1', r));
    const socket = connect((serveur.address() as AddressInfo).port, '127.0.0.1');
    ouvertes.push(socket);
    socket.on('error', () => undefined);
    const attente: ((o: Uint8Array | null) => void)[] = [];
    const file: (Uint8Array | null)[] = [];
    const pousser = (o: Uint8Array | null) => (attente.shift() ?? ((x) => void file.push(x)))(o);
    socket.on('data', pousser);
    socket.on('close', () => pousser(null));
    const fil: Fil = {
      lire: () =>
        file.length > 0 ? Promise.resolve(file.shift()!) : new Promise((r) => attente.push(r)),
      ecrire: (o) => new Promise((r, non) => socket.write(o, (e) => (e ? non(e) : r()))),
      fermer: () => void socket.destroy(),
    };
    return { fil, recu, courriers };
  }
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: unknown) => (e instanceof EchecCourrier ? `${e.code}${e.fatal ? '!' : ''}` : String(e)),
    );

  it('salue, s’identifie, envoie et se tait', async () => {
    const { fil, recu, courriers } = await brancher();
    const s = await ouvrirSession(fil, reglages, { delais, maintenant: () => new Date(0) });
    await s.envoyer(courrier);
    await s.fermer();
    expect(recu.slice(0, 5)).toEqual([
      'EHLO alerte.ntanova.com',
      `AUTH PLAIN ${Buffer.from('\0alerte@exemple.test\0mot de passe fictif').toString('base64')}`,
      'MAIL FROM:<alerte@exemple.test>',
      'RCPT TO:<fondateur@exemple.test>',
      'DATA',
    ]);
    expect(courriers.join('\n')).toBe(
      ecrireCourrier(courrier, reglages, new Date(0)).replaceAll('\r\n', '\n').trimEnd(),
    );
  });

  it('sans PLAIN, il prend LOGIN ; sans aucun des deux, c’est un réglage à revoir', async () => {
    const login = { EHLO: '250-fictif\r\n250 AUTH LOGIN', AUTH: '334 VXNlcm5hbWU6' };
    const bon = await brancher(login);
    const s = await ouvrirSession(bon.fil, reglages, { delais });
    await s.envoyer(courrier);
    expect(bon.recu.slice(1, 4)).toEqual([
      'AUTH LOGIN',
      Buffer.from(reglages.utilisateur).toString('base64'),
      Buffer.from(reglages.motDePasse).toString('base64'),
    ]);
    const refuse = await brancher({ ...login, base64: '535 non' });
    expect(await code(ouvrirSession(refuse.fil, reglages, { delais }))).toBe('authentification!');
    const aucun = await brancher({ EHLO: '250 fictif' });
    expect(await code(ouvrirSession(aucun.fil, reglages, { delais }))).toBe('configuration!');
  });

  it('chaque panne a son code, jamais le texte du serveur', async () => {
    const ouvrir = async (r: Parameters<typeof brancher>[0], accueil?: string | null) =>
      code(ouvrirSession((await brancher(r, accueil)).fil, reglages, { delais }));
    expect(await ouvrir({}, '421 occupé')).toBe('refus_temporaire!');
    expect(await ouvrir({}, '554 non')).toBe('refus_definitif!');
    expect(await ouvrir({}, null)).toBe('delai!');
    expect(await ouvrir({}, 'nimporte quoi')).toBe('connexion!');
    expect(await ouvrir({ AUTH: '535 mauvais mot de passe' })).toBe('authentification!');
    expect(await ouvrir({ AUTH: '454 plus tard' })).toBe('refus_temporaire!');
    expect(await ouvrir({ AUTH: 'fin' })).toBe('connexion!');
    expect(await ouvrir({ EHLO: null })).toBe('delai!');
  });

  it('un refus du destinataire laisse la session ouverte ; un 421 ou un silence la ferme', async () => {
    const envoyer = async (r: Parameters<typeof brancher>[0]) => {
      const { fil } = await brancher(r);
      return code((await ouvrirSession(fil, reglages, { delais })).envoyer(courrier));
    };
    expect(await envoyer({ RCPT: '550 inconnu' })).toBe('refus_definitif');
    expect(await envoyer({ MAIL: '452 plein' })).toBe('refus_temporaire');
    expect(await envoyer({ DATA: '451 plus tard' })).toBe('refus_temporaire');
    expect(await envoyer({ RCPT: '421 je raccroche' })).toBe('refus_temporaire!');
    expect(await envoyer({ RCPT: '550 inconnu', RSET: '500 non' })).toBe('refus_definitif!');
    // Le point est parti, la réponse n'est jamais venue : on ne sait pas. L'annonce repartira, même Message-ID.
    expect(await envoyer({ '.': null })).toBe('delai!');
    expect(await envoyer({ '.': 'fin' })).toBe('connexion!');
  });

  it('la fin du passage ferme aussi la connexion SMTP en attente', async () => {
    const { fil } = await brancher({ '.': null });
    const fermer = vi.spyOn(fil, 'fermer');
    const controle = new AbortController();
    const session = await ouvrirSession(fil, reglages, { delais, signal: controle.signal });
    const envoi = code(session.envoyer(courrier));
    controle.abort();
    await envoi;
    expect(fermer).toHaveBeenCalledOnce();
  });

  it('un en-tête ne laisse passer aucune fin de ligne, et les accents sont encodés', () => {
    expect(enTete('a\r\nBcc: b@exemple.test')).toBe('a Bcc: b@exemple.test');
    const long = enTete('NTanova · nouveau message A-7K4P-2QXM (école absente)');
    for (const l of long.split('\r\n ')) {
      expect(l).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(l.length).toBeLessThanOrEqual(75);
    }
    const decode = long
      .split('\r\n ')
      .map((l) => Buffer.from(l.slice(10, -2), 'base64').toString())
      .join('');
    expect(decode).toBe('NTanova · nouveau message A-7K4P-2QXM (école absente)');
  });

  it('le courrier : un destinataire, le texte seul, des lignes courtes', () => {
    const t = ecrireCourrier({ ...courrier, corps: 'é'.repeat(200) }, reglages, new Date(0));
    expect(t).toContain('To: <fondateur@exemple.test>\r\n');
    expect(t).toContain('Message-ID: <x@ntanova.com>\r\n');
    expect(t).toContain('Date: Thu, 01 Jan 1970 00:00:00 +0000\r\n');
    expect(t).not.toMatch(/[^\r]\n|\r[^\n]/);
    for (const l of t.split('\r\n')) expect(l.length).toBeLessThanOrEqual(78);
    const corps = t.split('\r\n\r\n')[1]!;
    expect(Buffer.from(corps, 'base64').toString()).toBe('é'.repeat(200));
  });
});

describe('le service est préparé, pas branché', () => {
  it('aucun workflow ne le déploie, aucun secret n’est écrit, le port est le 465', () => {
    for (const f of ['verif.yml', 'mise-en-ligne.yml', 'sauvegarde.yml']) {
      expect(readFileSync(`.github/workflows/${f}`, 'utf8')).not.toMatch(
        /functions deploy|alerte-messages/,
      );
    }
    const index = readFileSync('supabase/functions/alerte-messages/index.ts', 'utf8');
    expect(index).toContain('const PORT = 465;');
    expect(index).toContain('Deno.connectTls');
    const tout = ['index', 'porte', 'registre', 'service', 'smtp']
      .map((f) => readFileSync(`supabase/functions/alerte-messages/${f}.ts`, 'utf8'))
      .join('\n');
    // Les deux seules fonctions de la base, et aucune table.
    expect([...tout.matchAll(/rpc\('(\w+)'/g)].map((m) => m[1]).sort()).toEqual([
      'claim_public_request_notices',
      'report_public_request_notice',
    ]);
    expect(tout).not.toMatch(/rest\/v1\/(?!rpc)/);
    expect(tout).not.toMatch(/infomaniak|sb_secret_[A-Za-z0-9]{10}/i);
  });
});
