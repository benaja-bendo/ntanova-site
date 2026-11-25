# Refonte publique — circuit technique du 24/11/2026

Le fondateur demande une livraison unique, construite par lots courts. Ce document fixe le circuit de code ; les réflexions produit restent dans le dépôt `ntanova`.

## Revue finale du 25 novembre 2026

Le fondateur autorise la fusion globale et la production après revue (PR 228). Dernier correctif : les textes de Fiabilité, Confidentialité, Pour les écoles et des photos distinguent les personnes présentes sur les lieux d'une affiche ou illustration déjà présente sur l'enseigne. Cette précision applique son choix daté de conserver l'enseigne ; aucun contrôle, accord, droit, média ou objet de base n'est modifié. La légende d'une photo renvoie aux mêmes règles. Le parcours existant de Fiabilité est adapté, sans nouveau fichier de tests.

Les preuves de livraison et l'état final sont consignés dans `REVUE-LOT-07.md` du dépôt documentaire. La déclaration CNPD reste à faire, selon le choix consigné du fondateur ; la publication ne la remplace pas. L'en-tête de connexion reste non éprouvé et sa borne inactive. La vision d'une fiche d'école pouvant servir de site vitrine est une suite à cadrer, sans fonctionnalité supplémentaire dans cette livraison.

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

## Lot 3B2 — administration « Messages reçus » et alerte préparée (ticket 217, PR 218, intégré le 24/11/2026 : `1a94e52`)

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

## Lot 3C — formulaires Contact et annuaire (ticket 219, PR 220, intégré le 24/11/2026 : `d226c24`)

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

**Revue du 24/11** : « Effacer ce que j’ai écrit » est indisponible pendant le vol, et son gestionnaire refuse aussi un événement déjà en attente : une coupure garde le texte, la clé et la révision pour retrouver la réception sans doublon. « Copier mon texte » rappelle aussi le type d’information à retirer, sans recopier la coordonnée de réponse. Les deux défauts ont été reproduits par des parcours avant correction.

Écarts avec les planches, assumés : la reprise dit « Effacer et recommencer » (la planche : « Effacer ») ; « Est déjà enregistrée : <référence> » sans l'heure de la version, que la page ne connaît pas avec certitude ; au plafond du jour, « Réessayer » s'ajoute à « Copier mon texte » ; la phrase du brouillon est dans l'encadré sous le formulaire, avec la confidentialité.

**Reste à la recette, sur ordre** : ouvrir le réglage et poser le secret d'envoi (après `db push`), un vrai téléphone et un lecteur d'écran, la relecture humaine de la confidentialité. Constat à part : en production, la page charge encore l'aide au préchargement de Vite (880 octets) qu'aucun import n'utilise ; compté dans le budget.

## Lot 4 — confiance et découverte (ticket 221, PR 222, intégré le 25/11/2026 : `a0bdd6c`)

Fiabilité des informations (`/methode/`), Données de l'annuaire (`/donnees/`), À propos (`/a-propos/`), Toutes les villes (`/villes/`, nouvelle) et une seule grammaire des mentions datées. Aucun SQL, aucun droit changé, rien d'appliqué en ligne, formulaires toujours fermés par défaut. Planches lues le 24/11 dans le lecteur publié du canevas public (version `1795558497-161f`) : `P-methode-ordi/tel` (`4e274a70`, `786856a8`), `P-villes-ordi/tel` (`b861b582`, `de9ead2f`), `P-apropos-ordi/tel` (`e7c6ec8b`, `11dd032e`), `P-fiche-ordi/tel` (`f3c4979d`, `9fd5de86`), livrables `P-L2-textes` (`4563c251`) et `P-L3-liens` (`74c87f16`) ; page Règles du canevas admin (`19160520`). Débuts d'empreintes SHA-256 ; les générateurs Python du dépôt `ntanova` n'ont pas été rejoués.

