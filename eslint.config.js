// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Les frontières entre dossiers (voir CLAUDE.md, « Architecture »).
// Une règle plutôt qu'une consigne : la vérification échoue si on les franchit.
// Pour un même fichier, seul le dernier bloc qui le vise compte : chaque bloc
// donne donc la liste complète de ce qui est interdit dans son dossier.

const supabase = {
  group: ['@supabase/*'],
  message: 'Supabase ne s’importe que dans src/infra/. Passer par un port de src/modele/.',
};
const infraInterne = {
  regex: '(^|/)infra/(?!index(\\.ts)?$).+',
  message: 'Seul src/infra/index.ts se branche ailleurs : il exporte les adaptateurs actifs.',
};
// Les imports sont relatifs (`../infra`, `../../ui/jetons.css`) : on reconnaît le dossier
// visé à son nom dans le chemin, d'où des expressions régulières plutôt que des globs.
/** @param {string} nom */
const dossier = (nom) => `(^|/)${nom}(/|$)`;
const versApp = {
  regex: dossier('app'),
  message: 'Ce dossier ne dépend pas des écrans de src/app/.',
};
const versUi = { regex: dossier('ui'), message: 'Ce dossier ne dépend pas de src/ui/.' };
const versPages = { regex: dossier('pages'), message: 'Rien ne dépend de src/pages/.' };
const versInfra = { regex: dossier('infra'), message: 'Ce dossier ne connaît pas src/infra/.' };
const versRelais = {
  regex: dossier('relais'),
  message: 'L’administration ne dépend pas de l’espace relais.',
};
const versAdmin = {
  regex: dossier('admin'),
  message: 'L’espace relais ne dépend pas de l’administration.',
};
const react = {
  group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
  message: 'Le modèle reste en TypeScript pur.',
};

/**
 * @param {string} chemin
 * @param {object[]} interdits
 * @returns {import('eslint').Linter.Config}
 */
const frontiere = (chemin, interdits) => ({
  files: [`src/${chemin}/**`],
  rules: { 'no-restricted-imports': ['error', { patterns: interdits }] },
});

export default defineConfig(
  globalIgnores([
    'dist/',
    '.astro/',
    '.wrangler/',
    'node_modules/',
    'playwright-report/',
    'test-results/',
    'supabase/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },

  frontiere('**', [supabase, infraInterne]),
  frontiere('modele', [supabase, react, versInfra, versApp, versUi, versPages]),
  frontiere('ui', [supabase, versInfra, versApp, versPages]),
  frontiere('infra', [versApp, versUi, versPages]),
  frontiere('app/relais', [supabase, infraInterne, versAdmin, versPages]),
  frontiere('app/admin', [supabase, infraInterne, versRelais, versPages]),
);
