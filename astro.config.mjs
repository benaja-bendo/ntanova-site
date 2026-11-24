// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import integrationRelais from './outils/integration-relais.mjs';

// La version de l'application, envoyée avec le journal des erreurs.
const versionApp = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);

// `src/infra/index.ts` ne fait rien à sa lecture. Le dire au regroupement : la page d'un formulaire public qui n'en importe que le
// port des demandes n'emporte alors ni l'espace relais, ni l'administration (10 Ko gzip au plus, `pnpm poids`).
const infraSansEffet = {
  name: 'ntanova-infra-sans-effet',
  /** @param {string} code @param {string} id */
  transform(code, id) {
    return id.endsWith('/src/infra/index.ts') ? { code, moduleSideEffects: false } : null;
  },
};

export default defineConfig({
  site: 'https://ntanova.com',
  // Tout le site est construit en fichiers statiques, servis par un Worker Cloudflare.
  output: 'static',
  integrations: [react(), integrationRelais()],
  vite: {
    // Tailwind sert seulement /admin et /relais (src/ui/shadcn/theme.css) : aucune page publique ne l'importe.
    plugins: [tailwindcss(), infraSansEffet],
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
      // « À propos » : le responsable et l'adresse de contact, jamais écrits dans le code.
      PUBLIC_RESPONSABLE: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_CONTACT_EMAIL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      // Les formulaires Contact et annuaire (refonte, lot 3C) : fermés par défaut, les portes du site restent sur WhatsApp. Les
      // ouvrir est un geste de la recette ; les envois, eux, attendent un secret dans la base.
      PUBLIC_FORMULAIRES: envField.enum({
        context: 'client',
        access: 'public',
        values: ['fermes', 'ouverts'],
        default: 'fermes',
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
