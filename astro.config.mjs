// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://ntanova.com',
  // Tout le site est construit en fichiers statiques, servis par un Worker Cloudflare.
  output: 'static',
  integrations: [react()],
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
    },
  },
});
