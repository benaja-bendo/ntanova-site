# Composants de la carte publique

Une même carte sur l'accueil et `/carte/`, sans framework d'interface supplémentaire. La séparation suivie est celle des **données et règles, du rendu et de l'orchestration** ; pas de hiérarchie de classes ni d'abstraction générique.

| Modifier… | Point d'entrée |
| --- | --- |
| Structure HTML, tiroir/panneau, commandes et styles de carte | `src/ui/ExplorateurCarte.astro` |
| Contenu et actions de l'aperçu d'une école, popup et tiroir | `src/app/carte/apercu.ts` |
| Quand charger, repli WebGL, connexion lente, lien plein écran | `src/app/carte/chargeur.ts` et règle pure `src/modele/carte/chargement.ts` |
| Initialiser MapLibre, ses couches et interactions | `src/app/carte/ilot.ts` |
| État de l'application : recherche, liste, sélection, URL, tiroir et position sur geste | `src/app/carte/interface.ts` |
| Format de vue et filtrage sans navigateur | `src/modele/carte/navigation.ts` |
| Données publiques, preuves, cycles et états géographiques | `src/modele/carte/donnees.ts` ; ports publics dans `src/modele/ports.ts` |
| Couleurs, espacements, typographie communs | `src/ui/jetons.css` |

Le composant Astro est instancié **une fois par page** (identifiants des champs et de la carte). Il ne connaît ni Supabase ni MapLibre ; il produit le HTML utilisable sans le moteur. Les pages lui donnent leur instantané public et lancent le chargeur. Le chargeur importe le moteur après décision ; l'application complète est initialisée uniquement sur `/carte/`. L'aperçu pose le texte avec `textContent`, et ne conserve aucune position personnelle.

Les versions accueil et application partagent le moteur et le rendu d'aperçu. Modifier le contenu de l'aperçu dans `apercu.ts`, pas dans les deux contrôleurs. Les styles restent dans le composant Astro pour qu'un changement visuel soit commun ; les jetons restent la source des valeurs de design. Si l'interface grandit, extraire une responsabilité de `interface.ts` avec ses tests (recherche ou historique, par exemple) au moment où cela simplifie un changement réel.

Vérifications : parcours accueil (réseau, visibilité, repli, gestes, lien plein écran), parcours application (recherche, cycles, URL, preuves, position), mise en page aux trois formats et tests des règles pures. `pnpm poids` contrôle les graphes des deux pages ; la mesure HTTP servie reste obligatoire avant fusion. Le composant ne représente pas un nouveau système de design : il réutilise celui du site.
