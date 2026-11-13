# Système de design NTanova (v2)

> **Cible décidée par le fondateur le 12/11/2026.** Ce fichier décrit le code. Les lignes marquées **v2** sont vraies depuis le lot A du ticket 165 (13/11), sauf Tailwind et shadcn, branchés au lot B. Lire ce fichier avant de créer ou de modifier un composant.

## 1. Les règles qui tiennent tout

1. **Le code est la source.** Les jetons sont dans `src/ui/jetons.css`, seul fichier où une couleur s'écrit en valeur (`pnpm couleurs`). Tout artefact, canevas, PDF ou image n'en est qu'une copie.
2. **Un tronc, trois branches.** Couleurs, polices, formes, icônes et écriture sont communes. Seuls l'échelle, les rayons, les fonds, le droit aux icônes et au mouvement changent selon le support : écran, affiche 1080 × 1920, papier A4.
3. **L'existant reste en CSS simple ; le nouveau prend shadcn/ui** (12/11, remplace « sans Tailwind » du 30/10 et du 06/11). Tailwind est branché sur les jetons et sert aux vrais composants shadcn (Radix et Tailwind) dans `/admin`, `/relais` et les nouveaux blocs interactifs. On ne réécrit pas ce qui tourne. Voir § 6.
4. **Chaque composant entre dans le catalogue** (`/dev/catalogue/`) dans chacun de ses états, composant shadcn compris.
5. **Une page publique pèse 200 Ko au plus** (12/11, remplace 100 Ko) et reste sans JavaScript, sauf les exceptions déjà écrites dans `CLAUDE.md`.

## 2. Tronc commun

### Couleurs

| Rôle | Jeton | Valeur | Contraste mesuré |
| --- | --- | --- | --- |
| Fond des écrans | `--fond` | **v2** `#f8f6f2` (pierre ; était `#f7f8f6`) | décision du 12/11 |
| Surface | `--fond-releve` | `#ffffff` | |
| Bande | `--fond-bande` | **v2** `#efece6` | texte doux 6,4:1 |
| Texte | `--texte` | `#14231f` | 15,1:1 sur le fond |
| Texte doux | `--texte-doux` | `#4d5752` | 6,9:1 sur le fond |
| Filet décoratif | `--trait` | **v2** `#e6e2da` | ne porte aucun sens |
| Bord qui porte du sens | `--trait-fort` | **v2** `#4d5752` (était `#868c86`) | 7,5:1 sur blanc (était 3,4:1) |
| Marque | `--marque` | `#0b5d4a` | texte crème dessus : 7,2:1 |
| Marque appuyée | `--marque-appuyee` | `#084337` | |
| Accent | `--accent` | `#f2b738` | jamais du texte sur clair (1,8:1) |
| Erreur, refus | `--erreur` | `#a44533` | 6,0:1 sur blanc |
| Focus | `--focus` | `#084337` ; **v2** jaune sur une surface verte | 10,6:1 ; 6,2:1 |

- La crème `#f9f4ec` est le texte sur le vert et le papier des affiches. Le fond des écrans est la pierre `#f8f6f2`, plus chaude que le gris du 03/11 ; le fond de la carte interactive ne change pas.
- Le rouge de la marque `#e2543c` ne porte jamais de petit texte : crème dessus 3,45:1, blanc 3,8:1, encre 4,3:1. Un bouton destructif est en contour `--erreur`, jamais plein.
- **v2, statuts doux** (alias, aucune valeur nouvelle) : succès `--vert-pale` / `--vert-profond` (8,9:1) ; attention `--jaune-pale` / `--encre` (14,1:1) ; danger `--rouge-pale` / `--rouge-texte` (4,7:1) ; neutre `--pierre-bande` / `--encre-75` (6,4:1). Vert, jaune, rouge gardent le même sens partout. La couleur ne vient jamais sans un mot.
- Preuves (`--preuve-…`) et cycles (`--cycle-…`, lettres M, P, C, L, T, S) : inchangés. Le vert ne sert jamais à un cycle.
- Ne pas réintroduire : `#1c3631`, `#fbf8f2`, `#f5efe4`, `#5d6b66`, `#66615a`, `#b0491f`, `#cfe0d9`.

### Typographie (v2, décision du 12/11)

