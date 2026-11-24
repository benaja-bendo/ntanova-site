# Refonte publique — circuit technique du 24/11/2026

Le fondateur demande une livraison unique, construite par lots courts. Ce document fixe le circuit de code ; les réflexions produit restent dans le dépôt `ntanova`.

## Branches et fin de tâche

- `main` reste la seule branche durable et la base de production.
- `refonte/site-public` est une branche temporaire d'intégration de ce chantier, créée depuis `main` après la consolidation. La supprimer après sa livraison complète.
- Chaque lot part du dernier `origin/refonte/site-public`, utilise une branche courte et une PR **vers `refonte/site-public`**. Pas de PR de lot vers `main`.
- Le lancement d'un lot autorise uniquement son périmètre et sa fusion dans l'intégration. Il n'autorise ni le lot suivant, ni une fusion globale vers `main`, ni une mise en production.
- Après vérification, fusionner le lot en un commit, vérifier le résultat distant, fermer son ticket, supprimer sa branche courte et remettre le clone propre sur `main`. Le contenu est conservé sur l'intégration distante ; ne pas réintroduire un lot en repartant de `main`.
- Un seul agent dans le clone canonique à la fois. Pas de worktree supplémentaire par défaut ; si l'environnement en impose un, le déclarer et fermer le checkout devenu inactif après sauvegarde et intégration.

## Invariants techniques

Conserver la pile, les frontières du code et les budgets. Astro/HTML/CSS pour le public ; aucune copie du moteur de prototype, aucun React/Radix/MapLibre ajouté à l'accueil. Les données d'exemple ne deviennent pas des données de production. Les tests de collecte hors ligne, les droits et les accords de publication restent protégés.

Le champ de lieu libre de l'accueil est établi par le lot 1 (contrat ci-dessous). Ne pas ajouter un champ visuellement fonctionnel dont la destination ignore la valeur.

Les futures migrations restent compatibles avec le code en ligne jusqu'à la livraison globale. Le site d'essai lit actuellement la même base que la production : une branche Git n'isole pas ses écritures. Aucune modification de base ni test d'écriture réel n'est autorisé par cette préparation.

## Lot 1 — accueil et socle public (ticket 211, PR 212, intégré le 24/11/2026 : `25a56e9`)

Contrat de recherche, compris par `lireEtat` / `ecrireEtat` (`src/modele/liste-ecoles.ts`) :

| Paramètre | Sens | Règle |
| --- | --- | --- |
| `q` | quoi : nom, sigle, formation, quartier, repère | inchangé |
| `ou` | où : texte libre | chaque mot est le début d'un mot d'un lieu documenté de l'école (ses divisions, leurs autres écritures, le quartier dit sur place), sans accents ni casse ; jamais le nom ni le repère |

- `q` et `ou` se croisent et s'ajoutent aux filtres ; les deux vides ouvrent toutes les écoles (l'adresse redevient `/ecoles/`). Deux lieux du même nom donnent les deux ; un lieu inconnu donne zéro, jamais un lieu supposé.
- `ou` s'écrit dans l'adresse après `q`, se garde en Liste ↔ Carte et au retour du navigateur, recadre la carte (`cleDeLaSelection`), se relit en puce « Où : … » qu'une touche retire sans toucher aux autres choix, et se corrige dans le résultat vide (« Modifier le lieu »). Sans JavaScript, la liste garde son exception : elle montre les écoles construites et les villes.
- Les anciennes adresses (`zone`, `ville`, `niveau=primaire`, `cycle`, `autour`) restent comprises.
- Transition : écrire à NTanova, signaler une erreur et signaler une école passent par WhatsApp ; « Ajouter mon école » mène à `/pour-les-ecoles/#referencer`. Aucun lien vers `/contact/` ou `/contribuer/` avant le lot 3 ; ni « Toutes les villes » (lot 4) ni « Outils en préparation » (lot 5) dans le pied.

## Lot 2 — S’orienter (ticket 213, PR 214, intégré le 24/11/2026 : `052063e`)

Lancé avec ses six choix acceptés (dépôt `ntanova`, `LOT-02-ORIENTER.md`). `/orienter/` a cinq sections et cinq ancres : `#o-situation`, `#o-parcours`, `#o-activites`, `#o-domaines`, `#o-faq`.

