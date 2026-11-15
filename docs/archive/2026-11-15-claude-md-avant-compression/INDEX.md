# Le `CLAUDE.md` d'avant la compression (15/11/2026)

**Pourquoi** : le `CLAUDE.md` de ce dépôt pesait 140 Ko, relus à chaque session (consigne du fondateur du 15/11/2026 : moins de 15 Ko). Il ne garde plus que l'état actuel, l'architecture et les règles actives. **Rien n'est perdu** : le fichier complet est ici, identique octet pour octet à celui du commit `3b9619c` (`CLAUDE-avant-compression.md`, SHA-256 `5043858924d7c27402510be0668ff7015a0d6640a566457c3ae186608c8666ec`).

**Comment s'en servir** : chercher le pourquoi d'une règle, ou le détail d'une livraison, par le nom de son ticket (`grep -n "ticket 147" CLAUDE-avant-compression.md`). Une règle de ce fichier qui contredit le `CLAUDE.md` actuel est périmée.

## Ce qu'il contient, section par section

| Section | Sujet |
| --- | --- |
| Où on en est, Lancer, Vérifier, Architecture, Ports, La base, Secrets | Repris en bref dans `CLAUDE.md` |
| Système de design | Repris ; **périmé** : « Tailwind et shadcn ne sont pas encore branchés » (vrai jusqu'à la refonte v2, PR 175 du 15/11) |
| Santé des envois (77) | Le journal des téléphones dans l'administration, `expliquerCode`, période de 7 jours |
| Une décision dit toujours quoi faire (80) | Message obligatoire avec le motif « autre », écrit trois fois identique |
| Le tableau de bord de validation (audit du 06/11) | Barre de décision collée, filtres de la file, corbeille à trois niveaux, onglet Zones (renommer, supprimer une zone vide, communes sur la carte) |
| La photo publique d'une école (07/11) | Trois modes (automatique, choix, retrait), « retirer » = choix nul |
| La vue d'ensemble de l'administration (76) | `admin_overview`, aucun objectif affiché, « relais actif » |
| Cocher les séries, le repère (08/11) | Séries et filières en puces, domaines copiés dans le téléphone, plus d'état vide négatif |
| Premiers pas du relais (79), Sauvegarde (81), Comptes en attente (78) | Tests du téléphone sans envoi ; sauvegarde chiffrée de chaque nuit ; adresse de connexion dans `prive` |
| Accepter une correction (89), Fiches renvoyées (92), Le contact (94), Avant d'accepter (95), Plusieurs personnes (96) | Les règles de « À valider » : héritage de la fiche d'origine, encart « Avant d'accepter », numéro de l'enseigne vérifié sur la photo, trois personnes par fiche |
| Carte de position et position bloquée (72) | Tuiles d'OpenStreetMap en SVG, aide propre à chaque téléphone |
| Carte détourée (15), données de la carte (102, 113), fond de carte (114), carte interactive (103) | Dessin de repli, GeoJSON construits avec le site, PMTiles sur R2, MapLibre, signe d'attente, une seule ligne d'école |
| Fiche d'école v2, relevé v2, missions, lots F à I, administration v2 (ticket 165, 13/11) | Le détail des livraisons du 13/11 (le journal de l'administration : `docs/avancement-admin-v2.md`) |
| Rangement du site public (146), identifiant des écoles (147), pages de transparence (149), guide du relais (110) | Menu, renvois, `sitemap.xml`, favicon, numéro à six chiffres, Méthode, Données, Confidentialité, ODbL, schema.org, guide sans paiement |
| Budgets, Budget GitHub Actions, Mise en ligne, Une tâche = un ticket, Git, Pièges | Repris en bref dans `CLAUDE.md` |
| Contact public, frais déclarés, équipements, origine déclarée (104), agrément, mot, inscriptions (148), photo d'enseigne (19) | Les règles de chaque rubrique de la fiche admin et de sa page publique |
