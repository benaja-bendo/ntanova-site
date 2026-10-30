# ntanova-site

Le site de NTanova : l'annuaire des écoles de Pointe-Noire, quartier par quartier, l'espace des relais et l'administration.

Astro 7 (pages statiques) + React (espace relais, administration) + Supabase (base, connexion, photos), servi par Cloudflare Workers. Les règles de travail sont dans [`CLAUDE.md`](CLAUDE.md).

## Prérequis

- Node 24 (`.nvmrc`) et pnpm 10 (`packageManager` dans `package.json`).
- Docker, pour la base locale (`supabase start`).
- Les CLI de Supabase et de Cloudflare (wrangler) sont des dépendances du projet : `pnpm exec supabase …`, `pnpm exec wrangler …`.

## Démarrer

```bash
nvm use
pnpm install
cp .env.example .env
pnpm dev
```

Puis http://localhost:4321. Le catalogue des composants : http://localhost:4321/dev/catalogue/.

## Les commandes

| Commande | Ce qu'elle fait |
| --- | --- |
| `pnpm dev` | Le site en développement |
| `pnpm build` | Construit le site dans `dist/` |
| `pnpm preview` | Sert `dist/` avec wrangler, comme Cloudflare |
| `pnpm verif` | Tout ce que vérifie la CI : format, lint, couleurs, types, tests, construction, poids |
| `pnpm test:parcours` | Les parcours Playwright dans un téléphone de 360 px |
| `pnpm format` | Remet le code en forme |

La première fois, pour les parcours : `pnpm exec playwright install chromium`.

## Relier la base en ligne (une fois, par le fondateur)

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref rtwghmbupzuhptqywezr
```

`link` demande le mot de passe de la base : il reste dans le gestionnaire de mots de passe et n'est écrit nulle part.

## Les polices

Poppins 700 et Nunito Sans 400 et 700, sous-ensemble latin, tirées de Fontsource 5.3.0 et servies par le site (`public/polices/`, licence SIL OFL 1.1 à côté des fichiers).
