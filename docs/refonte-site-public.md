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

Le nouveau champ de lieu libre de l'accueil n'est pas encore implémenté : le lot 1 doit établir son contrat avec la liste et sa sérialisation. Ne pas ajouter un champ visuellement fonctionnel dont la destination ignore la valeur.

Les futures migrations restent compatibles avec le code en ligne jusqu'à la livraison globale. Le site d'essai lit actuellement la même base que la production : une branche Git n'isole pas ses écritures. Aucune modification de base ni test d'écriture réel n'est autorisé par cette préparation.

## Contrôles et livraison

Suivre `CLAUDE.md` : contrôles locaux sur le faux catalogue, dont `pnpm verif:ci` et les parcours pertinents, puis CI de la dernière révision. Aucun workflow supplémentaire, aucune répétition identique de CI. Ne pas remplacer la construction locale du fondateur par une construction isolée sur les vraies données.

Le workflow existant autorise l'essai depuis une branche et la production depuis `main`. La recette finale crée une PR globale ; le fondateur donne ensuite l'ordre de livraison. Un tag marque la base, un autre marquera le commit effectivement livré. Un correctif urgent de `main` est reporté dans l'intégration avant de poursuivre les lots.

Un agent termine avec ticket, PR, base, SHA, contrôles, captures, limites et état local/distant. Il s'arrête après le seul lot lancé ; il ne propose pas automatiquement une suite.

Plan détaillé et prompt commun à Claude/GPT : `~/Desktop/NTANOVA/docs/produit/2026-11-24-refonte-site-public/README.md`.
