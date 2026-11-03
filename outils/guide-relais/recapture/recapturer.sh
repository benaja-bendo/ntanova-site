#!/usr/bin/env bash
# Refait les quatre captures de l'espace relais (../captures/*.png) en haute définition (3×), et vérifie au passage
# que le badge « Gardé sur le téléphone » tient sur une ligne à chaque étape.
#
# Tout se passe dans un clone jetable de ntanova-site : le dossier d'origine n'est jamais touché
# (un build avec le faux serveur écraserait son dist/).
#
# Prérequis : ntanova-site cloné (NTANOVA_SITE, par défaut ~/Desktop/ntanova-site), pnpm, et Node 24
# (Astro 7 refuse Node 22.16 : NODE24_BIN pointe sur le dossier bin d'un Node 24, trouvé dans nvm sinon).
# Les navigateurs de Playwright sont ceux déjà installés pour ntanova-site (LIVRET_NAVIGATEUR : un autre chemin).
set -euo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="${NTANOVA_SITE:-$HOME/Desktop/ntanova-site}"
NODE24="${NODE24_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v24*/bin 2>/dev/null | tail -1 || true)}"
PNPM="$(command -v pnpm)"
[ -n "$PNPM" ] || { echo "Il faut pnpm."; exit 1; }
TMP="$(mktemp -d)"
echo "== clone jetable : $TMP/site"
git clone -q --no-hardlinks "$SITE" "$TMP/site"
# Les modifications pas encore commitées de l'application comptent : on les recopie dans le clone.
(cd "$SITE" && git ls-files -m -o --exclude-standard | grep -v '^node_modules/' | while read -r f; do
  mkdir -p "$TMP/site/$(dirname "$f")"; cp "$f" "$TMP/site/$f"; done) || true
cd "$TMP/site"
export PATH="${NODE24:+$NODE24:}$(dirname "$PNPM"):$PATH"
pnpm install --offline --frozen-lockfile
PUBLIC_ADAPTATEUR=faux PUBLIC_WHATSAPP=242000000000 pnpm exec astro build
mkdir -p tests/livret
cp "$ICI/livret.spec.ts" tests/livret/
cp "$ICI/playwright.livret.config.ts" .
LIVRET_SORTIE="$TMP/captures" LIVRET_ENSEIGNE="$ICI/enseigne.html" \
  pnpm exec playwright test -c playwright.livret.config.ts
for n in mon-lot ajouter-1 ajouter-2 ajouter-3; do cp "$TMP/captures/$n.png" "$ICI/../captures/$n.png"; done
echo "== captures refaites dans outils/guide-relais/captures/ ; refaire les WebP de public/guide-relais/captures/ (voir le README), puis pnpm build"
echo "   (les rapports des trois écrans, dans src/modele/guide-relais.ts, sont à revérifier si les écrans ont changé)"
