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
| `pnpm base:demarrer` | La base Supabase locale (Docker) ; Studio sur http://127.0.0.1:54323 |
| `pnpm base:reset` | Rejoue toutes les migrations sur la base locale |
| `pnpm base:tests` | Les tests pgTAP des droits et des règles |
| `pnpm base:arreter` | Arrête la base locale |

La première fois, pour les parcours : `pnpm exec playwright install chromium`.

## Relier la base en ligne (une fois, par le fondateur)

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref rtwghmbupzuhptqywezr
```

`link` demande le mot de passe de la base : il reste dans le gestionnaire de mots de passe et n'est écrit nulle part.

Le schéma de la base et la marche à suivre pour la mettre en ligne : [`supabase/schema.md`](supabase/schema.md).

## Mettre en ligne

Par GitHub Actions seulement (`.github/workflows/mise-en-ligne.yml`) : tous les contrôles d'une pull request, une construction, le site d'essai et ses contrôles en ligne, puis la production et ses contrôles en ligne. Chaque nuit, ou à la main :

```bash
gh workflow run mise-en-ligne.yml -f cible="les deux"
```

`cible` vaut `essai`, `production` ou `les deux`. Pour essayer une branche sur `essai.ntanova.com` avant de la fusionner :

```bash
gh workflow run mise-en-ligne.yml --ref <branche> -f cible=essai
```

Les contrôles en ligne se lancent aussi depuis le Mac, sans rien écrire dans la base :

```bash
ADRESSE=https://essai.ntanova.com pnpm test:en-ligne
```
 Il faut, dans le dépôt GitHub, les secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`, et les variables `PUBLIC_WHATSAPP`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `PUBLIC_GOOGLE_CLIENT_ID`.

## Les polices

Poppins 700 et Nunito Sans 400 et 700, sous-ensemble latin, tirées de Fontsource 5.3.0 et servies par le site (`public/polices/`, licence SIL OFL 1.1 à côté des fichiers).