- **Source Serif 4, 700** (`--police-titre`) : titres de page, noms d'écoles, intertitres. Jamais sous 16 px, jamais sur un bouton ni un libellé.
- **Nunito Sans, 700** (`--police-interface`) : boutons, libellés, onglets, badges, navigation. **Nunito Sans 400 et 700** (`--police-texte`) : texte.
- Trois fichiers servis par le site (48 Ko), jamais un service extérieur. Une seule graisse de Source Serif 4 ; ne pas écrire `font-weight: 600`.
- Poppins ne sert plus sur les écrans. Elle reste dans le guide du relais v4 (affiches) jusqu'à sa prochaine version.
- Échelle écran : 12, 14, 16, 18, 22, 28 px. Texte courant et champs à 16 px. Chiffres en `tabular-nums`.
- Libellés en minuscules, 14 px. Les capitales espacées sont réservées aux surtitres de 12 px.

### Formes (v2)

| Forme | Rôle | Jeton |
| --- | --- | --- |
| Rectangle | on agit ou on saisit : bouton, champ, choix d'un formulaire | `--rayon-s` 8 px |
| Pilule | ça qualifie : badge d'état, puce de filtre. Jamais une action | `--rayon-pilule` |
| Cercle | ça compte ou ça nomme : numéro, lettre de cycle | 50 % |
| Carte | ça contient | `--rayon-m` 12 px ; tiroirs et photos `--rayon-l` 16 px |

### Icônes

- **Un seul registre, une seule grammaire** (12/11). On puise dans tout icones.js.org, d'abord Lucide, Tabler et Phosphor, à condition que l'icône soit en contour, sur une grille de 24, trait de 1,75 à 2, extrémités et angles arrondis. Une icône pleine ou à deux tons n'entre pas.
- Le SVG est copié dans le registre du code, qui impose le trait et les arrondis ; rien n'est chargé depuis Iconify ni d'aucun service. Phosphor se ramène de sa grille de 256 à 24. La licence de chaque jeu est notée dans le registre.
- **v2** : les deux registres actuels (`src/modele/carte/icones.ts`, `src/ui/composants.tsx`) fusionnent au fil des tickets.
- Une donnée, une icône, toujours la même. Toujours avec un mot ; seule exception : fermer, chercher, revenir, agrandir, avec un nom accessible.
- Pas d'emoji. Sur la carte publique, les lettres de cycle seules (08/11).

### États (tout élément interactif)

Repos, survol (`@media (hover: hover)` seulement), appui (plus sombre, 1 px de course), focus (anneau de 3 px décalé de 2), désactivé, chargement (`aria-busy`, roue, libellé « Envoi… », largeur inchangée), erreur. Mouvement : 120 ms, jamais indispensable, respecte `prefers-reduced-motion`.

### Écriture

- « Congo-Brazzaville », jamais la RDC.
- On **vouvoie** les familles, les directions et les relais. Seule l'administration tutoie le fondateur.
- Des faits : ni « gratuit », ni audience, ni couverture totale. Aucune hypothèse, aucun seuil, aucun montant dans un support montré.

## 3. Les trois branches

| | A · Écran | B · Affiche 1080 × 1920 | C · Papier A4 |
| --- | --- | --- | --- |
| Supports | site public, `/relais`, `/admin` | guide du relais, images WhatsApp (`outils/guide-relais/export.css`) | guide, fiche de liaison |
| Texte | 16 px, échelle 12 à 28 | 30 px courant ; plancher 24 (l'image s'affiche au tiers) | 13 à 14 px ; plancher 12 (9 pt) |
| Police | Source Serif 4 700, Nunito Sans 400/700 | Poppins jusqu'au guide v5, puis titres en Source Serif 4 | Source Serif 4 700, Nunito Sans 400/700 |
| Rayons | 8 et 12 px | 24 à 40 px, ici seulement | 0 à 8 px, filets fins |
| Fonds | `--fond`, cartes blanches | vert, panneaux crème | blanc de la feuille, aucun aplat |
| Texte | `--texte` | encre sur crème, crème sur vert | **noir pur** ; vert profond pour les titres de 14 pt et plus |
| Icônes | oui, avec un mot | non : numéros et disques | aucune |
| Mouvement | 120 ms | aucun | aucun |

Sur papier, le texte est en noir pur parce qu'une imprimante de bureau trame les couleurs : un petit texte vert sort flou. C'est le seul écart de couleur admis.

L'écran a trois contextes :

| | Site public | Espace relais | Administration |
| --- | --- | --- | --- |
| Contrainte | aucun JavaScript, 200 Ko par page | hors ligne, soleil, une main, 360 px ; budget à mesurer | beaucoup de fiches, clavier |
| Composants | HTML, `<details>` | l'existant en CSS, shadcn pour les blocs nouveaux | shadcn/ui |
| Cibles | 48 et 44 px | 48 et 44 px | 36 px à la souris, 44 au doigt |
| Aide | visible dans la page | une ligne au moment du geste, un exemple en image | détail au clic, règles dans un tiroir |