| Pièce | Règle |
| --- | --- |
| Mentions | `modele/mentions.ts` : `mentionsDe` (les mentions d'une fiche, coexistantes, chacune avec son jour au Congo ; « Ajoutée par NTanova » sans date), `SENS_DES_MENTIONS` (une phrase par mention, sans hiérarchie), `LIEN_MENTIONS` = `/methode/#m-mentions`, comptes et dates. `preuvesDeLaFiche` (fiche réelle) en dérive sans changer son rendu ; `MentionDatee.astro` (la pastille de la fiche, icône comprise) sert l'accueil, la démonstration, Fiabilité et Données. Chaque lien d'explication mène à `#m-mentions` |
| Fiabilité | six sections et six ancres (`#m-entrees`, `#m-mentions`, `#m-champs`, `#m-photos`, `#m-frais`, `#m-corriger`) ; les anciennes ancres restent sur un titre ou une ligne (`#mentions`, `#informations`, `#position`, `#references`, `#jamais-achete`, `#dater-corriger`, `#limites`). Le tableau « champ par champ » s'empile sur téléphone (`data-l`, rôles ARIA gardés) |
| Données | les mentions comptées côte à côte (une fiche vue puis confirmée compte dans les deux ; « Sur N fiches confirmées, M sont aussi vues sur place ») ; trois dates distinctes : construction, dates des mentions (plus ancienne, plus récente, fiches sans jour), dernière modification ; « fiches par jour de mention » (une fiche compte à chacun de ses jours). Ancres d'avant gardées (`#preuves` sur le titre des mentions) |
| À propos | `modele/perimetre.ts` : fiches, villes (celles de l'accueil), fiches du supérieur, depuis le catalogue ; prestations et outils « En préparation » ; anciennes ancres gardées (`#ce-que-nous-faisons`, `#ce-que-nous-publions`, `#transparence`) |
| Villes | `modele/villes.ts` (`pageDesVilles`) : les villes de `villesDeLAccueil` (mêmes nombres que l'accueil et la page du lieu), leur département lu dans le référentiel, leurs arrondissements en liens ; les lieux de niveau 2 sans fiche en texte, avec leur département. Recherche : formulaire GET `ou` vers `/ecoles/`, `required` et `pattern` natifs, aucun script. `DessinCongo` prend `seul` (sans étiquettes ni famille, sur fond clair) |
| Entrées | le pied dit « Toutes les villes » à la place de la liste des villes (planche) ; `src/middleware.ts` et `Astro.locals` n'ont plus d'usage et sont retirés ; l'accueil ajoute « Voir toutes les villes » ; `/villes/` entre dans `sitemap.xml` et `llms.txt` |
| Portes | `porte` et `ContactNtanova` : Fiabilité (`erreur`, `fiabilite`), Villes (`manque`, `villes`), À propos (`contact`, `direct`), Données (`contact`, sujet `donnees`, `direct`) ; aucun code d'origine ajouté. Fermé : WhatsApp ; ouvert : le formulaire |
| Dessins | `public/dessins/methode-relais.svg`, `mention-{terrain,ecole,ajoutee,direction}.svg`, `a-propos-personnages.svg`, copiés des originaux du canevas, coordonnées arrondies au dixième ; décoratifs (`alt=""`) |
| Styles | `src/ui/confiance.css` (préfixe `cf-`), importé par les quatre pages ; `.etiquette-disponible` rejoint « Exemple » et « En préparation » dans `public.css` |

**Trouvés et corrigés pendant le lot** : « N fiches ont une photo publique » ne comptait que la photo d'enseigne, pas la couverture ni la galerie (test vu échouer avant le correctif) ; deux nombres collés à leur mot pour un lecteur d'écran (« 9fiches publiées »), repérés par les parcours.

**Écarts avec les planches, retenus** :

- Photos : la planche dit « couverture choisie et galerie : avec l'accord daté de l'école ». La base ne garde pas cet accord (`campus_media` n'a qu'un contrôle « sans enfant » et `is_public`) : la page dit le contrôle, les douze images au plus, le retrait sur demande et les photos jamais publiées, sans promettre l'accord. « Nette, sans donnée personnelle » n'est demandé qu'à la photo d'enseigne (`PhotoPublique.tsx`) ; la page dit le contrôle exigé de chaque image : « sans enfant ni personne reconnaissable ». **Besoin de base exposé à part** : si l'accord daté doit devenir une règle, il lui faut une colonne et un geste d'administration, puis une ligne de Fiabilité.
- « Pas encore de fiche » : la planche liste les chefs-lieux des départements. Le référentiel n'a pas de marque de chef-lieu : la page liste les lieux de niveau 2 connus de la base (d'après la migration d'amorçage : les chefs-lieux et deux districts de Brazzaville et Pointe-Noire ; la base en ligne n'a pas été relue), sous « D'autres villes, communes et districts que connaît l'annuaire ».
- Le pied ne nomme plus chaque ville (planche) ; elles restent à un geste par « Toutes les villes ».
- Les mentions de Fiabilité sont les pastilles de la fiche (icône et contour), pas les ronds de couleur de la planche : une seule grammaire. Leurs phrases sont plus courtes que la planche et ne disent pas « personne n'est encore passé » pour une fiche déclarée (une déclaration peut coexister avec un passage).
- « Prestation de communication » : décrite au futur, avec « En préparation » ; « Ajout documenté par l'équipe » devient « Ajout par l'équipe » et « L'équipe a ajouté la fiche » : la base ne garde pas la source de l'ajout, aucune mention n'en promet une.
- À propos : « qui fait NTanova » et « qui finance NTanova aujourd'hui » (crochets de la planche) sont omis ; « 22 établissements du supérieur » devient « N fiches du supérieur » (une fiche est un site, pas un établissement).

**À relire par une personne avant la production** : les deux textes personnels d'À propos, s'ils doivent paraître (fondateur) ; le modèle économique (« Des écoles pourront payer des services. Jamais leur place. ») et la prestation de communication, repris de la planche ; la phrase de retrait de Fiabilité, alignée sur Confidentialité (§19, choix 2).

**Preuves** : unitaires `mentions.test.ts`, `villes.test.ts`, `statistiques-ouvertes.test.ts` (réécrit), `pages-de-confiance.test.ts` ; parcours `villes.spec.ts` (entrées, nombres égaux aux pages de destination, lieu sans fiche sans lien, recherche jusqu'aux résultats et à zéro, clavier, ancres sans script, liens des mentions), `accueil.spec.ts` (démonstration hors des index), `pages-de-confiance.spec.ts` (Fiabilité et Données réécrits sur les planches), `mise-en-page.spec.ts` (`/villes/` aux trois largeurs, tableau empilé) ; `pnpm test:constructions` étendu : liens ouverts de `/villes/`, À propos et Données, et le retrait qui sort aussi de `/villes/` et des compteurs. Captures : `playwright.confiance.config.ts`, sept écrans à 360, 390, 768 et 1 440 px dans `captures/confiance/` (hors git).

### Entretien des tests du 25/11/2026 (complément à la PR 222)

À la demande du fondateur, les consignes de `CLAUDE.md` (aussi lues par Codex via le lien `AGENTS.md`) exigent désormais une couverture proportionnée au risque, la recherche des tests existants avant ajout et une justification des suppressions. Le modèle de PR rappelle ces points. Les contrôles de sécurité, de droits, d'accord daté, de collecte hors ligne et d'envoi sans doublon restent prioritaires.

Le nettoyage part de `699f7c9`, dont la CI est verte. Aucun code produit, SQL, adaptateur ou workflow n'est modifié. Les suppressions et regroupements ont chacun leur protection conservée :

| Allègement | Protection conservée |
| --- | --- |
| 21 parcours de partage regroupés avec la visite de la même page dans `public.spec.ts` | Toutes les pages précédentes gardent leurs contrôles HTML, ressources et cibles ; titre, description, adresse OpenGraph, réponse PNG et poids de l'image sont vérifiés lors de la même visite |
| 14 parcours de largeur du cadre regroupés avec la lisibilité dans `mise-en-page.spec.ts` | Les mêmes pages et largeurs gardent les contrôles de débordement, cibles, textes, cadre et largeur des paragraphes |
| Doublon de la démonstration retiré de `villes.spec.ts` | `accueil.spec.ts` contrôle déjà les trois index, l'absence de la fiche fictive dans la recherche et le résultat de la recherche du nom |
| Ancien parcours À propos/Confidentialité retiré de `public.spec.ts` | Ses assertions rejoignent les visites existantes dans `ecoles-et-directions.spec.ts` (périmètre, aucune loi sur À propos) et `pages-de-confiance.spec.ts` (titre et loi dans Confidentialité) |
| Lectures de la syntaxe des liens et existence des fichiers de pages retirées de `pages-de-confiance.test.ts` | Les parcours vérifient les pages construites, leurs index et les liens des mentions depuis la fiche, la démonstration et l'accueil |
| Lecture du nom `ICONES_SITE` dans le gabarit retirée de `icones-site.test.ts` | `public.spec.ts` compare les balises réellement servies au contrat des icônes ; les unitaires gardent les formats et dimensions des fichiers |
| Recherche littérale de `MENTION_ODBL` et existence des fichiers de routes retirées des unitaires de carte | `pages-de-confiance.spec.ts` et `public.spec.ts` lisent les GeoJSON servis ; les unitaires gardent les adresses, le style, les données et la licence |

La liste passe de 632 à 595 exécutions de parcours (573 téléphone, 11 tablette, 11 ordinateur), avec les 14 parcours critiques toujours présents. Les deux partitions existantes couvrent ces 595 exécutions sans perte ni doublon. Cette baisse compte les regroupements, elle ne mesure pas une baisse de couverture ni un gain de durée garanti. Les essais d'API locale et de constructions restent à lancer pour les changements qui touchent leurs contrats ; ils ne sont pas remplacés par le faux serveur.

Vérifications locales de cet entretien : `pnpm verif:ci` réussi (format, lint, couleurs, types, 1 762 unitaires dans 122 fichiers, construction et poids), puis suite navigateur complète avec deux workers : 587 réussites, 8 sauts existants, aucun échec ni test instable, en 5 min 33. Les 14 parcours critiques sont identiques avant/après ; `node outils/verification-ci.ts partitions` confirme 298 + 297 exécutions. Base et essais d'API locale/constructions non rejoués : aucun code produit ni contrat n'a changé. La CI de la révision poussée reste la validation distante requise.

## Lot 5 — Pour les écoles et outils en préparation (ticket 223, PR 224, intégré le 25/11/2026 : `0d30a92`)

`/pour-les-ecoles/` refaite et `/pour-les-ecoles/outils/` (nouvelle). Aucun SQL, aucun droit changé, aucun script, rien d'appliqué en ligne, formulaires toujours fermés par défaut ; **aucun logiciel, compte, table, notification ou fournisseur**. Planches lues le 25/11 dans les fichiers publiés du canevas public (version `1795563959-92cd`), état Aujourd'hui : `P-ecoles-ordi/tel` (`f05dc878`, `fed98be1`), `P-outils-ordi/tel` (`a738ebb9`, `70a88c2d`), livrables `P-L2-textes` (`4563c251`), `P-L3-liens` (`74c87f16`), `P-L4` (`15473f8c`) ; page Règles du canevas admin (`af27af20`, `19160520`). Débuts d'empreintes SHA-256 ; les générateurs Python n'ont pas été rejoués, aucun canevas modifié.

| Pièce | Règle |
| --- | --- |
| Retrouver sa fiche | formulaire GET `q` vers `/ecoles/`, `required` et `pattern` natifs, aucun script : la liste existante dit zéro, une ou plusieurs fiches. Le texte cherché n'entre dans aucune adresse de formulaire ni message WhatsApp |
| Code de liaison | quatre chiffres (`pattern`, `maxlength`), GET vers `wa.me` (`text`) : le code s'écrit dans un message que la personne envoie. Ni mot de passe, ni accès, ni confirmation ; aucun service d'authentification |
| États | `modele/services-ecoles.ts` : trois besoins, leurs services, trois libellés ; `EtatService.astro`. « À l'essai » ne paraît que dans la légende ; la phrase « Aucun service n'est à l'essai » se règle sur la liste |
| Démarches | `porte` et `LienPorte.astro` : corriger (`erreur`), retirer (`retrait`), ajouter (`manque`), écrire (`contact`, sujet `ecole`), raconter (`contact`, sujet `outils`), origine `pour-les-ecoles` ; sur la page Outils, origine `outils`. Aucun code ajouté, aucun numéro de fiche transmis (la page n'en connaît pas). **Confirmer la fiche, confirmer les frais, photos et contact, mot de la direction : WhatsApp, formulaires ouverts ou non**, quatre messages distincts |
| Accords | agir pour l'école, confirmer la fiche, publier les tarifs : trois gestes ; « Ouvrir WhatsApp n'enregistre aucun accord et ne prouve pas qui écrit » |
| Ancres | `#referencer` (sur « Ajouter mon école », toujours visible), `#e-fiche`, `#e-com`, `#e-outils` ; `#ou-exemple` sur Outils |
| Outils | une présentation : ni formulaire, ni bouton, ni champ. Portes d'entrée, droits, corrections, export, années, transmission : au conditionnel ou « règles que nous nous fixons », « Rien n'en est construit » ; conservation « à régler » avant tout essai, aucune durée |
| Exemple 016 | `modele/exemple-outils.ts` : un objet, quatre récits (tableau, chronologie, reçu, aperçu famille) ; 30 000 dus, 20 000 versés (15 000 puis 5 000), 10 000 restants ; le 018 confirmé sur dérogation sans versement. Vrai texte, « Exemple » sur la ligne du nom, hors recherche, carte, plan et `llms.txt` |
| Entrées | pied « Outils en préparation » ; accueil : « Inscriptions, frais et reçus » devient un lien, l'étiquette reste du texte ; `/pour-les-ecoles/outils/` dans `sitemap.xml` et `llms.txt` |
| Dessins | `outils-guichet`, `outil-inscriptions`, `outil-recus`, copiés du canevas, coordonnées arrondies ; `ecole-directrice` et `demo-facade` réutilisés |

Phrases de l'ancienne page retirées parce que fausses : « Rien n'est ajouté à la fiche sans votre accord » (l'enseigne, sa photo et son numéro se voient de la rue ; la question « Que publiez-vous sans notre accord ? » le dit) ; « Les photos ne sont pas encore publiées par cette démarche » ; confirmer la fiche et autoriser les frais dits d'un même geste.

**Ajusté pendant le lot** : la règle des liens de `confiance.css` (`li a`) laisse `cf-lien` tranquille, pour qu'une icône et son texte restent sur une ligne ; « (ouvre WhatsApp) » était collé au mot d'avant pour un lecteur d'écran, vu par le parcours des mots collés étendu aux deux pages.

**Écarts avec les planches, retenus** :

- Recherche : la planche simule chargement, vide et trouvé dans la page ; ici la liste réelle répond. Sans JavaScript, `/ecoles/` ne filtre pas (limite existante) et propose les villes.
- « Publier la fiche » devient « Confirmer la fiche » : la fiche paraît après relecture de l'équipe, sans accord ; l'accord de la direction la confirme. « Confirmer sa fiche » est ajoutée aux services et a son bouton, absent de la planche.
- Photos : « Elles paraissent avec votre accord » n'est pas repris (aucun accord daté par image dans la base) ; le contrôle exigé est dit, avec les mots de Fiabilité.
- « Avec le formulaire de correction » se dit seulement quand les formulaires sont ouverts ; fermés : « Sur WhatsApp ».
- Deux ajouts utiles : « Faire retirer une information », et le bloc « Votre école n'est pas encore sur NTanova ? » qui garde `#referencer` visible (la planche n'a qu'une question repliée).
- Le mot de la direction a sa carte et sa démarche ; la prestation de communication est au conditionnel.
- « Au 23 nov. 2026, aucun service n'est à l'essai » perd sa date : recalculée à chaque construction, elle dirait une vérification que personne n'a faite.
- « Deux pistes, à choisir » devient « à éprouver » ; portes et règles au conditionnel ou au futur ; « Ce que la famille verrait ».
- L'aperçu famille et l'aperçu de fiche sont du vrai texte, pas une image avec un libellé ; tableau empilé `cf-tableau` au téléphone (libellé puis valeur), pas deux colonnes ; mentions : les pastilles de la fiche ; états : les étiquettes du site, sans rond. L'icône du reçu est celle du document ; aucune icône nouvelle.
- « Ici, un dessin » sur la couverture d'exemple n'est pas repris : « Exemple » suffit sur la ligne du nom.

**Constats initiaux de la PR** : l'appel de la fiche réelle disait « Rien n'est publié sans votre accord » (`FicheEcole.astro`), et Confidentialité que les photos « ne sont publiées qu'avec l'accord daté de la direction ». Ces deux textes sont harmonisés par la revue ci-dessous. Le besoin de base du lot 4 (accord daté par image) reste ouvert ; aucune migration n'est ajoutée. `ExplorateurCarte.astro`, posé sur aucune page, écrit encore « Espace écoles ».

**À relire par une personne avant la production** : « Que publiez-vous sans notre accord ? » et les trois accords ; la prestation de communication (« elle se paierait ») ; les cinq règles et « Ce qu'ils ne feront pas » (engagements sur des outils qui n'existent pas) ; les messages WhatsApp préremplis.

**Preuves** : unitaires `pour-les-ecoles.test.ts` (états, comptes et jours du 016) ; `fichiers-standards` et `liens-demandes` complétés ; parcours `ecoles-et-directions.spec.ts` (recherche de plusieurs fiches à aucune, états, démarches sans accord, page Outils, 016 dans quatre récits ; deux tests de la page du 05/11 réécrits), `public.spec.ts` (code refusé puis accepté, sans JavaScript ; Outils sans script), `declaration-ecole.spec.ts` (`#referencer`), `accueil.spec.ts`, `pages-de-confiance.spec.ts` (mots collés), `mise-en-page.spec.ts` (les deux pages aux trois largeurs ; le test « gains avant l'action » réécrit), `formulaires-publics.spec.ts` ; `pnpm test:constructions` étendu aux arrivées ouvertes des deux pages. **Preuve de retrait non étendue** : ces pages n'emportent aucune donnée de fiche. Captures : `playwright.confiance.config.ts`, à 360, 390, 768 et 1 440 px dans `captures/confiance/` (hors git).

### Revue du lot 5, 25/11/2026

Les deux constats de texte signalés par la PR sont harmonisés pendant la revue : l’appel de la fiche ne promet plus qu’aucune information ne paraît sans accord ; il rappelle le OUI daté des frais et la relecture des envois. Confidentialité sépare les photos contrôlées des frais, du contact et du mot soumis à un accord daté, avec un lien vers les règles des photos. Aucun changement de collecte, de droit, d’accord ou de conservation ; les durées non tranchées restent à régler à la recette. Pas de nouvel essai automatique pour ces retouches de texte ; les parcours et contrôles de construction existants sont rejoués.

## Lot 6 — recette complète (ticket 225, PR 226, intégré le 25/11/2026 : `14630a2`)

La recette locale de la refonte et les corrections qu'elle a demandées. Aucun SQL, aucun droit changé, rien d'appliqué en ligne, formulaires toujours fermés par défaut. Preuves, limites, textes à confirmer et procédure du lot 7 : dépôt `ntanova`, `RECETTE-LOT-06.md`.

| Défaut trouvé | Correction | Protection |
| --- | --- | --- |
| « Où ? Brazzaville » rendait toutes les écoles publiées, Pointe-Noire comprise : `Congo-Brazzaville`, autre nom du pays, entrait dans chaque ligne de `/recherche.json`. Invisible sur le faux catalogue, dont le pays n'avait aucune autre écriture ; présent aussi en ligne pour le texte cherché | `lignesDeRecherche` n'ajoute plus les écritures du pays ; le pays écrit en entier dans « Où ? » (`ECRITURES_DU_PAYS`) ne retire aucune école | `recherche.test.ts`, `liste-ecoles.test.ts` (comparé à la migration), `accueil.spec.ts` ; le faux catalogue porte désormais les écritures de la base |
| `mise-en-ligne.yml` ne transmettait pas `PUBLIC_FORMULAIRES` : aucune mise en ligne ne pouvait ouvrir les formulaires | la variable du dépôt est transmise ; absente ou vide, ils restent fermés ; toute autre valeur arrête la construction | `mise-en-ligne.test.ts` : chaque réglage public d'`astro.config.mjs` est transmis |
| Formulaires ouverts, le contrôle en ligne de l'accueil passait au rouge (plus de lien WhatsApp sur l'accueil), donc la production ne serait pas partie | le contrôle accepte l'une ou l'autre porte sur l'accueil et prouve le numéro sur `/pour-les-ecoles/` | `tests/en-ligne/site.spec.ts`, joué sur les deux positions |
| `preview_urls` absent de `wrangler.jsonc` : Wrangler garde alors le réglage du tableau de bord, et une version d'avant un retrait peut rester lisible à son adresse `workers.dev` | `workers_dev` et `preview_urls` à `false`, pour les deux sites | à constater en ligne (procédure du lot 7) |
| `llms.txt` disait que toute fiche est vue de la rue et citait une ancienne mention | les trois origines et les quatre mentions d'aujourd'hui | `fichiers-standards.test.ts` existant |
| Confidentialité taisait le nombre gardé par « Demander la vérification », la paie des relais, les sauvegardes chez GitHub, le courrier, et disait « un contact n'est gardé que si la direction l'accepte » (le numéro d'une école lu sur un document se garde en privé) | textes alignés sur le code ; la CNPD est nommée (loi n° 5-2025, Journal officiel n° 15-2025) | `pages-de-confiance.spec.ts` |
| Mentions légales : adresses des hébergeurs et crédit de Protomaps entre crochets | lus sur les pages officielles le 25/11 ; crédits des dessins et des icônes | relecture humaine |
| « Méthode » dans deux pages, « Toutes les écoles » sans script, filtre « Ville » qui nomme un département (Sangha) | « Fiabilité des informations », « Les écoles », « Ville ou département » | — |

**Textes acceptés par le fondateur le 25/11** : éditeur (projet porté par une personne, sans société immatriculée ; adresse communiquée sur demande), démarche auprès de la CNPD pas encore faite, durées de Confidentialité ; la loi applicable et la juridiction sont retirées tant qu'un juriste ne les a pas écrites. Plus aucun crochet sur les deux pages. **Seuls les messages des formulaires ont une purge** : les autres durées se tiennent à la main, deux fois par an, et la page dit qu'une donnée peut rester jusqu'au ménage suivant (`supabase/schema.md`, « Le ménage des durées », requêtes jouées sur la base locale). Acceptation du fondateur, pas un avis juridique.

**Limites gardées** : la liste n'applique une recherche qu'avec JavaScript (sans lui : le total, les vingt premières cartes et les villes) ; le titre d'un département dit « à Sangha » ; le premier affichage de la carte est à 682 Ko sur 700 avec le catalogue du 25/11.

## Lot 7 — livraison unique (ticket 227)

Aucune fonction nouvelle. Procédure, ordre des gestes et état constaté : dépôt `ntanova`, `PROCEDURE-LOT-07.md` et `RELEVE-LOT-07.md`.

| Règle | Pourquoi |
| --- | --- |
| La sauvegarde est relue avec la clé privée, en isolation, avant toute migration | une copie jamais relue n'est pas une sauvegarde |
| Migrations avant la mise en ligne, jamais par la CI ; elles n'ouvrent rien | sans secret d'envoi et sans `PUBLIC_FORMULAIRES`, aucun message ne part |
| Essai et production lisent la même base ; `PUBLIC_FORMULAIRES` et le secret d'envoi leur sont communs | ouvrir sur essai, c'est déjà préparer l'ouverture en production : l'état final se constate, il ne se suppose pas |
| Aucun retour à une ancienne version sans avoir vérifié qu'elle respecte les retraits ; sinon reconstruire l'ancien code avec le catalogue actuel | une ancienne construction remettrait en ligne ce qui a été retiré |
| Fusion dans `main` et production : ordre distinct du fondateur, une exécution, puis tag et suppression de cette branche | une fusion n'est pas une mise en ligne |

## Contrôles et livraison

Suivre `CLAUDE.md` : contrôles locaux sur le faux catalogue, dont `pnpm verif:ci` et les parcours pertinents, puis CI de la dernière révision. Aucun workflow supplémentaire, aucune répétition identique de CI. Ne pas remplacer la construction locale du fondateur par une construction isolée sur les vraies données.

Le workflow existant autorise l'essai depuis une branche et la production depuis `main`. La recette finale crée une PR globale ; le fondateur donne ensuite l'ordre de livraison. Un tag marque la base, un autre marquera le commit effectivement livré. Un correctif urgent de `main` est reporté dans l'intégration avant de poursuivre les lots.

Un agent termine avec ticket, PR, base, SHA, contrôles, captures, limites et état local/distant. Il s'arrête après le seul lot lancé ; il ne propose pas automatiquement une suite.

Plan détaillé et prompt commun à Claude/GPT : `~/Desktop/NTANOVA/docs/produit/2026-11-24-refonte-site-public/README.md`.

## Revue et fusion par le fondateur (24/11/2026)

Le fondateur garde désormais la fusion : l’agent de code termine son lot avec une PR vérifiée et ouverte vers `refonte/site-public`, puis une autre session fait la revue. Les corrections reviennent sur la branche de cette PR. L’agent ne fusionne pas et ne ferme pas le ticket avant la fusion constatée. Cette consigne remplace la fusion automatique de fin de tâche décrite plus haut. Le lot suivant commence après la fusion du précédent, depuis le dernier `origin/refonte/site-public`.

La revue de la PR 212 a conduit à deux corrections : « Exemple » accompagne le dernier mot du nom fictif, dans l’accueil et la démonstration ; chaque lien du pied possède une cible de 44 px sans chevaucher le suivant, à la souris comme au doigt. Les parcours de régression ont d’abord reproduit les défauts. Aucun déploiement ni changement de base n’accompagne ces corrections.

État au 24/11 : les lots 1 et 2 sont intégrés à `refonte/site-public` (PR 212 et 214, CI verte sur leur dernière révision), aucun n’est en production. Leurs tickets sont fermés et leurs branches courtes supprimées. Le lot suivant part du dernier `origin/refonte/site-public`.
