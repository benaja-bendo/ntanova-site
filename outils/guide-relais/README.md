# Le guide du relais (ticket 110)

Une seule source, quatre sorties :

| Sortie | Où | Comment |
| --- | --- | --- |
| La page publique non listée | `/guide-relais/` | `src/pages/guide-relais/index.astro` → `src/ui/GuideRelais.astro` |
| La même page, dans l'espace relais | `/relais/guide/` (bouton « Lire le guide du relais » de l'écran Compte) | `src/pages/relais/guide.astro`, gardée par le service worker : elle se lit sans réseau |
| Le PDF (7 pages : 6 et la carte de passage, 1 080 × 1 920), **sans les montants** | `/guide-relais/NTANOVA-guide-relais-<version>-<date>.pdf` | `outils/guide-relais/exporter.ts`, lancé par `pnpm build` après `astro build` |
| Les images pour WhatsApp (une par page), **sans les montants** | `/guide-relais/guide-relais-<version>-<date>-NN-<page>.png` | idem |
| Le **document complet, avec les montants** (PDF et images) | `outils/guide-relais/sortie/…-complet.pdf` : **jamais publié ni versionné** | idem : c'est celui que le fondateur envoie à la main sur WhatsApp |

**Pourquoi deux exports.** La page et le PDF publiés sont lisibles par quiconque a le lien : aucun montant dessus (décision
du 03/11). La page 5 y dit où trouver les montants (« dans le document que NTanova vous a remis ») ; le document complet les a.
Dans `guide-relais.ts`, un bloc `{ type: 'montants', avec, sans }` ou un texte `{ avec, sans }` change selon l'export ; la
construction échoue si le guide publié porte « FCFA », ou si le document complet n'en porte pas.

La source est **`src/modele/guide-relais.ts`** : le texte, les montants (`FICHE`, `CONTACT`, `ESSAI`, `JOUR_PAIEMENT`), la
version, la date de mise à jour et la liste « Ce qui a changé ». `src/modele/guide-relais-html.ts` en fait du HTML, le même
pour la page et pour le PDF (autre feuille de style : `src/ui/GuideRelais.astro` pour la page, `export.css` pour le PDF).

## Mettre le guide à jour

1. Modifier le texte dans `src/modele/guide-relais.ts`.
2. Passer `miseAJour` à la date du jour (et `version` si la règle change vraiment), et **ajouter une ligne en tête de
   `changements`** : c'est ce que le relais lit pour savoir ce qui a changé depuis le PDF qu'il a reçu. Un test refuse une
   liste dans le désordre, ou dont la première ligne n'est pas la date de mise à jour.
3. `pnpm test` (le contenu), puis `pnpm build` (le PDF et les images, avec leurs contrôles de mise en page).
4. Pour envoyer le document complet (avec les montants) sur WhatsApp : `pnpm guide:exporter` (après un `pnpm build`, ou
   `astro build` pour que `dist/guide-relais/` existe), puis prendre `outils/guide-relais/sortie/…-complet.pdf` (ou les
   images `…-complet-NN-….png`). Le nom porte la version et la date : on ne confond jamais deux envois. Pour la version
   sans montants : « Télécharger le PDF » et « Images pour WhatsApp » sur la page. Le lien vers la page, lui, est toujours à jour.

Garder une copie de chaque version réellement envoyée dans Drive (`NTANOVA/discovery/diffusion/`, voir `DONNEES.md` du
dépôt `ntanova`).

## Ce que le test refuse (`tests/unitaires/guide-relais.test.ts`)

- un texte attendu qui manque (par page) ; la carte de passage sans « Aucune photo d'enfant » ;
- ce qu'on ne doit jamais lire : « gratuit », la RDC, « dans votre zone », « votre lot », « seuil », « hypothèse », « D7 »,
  un gabarit resté tel quel (`{`, `undefined`, un numéro manquant) ;