| Pièce | Règle |
| --- | --- |
| Situations | les cinq de l’accueil (`profilsDeLAccueil`), mêmes liens et mêmes nombres ; aucune situation vide |
| Parcours | `niveauxDuParcours` : `?niveau=M/P/C/L/S` seulement avec au moins une école ; le technique, qui n’est qu’un cycle dans l’annuaire, a un seul lien (`?niveau=T`), sur sa voie |
| Activités | `modele/orientation.ts` : six activités, leurs domaines ; un « J’aime » ouvre ses domaines, les autres réponses rien ; pistes dans l’ordre des activités, sans doublon ; une réponse par geste (question affichée, pause de 350 ms, second clic d’un double clic ignoré) |
| Domaines | dix groupes codés comme la CITE-F 2013 (01 à 10), chaque domaine de l’annuaire dans un seul, sauf « Autre » (un test compare à la migration) ; `offreDesDomaines` : lien vers l’union des seuls domaines qui ont une formation, écoles comptées une fois par le filtre de la liste |
| Nombres | `compterLaListe` applique `lireEtat` + `filtrer` de « Les écoles » au lien même : le nombre annoncé est celui de la liste |
| Script | `app/orienter/amorce.ts` (avec la page) puis `activites.ts` (`import()` à l’approche, au focus ou au premier appui, rejoué une fois) ; il montre et cache du HTML écrit à la construction ; frontière ESLint : ni `infra`, ni Supabase, ni React |
| Confidentialité | aucune réponse dans l’adresse, un stockage, un cookie, un journal ou une requête ; l’état vit le temps de la page ; « Recommencer » le remet à zéro |
| Sans JavaScript | la carte des activités renvoie aux domaines, sans bouton ; le reste est du HTML et des `<details>` |
| Poids | `pnpm poids` : tout le JavaScript de `/orienter/` (amorce et imports suivis) sous 10 Ko gzip, premier affichage sous 200 Ko ; aucune autre page ne gagne de script |

L’accueil rétablit les activités : « Le parcours scolaire, les activités, les domaines » (`/orienter/`) et une carte « Pas d’idée de métier ? » (`/orienter/#o-activites`). `/orienter/` entre dans `sitemap.xml` et `llms.txt`.

Textes scolaires vérifiés le 24/11 (note datée dans le dépôt `ntanova`) : décrets 2017-148, 2017-149, 2017-154 et 2025-216, Conseil des ministres du 20 janvier 2026, JO du 5 novembre 2026, CITE-F 2013. Le CEP reste « en projet » ; les âges maximum de 2017 et la durée de la maternelle ne sont pas affichés. Relecture humaine des informations scolaires avant toute production.

### Corrections après revue du lot 2 (24/11)

- Une touche Entrée maintenue ne répond plus à plusieurs activités : les répétitions natives du clavier sont ignorées, en plus de la pause et du filtre des doubles clics. Un parcours reproduit l’échec avant correction, puis vérifie un nouvel appui après relâchement.
- Le résultat sans sélection reste factuel, y compris après six « Je ne sais pas » ; le secours sans activités propose les domaines sans vocabulaire technique.
- Le groupe 06 précise « Informatique et technologies de communication » pour le distinguer du journalisme du groupe 03. Les domaines et les comptes ne changent pas.
- La source du Conseil des ministres décrit son contenu daté, sans présenter sa lecture comme une vérification de l’entrée en vigueur d’une réforme. Le vote non retrouvé ne prouve pas l’absence de vote ; les sources et cette limite sont consignées dans le dépôt documentaire.

## Contrôles et livraison

Suivre `CLAUDE.md` : contrôles locaux sur le faux catalogue, dont `pnpm verif:ci` et les parcours pertinents, puis CI de la dernière révision. Aucun workflow supplémentaire, aucune répétition identique de CI. Ne pas remplacer la construction locale du fondateur par une construction isolée sur les vraies données.

Le workflow existant autorise l'essai depuis une branche et la production depuis `main`. La recette finale crée une PR globale ; le fondateur donne ensuite l'ordre de livraison. Un tag marque la base, un autre marquera le commit effectivement livré. Un correctif urgent de `main` est reporté dans l'intégration avant de poursuivre les lots.

Un agent termine avec ticket, PR, base, SHA, contrôles, captures, limites et état local/distant. Il s'arrête après le seul lot lancé ; il ne propose pas automatiquement une suite.

Plan détaillé et prompt commun à Claude/GPT : `~/Desktop/NTANOVA/docs/produit/2026-11-24-refonte-site-public/README.md`.

## Revue et fusion par le fondateur (24/11/2026)

Le fondateur garde désormais la fusion : l’agent de code termine son lot avec une PR vérifiée et ouverte vers `refonte/site-public`, puis une autre session fait la revue. Les corrections reviennent sur la branche de cette PR. L’agent ne fusionne pas et ne ferme pas le ticket avant la fusion constatée. Cette consigne remplace la fusion automatique de fin de tâche décrite plus haut. Le lot suivant commence après la fusion du précédent, depuis le dernier `origin/refonte/site-public`.

La revue de la PR 212 a conduit à deux corrections : « Exemple » accompagne le dernier mot du nom fictif, dans l’accueil et la démonstration ; chaque lien du pied possède une cible de 44 px sans chevaucher le suivant, à la souris comme au doigt. Les parcours de régression ont d’abord reproduit les défauts. Aucun déploiement ni changement de base n’accompagne ces corrections.

État au 24/11 : les lots 1 et 2 sont intégrés à `refonte/site-public` (PR 212 et 214, CI verte sur leur dernière révision), aucun n’est en production. Leurs tickets sont fermés et leurs branches courtes supprimées. Le lot suivant part du dernier `origin/refonte/site-public`.
