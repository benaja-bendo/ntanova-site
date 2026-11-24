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

## Lot 3B1 — base privée des messages (ticket 215, PR 216, intégré le 24/11/2026 : `034c887`)

Le socle de Contact et de l'annuaire : stockage privé, droits, reprise sans doublon, bornes, clôture, purge, file d'annonces. **Aucun écran, aucun formulaire, aucun envoi possible, rien d'appliqué en ligne.** Contrat : dépôt `ntanova`, `CONTRAT-LOT-03A.md`, dont le §19 prévaut. Carte complète : `supabase/schema.md`, « Les messages reçus ».

| Pièce | Règle |
| --- | --- |
| Migrations | `20261124140000` à `140400`, additives ; le site en ligne ne lit rien d'elles. La dernière, propre à Supabase, installe `pg_cron` et planifie la purge : **son `db push` est un ordre séparé**. Les appliquer n'ouvre rien : sans secret d'envoi, aucun laissez-passer ; ouvrir est un geste de la recette (`prive.renew_public_request_secret()`) |
| Envoi | la page demande `issue_public_request_pass` (clé, heure du serveur, sceau), puis envoie `send_public_request` en **POST JSON, par `fetch`**, jamais par `.rpc` nommé : le corps est le paramètre. Réponses : `{ code, reference }` |
| Reprise | même contenu, même `revision` ; `revisionDeLEnvoi` l'incrémente dès que le contenu change. `lireIssue` : un code inconnu ou une référence absente n'est jamais « enregistré » |
| Modèle | `src/modele/demandes.ts`, sans réseau ; l'adaptateur du lot 3B2 traduira les noms de champs (`tests/unitaires/demandes.test.ts` en garde la table) |
| Horloge | celle de la base ; les tests passent la leur aux fonctions privées `*_at` |
| Bornes | valeurs de départ dans `prive.public_request_settings`, changées par migration ; **la borne par connexion est écrite et éprouvée mais inactive** tant qu'aucun en-tête n'est constaté infalsifiable |
| Restauration | procédure manuelle (`supabase/schema.md`, « Restaurer sans faire réapparaître une information retirée »), sans moteur ni écran |

