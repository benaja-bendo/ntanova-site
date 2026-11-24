/**
 * Les listes fermées que montrent les formulaires publics (refonte, lot 3C) : une part de `listes`, qui les réunit toutes et que
 * les tests comparent à la base. À part, pour que le script de Contact et de l'annuaire reste petit (10 Ko gzip, `pnpm poids`).
 */
export const listesDesDemandes = {
  public_request_kind: ['contact', 'absente', 'erreur', 'retrait'],
  public_request_origin: [
    'accueil',
    'ecoles',
    'fiche',
    'pied',
    'pour-les-ecoles',
    'fiabilite',
    'villes',
    'outils',
    'contact',
    'confidentialite',
    'direct',
  ],
  public_request_subject: ['trouver', 'ecole', 'outils', 'donnees', 'site', 'autre'],
  public_request_level: ['M', 'P', 'C', 'L', 'T', 'S'],
  public_request_topic: [
    'nom',
    'adresse',
    'niveaux',
    'frais',
    'contact',
    'photo',
    'ferme',
    'autre',
  ],
  public_request_knowledge: ['passage', 'document', 'ecole', 'autre'],
  public_request_removal: ['tel', 'photo', 'personne', 'fiche', 'autre'],
  public_request_reply: ['non', 'whatsapp', 'email'],
} as const;
