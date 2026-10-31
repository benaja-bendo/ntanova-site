// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import integrationRelais from './outils/integration-relais.mjs';

// La version de l'application, envoyée avec le journal des erreurs.
const versionApp = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);

export default defineConfig({
  site: 'https://ntanova.com',
  // Tout le site est construit en fichiers statiques, servis par un Worker Cloudflare.
  output: 'static',
  integrations: [react(), integrationRelais()],
  vite: {
    define: { __VERSION_APP__: JSON.stringify(versionApp) },
  },
  // Variables publiques seulement : elles finissent dans le navigateur.
  // Aucune clé secrète ici (voir CLAUDE.md, « Secrets »).
  env: {
    schema: {
      PUBLIC_WHATSAPP: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_GOOGLE_CLIENT_ID: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      // « faux » : un faux serveur dans le navigateur, pour les parcours Playwright.
      PUBLIC_ADAPTATEUR: envField.enum({
        context: 'client',
        access: 'public',
        values: ['supabase', 'faux'],
        default: 'supabase',
      }),
    },
  },
});