Écarts avec le contrat, tous techniques : un seul paramètre JSON sans nom pour l'envoi (un caractère impossible recopiait un bout du message dans le journal) ; deux planifications au lieu d'une (la purge ne dépend pas de la taille du journal) ; « déjà enregistrée » ne vaut pas pour un ancien texte remplacé depuis ; un indésirable décidé à la main compte ses 30 jours depuis ce geste ; une purge à la fois (deux s'interbloquaient) ; pas de secret d'envoi au départ (les migrations seules n'ouvrent pas la porte). Cas 55 à 60 du contrat exclus par le §19.

Reste à 3B2 : le port, l'adaptateur et le faux serveur, les écrans « Messages reçus » et retraits, le service d'annonce (non déployé), et deux constats en ligne sur ordre : l'en-tête d'adresse, le port 465.

**Revue du 24/11** : un interblocage supplémentaire entre « Relancer l'annonce » et la purge a été reproduit par un test déterministe, puis corrigé dans la même branche. Les deux opérations verrouillent le message avant l'annonce ; la purge laisse le message en cours de relance pour son prochain passage. Le calcul du sceau est déclaré `stable` conformément à sa dépendance `convert_to`. Aucun écran ni envoi n'est activé par ces corrections.

## Lot 3B2 — administration « Messages reçus » et alerte préparée (ticket 217, PR vers `refonte/site-public`, à relire)

La boîte de Contact et de l'annuaire dans l'administration, les retraits par étapes, et le service d'alerte **préparé, pas déployé**. Aucun formulaire public (3C), rien d'appliqué en ligne, aucun secret, aucun courrier. Planches : canevas admin, « Messages reçus » et « Retraits » ; règles du 24/11 sur sa page « Règles ».

| Pièce | Règle |
| --- | --- |
| Adresses | `#demandes/<file>` et `#demandes/<référence>[/<file>]` ; le lien d'une alerte n'a que la référence, et la connexion dit ce qu'elle va ouvrir |
| Navigation | une entrée sur ordinateur ; sur téléphone, dans « Plus » (les cinq cases du bas ne changent pas) ; une carte dans Aujourd'hui, distincte de « Les familles demandent » |
| Lire | lister n'ouvre rien, rien n'est présélectionné ; **ouvrir fige**. Vide, chargement et panne ne se confondent pas ; un message effacé se dit |
| Gestes | chacun porte le `row_version` lu. Conflit : rien n'est écrasé, la saisie reste, il faut relire, rien ne se réapplique seul. Refus de la base : « n'est pas enregistré », avec sa phrase. Sans réponse : « n'est pas confirmé », et réessayer n'écrit jamais deux fois |
| Répondre | ouvrir WhatsApp ou le courrier n'envoie rien et ne note rien ; le jour réel se choisit, jamais coché d'avance, jamais futur |
| Retrait | six étapes ; la base refuse « retiré » tant qu'elle publie encore la cible ; la mise en ligne est une consigne et une date ; deux constats, un par adresse |
| Code | `modele/messages-recus.ts` (types, `PortMessages`, libellés, règles), `infra/supabase/messages.ts` (codes → `ErreurConflit`, `ErreurAcces`, `ErreurSession`, `ErreurIntrouvable`, `ErreurDecision`, `ErreurReseau` ; 15 s), `infra/faux/messages.ts` (scénario `admin`), `app/admin/MessagesRecus.tsx`, `Message*.tsx`, `RetraitEtapes.tsx`, `geste-message.ts` |
| Alerte | `supabase/functions/alerte-messages/`, sans dépendance ; la sonnette vit dans `ntanova_supabase`, hors du cœur. Activer ou couper : `supabase/schema.md`, « Activer l'alerte e-mail » |
| Essais | 73 unitaires, `messages_administration` (36) et la sonnette dans `supabase_couche`, `messages-recus.spec.ts` (12 parcours, un aux trois largeurs : 14 exécutions). Les captures : `playwright.messages.config.ts` (à l'œil, hors CI) |

Écarts avec les planches, tous assumés : « Ce geste n'est pas confirmé » quand le réseau se tait (la planche disait « pas enregistré », ce qui serait faux si la base avait écrit) ; « Contact » nomme la nature, « Message » restant le nom commun ; « Clos » sur les onglets ; deux jours de constat au lieu de deux cases ; cibler puis noter « retiré » en deux temps (le retrait se fait entre les deux, dans Écoles) ; répondre et noter dans un seul tiroir ; pas de ligne libre à la réponse (la base n'en garde pas) ; « mettre en attente » vaut aussi pour un retrait ; une file « Alertes en échec » pour relancer sans ouvrir.

**Reste à la recette, sur ordre** : constater le port 465 depuis une fonction en ligne ; constater l'en-tête d'adresse réellement reçu avant de le nommer (`trusted_connection_header` reste nul) ; l'écran sur un vrai téléphone ; l'ouverture du lien d'une alerte depuis un vrai courrier. **Constat à part** : une cinquantaine de migrations plus anciennes lèvent `P0002`, que PostgREST 14 rend en 500 en local ; à vérifier en ligne avant d'en faire un lot.

**Reste à 3C** : les formulaires publics Contact et annuaire, leur envoi et leurs reprises, la page Confidentialité.

**Correctifs de revue du 24/11** : « Relancer maintenant » parcourt toutes les pages d’alertes, y compris après la deux-centième ; une interruption indique les relances déjà confirmées. Le délai global de 100 secondes de l’alerte couvre aussi les appels de confirmation et coupe le réseau SMTP ; les baux non confirmés restent repris au passage suivant. Les deux défauts ont été reproduits avant correction. Le service Edge entre dans le lint existant, sans nouveau workflow. La boîte de courrier existante suffit, aucune nouvelle adresse à créer.

## Lot 3C — formulaires Contact et annuaire (ticket 219, PR vers `refonte/site-public`, à relire)

`/contact/` et `/contribuer/` fonctionnent sur le faux serveur et sur la base locale, de la saisie à la clôture dans « Messages reçus ». **Fermés par défaut** : aucun lien public n'y mène, aucune migration, rien d'appliqué en ligne, aucun secret, aucun courrier. Planches : canevas public, « Contact », « Annuaire » et « Contact · reprise et refus » ; contrat 3A, dont le §19 prévaut.

| Pièce | Règle |
| --- | --- |
| Pages | Astro, HTML et CSS du site (`src/ui/formulaires/`), sans React ni pièce de l'administration ; quatre natures : contact, école absente, erreur, retrait. Rien de coché d'avance, le facultatif le reste ; l'erreur sous le champ (`aria-invalid`, `aria-describedby`) et dans un résumé qui prend le focus. Sans JavaScript ou sans adresse de base : aucun formulaire, la page l'explique et propose WhatsApp |
| Script | `app/formulaires/formulaire.ts`, natif, partagé ; frontière ESLint : ni `infra`, ni Supabase, ni React, il reçoit son port de la page. `pnpm poids` pèse tout le JavaScript de chaque page, imports statiques et à la demande suivis : 10 Ko gzip au plus (9,4 Ko sur la construction des parcours, 9,1 Ko sans faux serveur) |
| Port, adaptateur, faux serveur | `modele/envoi-public.ts` (port `PortDemandes`, brouillon, arrivée), `infra/demandes-publiques.ts` (réexporté par `infra/index.ts`, que `astro.config.mjs` déclare sans effet à la lecture : la page n'emporte rien d'autre), `infra/supabase/demandes-publiques.ts` : `issue_public_request_pass`, puis `send_public_request` en **POST JSON brut par `fetch`**. `55000` et `PGRST202` disent « envois fermés », quel que soit le numéro HTTP (la pile locale rend 500) ; 15 s sans réponse : « pas confirmé ». `infra/faux/demandes-publiques.ts` applique les mêmes règles dans la fausse boîte de l'administration |
| Envoi | un seul envoi en vol ; aucun renvoi automatique ; « enregistré » seulement avec une référence lue par `lireIssue`. Coupure avant ou après réception : « pas confirmé », texte, clé et révision gardés. Texte modifié : nouvelle révision ; après ouverture, une suite reliée ; un ancien texte arrivé tard ne prétend rien remplacer. « Envoyer comme nouveau message » demande une confirmation et une clé neuve. Chaque refus garde la saisie et propose le geste utile |
| Brouillon | `sessionStorage` seulement, 24 h après la dernière saisie, reprise proposée au rechargement ; une clé par nature et par fiche ; effacé après confirmation, au geste « Effacer » ou à l'expiration. Stockage refusé : l'envoi marche et la page le dit |
| Arrivées | `modele/liens-demandes.ts` : `type`, `sujet`, `ecole` (numéro public) et `depuis` (origine de la liste fermée), rien d'autre. La fiche se relit dans `/contribuer/fiche/<numéro>.json`, construit pour les seules fiches publiées (`noindex`) ; une fiche inconnue ou retirée depuis fait écrire son nom, sans rien révéler |
| Réglage | `PUBLIC_FORMULAIRES` (`fermes` par défaut, `ouverts`). Fermé : chaque porte reste sur WhatsApp, les deux pages sont en `noindex`, hors du plan du site et de `llms.txt`. Ouvert : l'accueil, « Les écoles », les pages de lieu, la fiche, le pied, Pour les écoles, Fiabilité et Confidentialité y mènent. L'ouvrir est un geste de la recette ; les envois attendent en plus le secret de la base |

**Confidentialité, à relire par une personne avant la production** (`src/pages/confidentialite.astro`, texte du 24 novembre 2026). Ne paraissent qu'avec les formulaires ouverts : « Vos messages par un formulaire du site » (base privée, réponse par une personne, effacés 12 mois après la clôture, 30 jours pour un indésirable, sauvegardes jusqu'à 30 jours de plus) ; « Nos échanges sur WhatsApp ou par e-mail », hors de l'effacement automatique, durée à fixer ; l'hébergement des messages (Supabase, Paris) ; « Quand vous nous écrivez » (le brouillon d'onglet, 24 h au plus). Paraissent dans les deux positions, selon le §19 : « en montrant que vous êtes concerné » et « nous ne demandons pas de pièce d'identité par défaut » (choix 1) ; le retrait dans la base sous 7 jours, la mise en ligne **demandée** sans attendre et le résultat annoncé une fois constaté (choix 2). Rien n'annonce l'adresse IP de qui écrit : la borne par connexion reste inactive.

**Preuves** : unitaires (modèle, adaptateur, faux serveur, portes) ; `pnpm test:constructions`, à la main : 9 contrôles sur quatre constructions entières du faux catalogue, le réglage fermé puis ouvert, et un retrait de bout en bout (cas 35), avant puis après, cherché dans chaque fichier produit (fiche, listes et lieux, recherche, carte, photos et images, partage, `sitemap.xml`, `llms.txt`), sous plusieurs écritures ; `pnpm test:api-locale`, à la main, sur la pile locale seulement : 9 contrôles, dont 55000 en HTTP 500 quand les envois sont fermés ; `formulaires-publics.spec.ts` : 33 parcours, dont trois aux trois largeurs (clavier et focus de Contact et de l'annuaire, débordements et cibles). Captures : `playwright.formulaires.config.ts`, 16 écrans à 360, 390, 768 et 1 440 px, dans `captures/formulaires/` (hors git).

**Trouvés et corrigés pendant le lot** : les données structurées d'une fiche (`donneesEcole`) publiaient le numéro de l'enseigne même quand la fiche montre à sa place le contact autorisé par la direction ; elles écrivent désormais le numéro que la fiche montre (défaut antérieur, révélé par la preuve du retrait). À 360 px, le numéro masqué de la confirmation se coupait après « 06 » (insécable désormais) et une adresse e-mail sans tiret sortait de l'écran. Chaque défaut a son test, vu échouer avant le correctif.

Écarts avec les planches, assumés : la reprise dit « Effacer et recommencer » (la planche : « Effacer ») ; « Est déjà enregistrée : <référence> » sans l'heure de la version, que la page ne connaît pas avec certitude ; au plafond du jour, « Réessayer » s'ajoute à « Copier mon texte » ; la phrase du brouillon est dans l'encadré sous le formulaire, avec la confidentialité.

**Reste à la recette, sur ordre** : ouvrir le réglage et poser le secret d'envoi (après `db push`), un vrai téléphone et un lecteur d'écran, la relecture humaine de la confidentialité. Constat à part : en production, la page charge encore l'aide au préchargement de Vite (880 octets) qu'aucun import n'utilise ; compté dans le budget.

## Contrôles et livraison

Suivre `CLAUDE.md` : contrôles locaux sur le faux catalogue, dont `pnpm verif:ci` et les parcours pertinents, puis CI de la dernière révision. Aucun workflow supplémentaire, aucune répétition identique de CI. Ne pas remplacer la construction locale du fondateur par une construction isolée sur les vraies données.

Le workflow existant autorise l'essai depuis une branche et la production depuis `main`. La recette finale crée une PR globale ; le fondateur donne ensuite l'ordre de livraison. Un tag marque la base, un autre marquera le commit effectivement livré. Un correctif urgent de `main` est reporté dans l'intégration avant de poursuivre les lots.

Un agent termine avec ticket, PR, base, SHA, contrôles, captures, limites et état local/distant. Il s'arrête après le seul lot lancé ; il ne propose pas automatiquement une suite.

Plan détaillé et prompt commun à Claude/GPT : `~/Desktop/NTANOVA/docs/produit/2026-11-24-refonte-site-public/README.md`.

## Revue et fusion par le fondateur (24/11/2026)

Le fondateur garde désormais la fusion : l’agent de code termine son lot avec une PR vérifiée et ouverte vers `refonte/site-public`, puis une autre session fait la revue. Les corrections reviennent sur la branche de cette PR. L’agent ne fusionne pas et ne ferme pas le ticket avant la fusion constatée. Cette consigne remplace la fusion automatique de fin de tâche décrite plus haut. Le lot suivant commence après la fusion du précédent, depuis le dernier `origin/refonte/site-public`.

La revue de la PR 212 a conduit à deux corrections : « Exemple » accompagne le dernier mot du nom fictif, dans l’accueil et la démonstration ; chaque lien du pied possède une cible de 44 px sans chevaucher le suivant, à la souris comme au doigt. Les parcours de régression ont d’abord reproduit les défauts. Aucun déploiement ni changement de base n’accompagne ces corrections.

État au 24/11 : les lots 1 et 2 sont intégrés à `refonte/site-public` (PR 212 et 214, CI verte sur leur dernière révision), aucun n’est en production. Leurs tickets sont fermés et leurs branches courtes supprimées. Le lot suivant part du dernier `origin/refonte/site-public`.