## 4. Quelle situation, quel composant

| Situation | Composant (motif shadcn) | Dans le code | Interdit |
| --- | --- | --- | --- |
| Passer d'un état d'une file à l'autre | Onglets avec compteur (Tabs) | shadcn `Tabs` | une phrase qui donne les comptes |
| Affiner une liste | Puce de filtre (Toggle) | `.pastille-choix` → **v2** `.puce-filtre` | une liste déroulante pour moins de cinq choix |
| Choisir entre deux et cinq options | Choix (ToggleGroup) | `Choix` | une liste sans case de sortie |
| Retrouver une école parmi beaucoup | Recherche (Command) | shadcn `Command` | faire défiler toute la liste |
| Dire un état | Badge avec un mot (Badge) | `.etiquette` + `.statut-…` | un contour plein, la couleur seule |
| Agir | Bouton, un seul plein par écran (Button) | `.bouton` | une pilule, deux boutons pleins |
| Aider à remplir un champ | Aide d'une ligne (FormDescription) | `.aide` | un exemple dans le champ, un paragraphe |
| Expliquer une règle générale | Tiroir « Règles » (Sheet) | `.dialogue-tiroir`, ou shadcn `Sheet` pour un écran nouveau | le même texte dans chaque fiche |
| Donner le détail d'un signal | Bulle au clic sur son badge (Popover) | shadcn `Popover` | une information visible au survol seulement |
| Vérifier une saisie sur la photo | Photo à côté des champs, agrandie au clic (Dialog) | `Dialogue` | la photo derrière une icône |
| Confirmer un geste définitif | Confirmation où l'on tape le nom (AlertDialog) | `ConfirmationAction` | un raccourci clavier |
| Dire qu'un geste a réussi | Confirmation en bas d'écran (Sonner) | shadcn `Sonner` | une page ou une fenêtre de plus |
| Montrer l'état du système | Bandeau (Alert) | `Bandeau` | une fenêtre qui bloque |
| Ranger du secondaire | Section repliable avec résumé (Collapsible) | `.section-repliable` | replier ce qui sert à décider |
| Guider un relais | Exemple en image, aide au moment du geste | partiel | un (i) à toucher |

## 5. La loi anti-mur de texte

1. Une règle générale n'apparaît qu'une fois, jamais dans un élément répété : elle vit dans le tiroir « Règles ».
2. Quinze mots au plus pour l'aide d'un champ, sur une ligne, sous le libellé.
3. Deux lignes de suite au maximum sans libellé, badge ou valeur.
4. Les exceptions d'abord : ce qui demande un regard s'écrit, ce qui va bien tient dans un badge.
5. Rien d'important au survol seul.
6. La conséquence se lit près du geste, une fois.

À garder par un test : l'attribut `aide` de `Champ` refuse plus de quinze mots.

## 6. Tailwind et shadcn/ui (décision du 12/11)

- **Où** : `/admin`, `/relais` et les nouveaux blocs interactifs. Jamais dans une page publique sans JavaScript.
- **Sans remise à zéro** : on importe le thème et les utilitaires de Tailwind, pas « preflight », qui effacerait les marges et les titres des pages existantes.
- **Le thème ne contient que des renvois aux jetons** (table ci-dessous). Aucune couleur en valeur : `pnpm couleurs` continue de garder `jetons.css` seul.
- **Une frontière nette** : un fichier est soit en classes du site, soit en Tailwind, jamais les deux.
- **Espace relais** : mesurer le poids de l'application avant et après le premier composant Radix ; commencer par `/admin`.

| shadcn | NTanova |
| --- | --- |
| `background` / `foreground` | `--fond` / `--texte` |
| `card`, `popover` | `--fond-releve` |
| `primary` / `primary-foreground` | `--marque` / `--texte-sur-marque` |
| `secondary`, `muted` | `--fond-bande` |
| `muted-foreground` | `--texte-doux` |
| `accent` | `--fond-bande`. **Piège** : chez shadcn c'est le fond de survol ; ici `--accent` est le jaune. Écrire `--color-accent: var(--fond-bande)` |
| `destructive` | `--erreur`, en texte et en contour |
| `border` / `input` | `--trait` / `--trait-fort` |
| `ring` | `--focus` |
| `radius` | `--rayon-s` (8 px), cartes `--rayon-m` |
| `font-sans` / `font-serif` | `--police-interface` / `--police-titre` |
