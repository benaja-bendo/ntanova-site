/**
 * Le service d'alerte des messages reçus (refonte publique, lot 3B2). PRÉPARÉ, PAS DÉPLOYÉ : le déployer, poser ses secrets et
 * l'activer sont des ordres séparés du fondateur (`supabase/schema.md`, « Activer l'alerte »).
 *
 * Ici, seulement ce qui demande Deno : les réglages, la connexion chiffrée (465, TLS d'emblée) et l'écoute. Le reste se teste sans.
 */
import { creerPorte, lireConfiguration, type Configuration } from './porte.ts';
import { creerRegistre } from './registre.ts';
import { EchecCourrier, passer, type Transport } from './service.ts';
import { ouvrirSession, type Fil } from './smtp.ts';

interface ConnexionDeno {
  read(tampon: Uint8Array): Promise<number | null>;
  write(octets: Uint8Array): Promise<number>;
  close(): void;
}
declare const Deno: {
  env: { get(nom: string): string | undefined };
  connectTls(o: { hostname: string; port: number }): Promise<ConnexionDeno>;
  serve(traiter: (requete: Request) => Promise<Response>): unknown;
};

const PORT = 465;
const CONNEXION_MS = 10_000;

function versFil(connexion: ConnexionDeno): Fil {
  const tampon = new Uint8Array(4096);
  return {
    async lire() {
      const n = await connexion.read(tampon);
      return n === null ? null : tampon.slice(0, n);
    },
    async ecrire(octets) {
      let ecrits = 0;
      while (ecrits < octets.length) ecrits += await connexion.write(octets.subarray(ecrits));
    },
    fermer() {
      connexion.close();
    },
  };
}

function transport(c: Configuration): Transport {
  return {
    async ouvrir(signal) {
      const attente = Deno.connectTls({ hostname: c.smtp.hote, port: PORT });
      const annuler = () => void attente.then((c) => c.close()).catch(() => undefined);
      signal?.addEventListener('abort', annuler, { once: true });
      let minuterie: ReturnType<typeof setTimeout> | undefined;
      let connexion: ConnexionDeno;
      try {
        connexion = await Promise.race([
          attente,
          new Promise<never>((_, rejeter) => {
            minuterie = setTimeout(() => rejeter(new EchecCourrier('delai', true)), CONNEXION_MS);
          }),
        ]);
      } catch (e) {
        // Une connexion qui aboutit trop tard se referme : personne ne l'utilisera.
        void attente.then((tardive) => tardive.close()).catch(() => undefined);
        throw e instanceof EchecCourrier ? e : new EchecCourrier('connexion', true);
      } finally {
        clearTimeout(minuterie);
        signal?.removeEventListener('abort', annuler);
      }
      if (signal?.aborted) {
        connexion.close();
        throw new EchecCourrier('delai', true);
      }
      return ouvrirSession(versFil(connexion), c.smtp, signal ? { signal } : {});
    },
  };
}

const env = (nom: string) => Deno.env.get(nom);
Deno.serve(
  creerPorte({
    jeton: env('ALERTE_JETON')?.trim() || null,
    configuration: lireConfiguration(env),
    passer: (c) => passer(creerRegistre(c), transport(c)),
    journal: (ligne) => console.log(ligne),
  }),
);