- les phrases « À dire en entrant », « Jamais » et « À lui dire » qui ne seraient plus celles de l'application
  (`src/app/relais/ecrans/MonLot.tsx` et `Ajouter.tsx` : si l'application change, le guide change) ;
- les montants (jamais sur la page ni dans le PDF publié, présents dans le document complet), l'exemple de la page 5, le numéro `+242 06 123 45 67` (jamais inventé), les noms des fichiers.

L'export vérifie en plus, dans le navigateur, que rien ne déborde sur le pied de page, que le badge `n/6` ne chevauche
rien, que le tableau « Où trouver » est aligné, que la police Poppins est chargée, que les écarts du numéro sont égaux, et
que le PDF a 7 pages. Le parcours `tests/parcours/guide-relais.spec.ts` vérifie la page, `noindex`, l'absence de lien depuis
le site public, le PDF et les images, la carte du Compte, et la lecture sans réseau.

## Les règles

- **Le numéro WhatsApp n'entre jamais dans le dépôt.** Il vient de `PUBLIC_WHATSAPP` (l'environnement, sinon le `.env`) et
  n'apparaît que sur la carte de passage construite. Sans numéro, la carte écrit `[numéro WhatsApp]` : en CI de mise en
  ligne (`GUIDE_NUMERO_OBLIGATOIRE=oui`), la construction échoue plutôt que de publier cela.
- Aucune hypothèse du registre, aucune offre, ni gratuité ni prix promis aux écoles. Les montants du relais viennent de
  décisions du fondateur ; les changer ici, puis les noter au registre.
- Le lot est un **secteur conseillé**, jamais une limite ni une condition de paie (ticket 67) : « votre secteur ».
- Le Congo-Brazzaville (pas la RDC) ; on vouvoie les relais.
- Public mais **non listé** : `noindex, nofollow` dans la page et en-tête `X-Robots-Tag` sur tout `/guide-relais/*` (PDF et
  images compris), aucun lien depuis le site public, ni dans la recherche, ni de sitemap. Quiconque a le lien le lit.
- **Pas sous `/relais/` pour la route publique** : le service worker du relais y répondrait par la coquille de
  l'application. `/relais/guide/` est la seule exception, écrite dans `outils/sw-relais.js`.

## Où est quoi

- `exporter.ts` : le PDF et les images, avec les contrôles de mise en page. Il a besoin du Chromium de Playwright
  (`pnpm exec playwright install chromium`).
- `export.css` : la mise en page du PDF (pixels fixes), héritée du livret v3.
- `captures/` : les quatre captures de l'espace relais en 3× (1 080 px de large), prises sur l'application construite avec
  le faux serveur, avec des données **fictives**. Le PDF les prend telles quelles ; la page en montre une copie
  WebP de 640 px (`public/guide-relais/captures/`, recoupée à la hauteur montrée).
- `polices/` : Poppins (OFL), embarquée pour le PDF : la construction n'a pas besoin du réseau.
- `logo-mark-sombre.svg` : la marque, version pour fond sombre.
- `recapture/` : de quoi refaire les captures (voir ci-dessous).

## Refaire les captures

À refaire quand un écran ou un libellé change (le PDF montre l'application telle qu'elle était à la dernière capture).

```bash
outils/guide-relais/recapture/recapturer.sh     # clone jetable, build avec le faux serveur, Playwright, 3×
```

Puis recouper chaque capture à la hauteur montrée (`rapport` des écrans dans `guide-relais.ts`) et refaire les WebP de
`public/guide-relais/captures/` :

```bash
for n in mon-lot ajouter-1 ajouter-2 ajouter-3; do
  cwebp -q 62 -resize 640 0 outils/guide-relais/captures/$n.png -o public/guide-relais/captures/$n.webp
done
```

(`ajouter-1`, `ajouter-2` et `ajouter-3` sont d'abord recoupées en haut à 2 395, 2 320 et 2 394 px de haut : ce que la
page de l'espace relais montre ; `mon-lot` entière.) Si un écran change de hauteur, revoir à l'œil les `rapport` et relancer
`pnpm build` : l'export dit si une page déborde.

## Historique

Le livret v1 et v2 (PDF fabriqués par un script Python dans le dépôt `ntanova`, `outils/livret-relais/`) et la v3 (02/11/2026)
sont la source de ce guide : la mise en page, le texte et les contrôles viennent de là. Le guide en ligne (03/11/2026,
ticket 110) en reprend le contenu de la v3.
