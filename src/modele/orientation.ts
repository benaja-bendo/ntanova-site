/**
 * « S'orienter » (refonte publique, lot 2, 24/11/2026) : les règles des six activités et des dix grands domaines. Pur, sans
 * aucune dépendance : le petit script de la page l'importe tel quel (10 Ko gzip au plus pour tout le JavaScript de la page).
 *
 * Choix acceptés au lancement du lot (dépôt `ntanova`, `docs/produit/2026-11-24-refonte-site-public/LOT-02-ORIENTER.md`) :
 * - chaque « J'aime » ouvre les domaines associés à son activité ; « Je ne sais pas » et « Je n'aime pas » n'en ouvrent aucun ;
 * - les pistes se réunissent sans doublon, dans l'ordre des activités puis de leurs domaines : ni score, ni aptitude, ni
 *   classement ; aucune activité aimée renvoie aux dix domaines ou à « Recommencer » ;
 * - les dix groupes suivent les grands domaines de la CITE-F 2013 de l'UNESCO (01 à 10) ; leur rapprochement avec les
 *   domaines de l'annuaire (`education_domains`) est une règle de NTanova, pas une reconnaissance officielle. Chaque domaine
 *   de l'annuaire appartient à un seul groupe, sauf « Autre » (un test le garde) ;
 * - aucune réponse ne quitte le navigateur : ni adresse, ni stockage, ni réseau. L'état vit dans le script, le temps de la page.
 */

/** Une réponse à une activité : les trois choix, dont la case de sortie « Je ne sais pas ». */
export type Reponse = 'oui' | 'peut' | 'non';

export interface Activite {
  /** « Réparer un téléphone qui ne charge plus » */
  texte: string;
  /** Le dessin de l'activité (`public/dessins/`), décoratif. */
  dessin: string;
  /** Les domaines de l'annuaire (leur adresse) qu'un « J'aime » ouvre, dans cet ordre. */
  domaines: readonly string[];
}

/** Les six activités de la planche « S'orienter », dans leur ordre. */
export const ACTIVITES: readonly Activite[] = [
  {
    texte: 'Réparer un téléphone qui ne charge plus',
    dessin: '/dessins/activite-reparer.svg',
    domaines: ['electricite-electronique', 'informatique'],
  },
  {
    texte: 'Expliquer une leçon à un plus jeune',
    dessin: '/dessins/activite-expliquer.svg',
    domaines: ['education'],
  },
  {
    texte: 'Tenir la caisse d’une boutique et compter la recette',
    dessin: '/dessins/activite-caisse.svg',
    domaines: ['commerce-marketing', 'comptabilite-finance'],
  },
  {
    texte: 'Dessiner les plans d’une maison',
    dessin: '/dessins/activite-plans.svg',
    domaines: ['btp'],
  },
  {
    texte: 'Chercher pourquoi une plante est malade',
    dessin: '/dessins/activite-plante.svg',
    domaines: ['agriculture-environnement', 'sciences-technologies'],
  },
  {
    texte: 'Ranger et suivre les dossiers d’inscription d’une école',
    // Le dessin du dossier et de ses pièces, déjà servi par l'accueil (même original du canevas).
    dessin: '/dessins/repere-demande.svg',
    domaines: ['secretariat-administration', 'gestion'],
  },
];

/** « Vous aimez : réparer un téléphone… » : l'activité dans une phrase, sa première lettre en minuscule. */
export const dansUnePhrase = (texte: string): string =>
  texte.charAt(0).toLocaleLowerCase('fr') + texte.slice(1);

export interface GroupeDeDomaines {
  /** Le code du grand domaine de la CITE-F 2013 (« 01 » à « 10 »). */
  code: string;
  titre: string;
  /** Quelques métiers ou disciplines, pour reconnaître le groupe. */
  exemples: string;
  dessin: string;
  /** Les domaines de l'annuaire qu'il réunit (leur adresse). */
  domaines: readonly string[];
}

/**
 * Les dix grands domaines (CITE-F 2013, 01 à 10 ; le 00, programmes génériques, n'a pas d'équivalent dans l'annuaire). Les
 * titres sont ceux de la planche ; les domaines de l'annuaire viennent de `education_domains` (migration du catalogue).
 * Rapprochements propres à NTanova : « Agriculture et environnement » en 08, « Arts, couture et mode » en 02, « Sciences et
 * technologies » en 05, « Sport » en 10.
 */
export const GROUPES_DE_DOMAINES: readonly GroupeDeDomaines[] = [
  {
    code: '01',
    titre: 'Éducation',
    exemples: 'Instituteur, professeur, petite enfance',
    dessin: '/dessins/domaine-01.svg',
    domaines: ['education'],
  },
  {
    code: '02',
    titre: 'Lettres et arts',
    exemples: 'Langues, musique, arts plastiques, design',
    dessin: '/dessins/domaine-02.svg',
    domaines: ['lettres-langues', 'arts-mode'],
  },
  {
    code: '03',
    titre: 'Sciences sociales et journalisme',
    exemples: 'Économie, journalisme',
    dessin: '/dessins/domaine-03.svg',
    domaines: ['economie', 'communication', 'sciences-sociales'],
  },
  {
    code: '04',
    titre: 'Commerce, administration et droit',
    exemples: 'Gestion, comptabilité, banque, droit',
    dessin: '/dessins/domaine-04.svg',
    domaines: [
      'gestion',
      'comptabilite-finance',
      'commerce-marketing',
      'secretariat-administration',
      'droit',
    ],
  },
  {
    code: '05',
    titre: 'Sciences et mathématiques',
    exemples: 'Biologie, chimie, physique',
    dessin: '/dessins/domaine-05.svg',
    domaines: ['sciences-technologies'],
  },
  {
    code: '06',
    titre: 'Informatique et communication',
    exemples: 'Réseaux, développement',
    dessin: '/dessins/domaine-06.svg',
    domaines: ['informatique'],
  },
  {
    code: '07',
    titre: 'Ingénierie et construction',
    exemples: 'BTP, électricité, mécanique, mines et pétrole',
    dessin: '/dessins/domaine-07.svg',
    domaines: ['btp', 'electricite-electronique', 'mecanique-maintenance', 'energie-petrole-mines'],
  },
  {
    code: '08',
    titre: 'Agriculture, forêt, pêche',
    exemples: 'Agronomie, forêt, élevage',
    dessin: '/dessins/domaine-08.svg',
    domaines: ['agriculture-environnement'],
  },
  {
    code: '09',
    titre: 'Santé et action sociale',
    exemples: 'Soins infirmiers, sage-femme',
    dessin: '/dessins/domaine-09.svg',
    domaines: ['sante'],
  },
  {
    code: '10',
    titre: 'Services',
    exemples: 'Transport, logistique, hôtellerie, tourisme, sport',
    dessin: '/dessins/domaine-10.svg',
    domaines: ['hotellerie-tourisme', 'transport-logistique', 'sport'],
  },
];

/** Les domaines de l'annuaire qui n'entrent dans aucun groupe : « Autre » ne dit rien d'un métier. */
export const DOMAINES_SANS_GROUPE: readonly string[] = ['autre'];

// Les réponses ------------------------------------------------------------------------------------------------------------

/** Une piste : un domaine, et les activités aimées qui y mènent (la première décide de sa place). */
export interface PisteDUneActivite {
  /** L'activité aimée (son rang dans `ACTIVITES`). */
  activite: number;
  /** Ses domaines qu'aucune activité aimée plus haut n'a déjà ouverts : aucun doublon dans le résultat. */
  domaines: string[];
}

/**
 * Le résultat : pour chaque activité aimée, dans l'ordre des activités, ses domaines pas encore cités. Une activité dont
 * tous les domaines sont déjà cités garde sa place, sans domaine (« mêmes pistes que ci-dessus »). Aucune activité aimée :
 * une liste vide, et la page propose les dix domaines.
 */
export function pistesDesReponses(
  reponses: readonly Reponse[],
  activites: readonly Pick<Activite, 'domaines'>[] = ACTIVITES,
): PisteDUneActivite[] {
  const vus = new Set<string>();
  const pistes: PisteDUneActivite[] = [];
  activites.forEach((a, rang) => {
    if (reponses[rang] !== 'oui') return;
    const domaines = a.domaines.filter((d) => !vus.has(d));
    for (const d of domaines) vus.add(d);
    pistes.push({ activite: rang, domaines });
  });
  return pistes;
}

/** L'état des activités : les réponses données, et l'instant de la dernière (pour ignorer un appui de trop). */
export interface EtatDesActivites {
  readonly reponses: readonly Reponse[];
  readonly depuis: number | null;
}

export const etatDeDepart = (): EtatDesActivites => ({ reponses: [], depuis: null });

/**
 * Le temps pendant lequel la question suivante ignore un appui : un double appui, un double clic ou une touche gardée
 * enfoncée ne répondent pas à la question qui vient de paraître.
 */
export const PAUSE_ENTRE_DEUX_REPONSES_MS = 350;

/**
 * Une réponse, une fois par geste : elle ne vaut que pour la question affichée (`question`), et pas dans la pause qui suit
 * la réponse précédente. Sinon, l'état ne change pas (le même objet revient).
 */
export function repondre(
  etat: EtatDesActivites,
  question: number,
  reponse: Reponse,
  maintenant: number,
  total: number = ACTIVITES.length,
): EtatDesActivites {
  if (question !== etat.reponses.length || question >= total) return etat;
  if (etat.depuis !== null && maintenant - etat.depuis < PAUSE_ENTRE_DEUX_REPONSES_MS) return etat;
  return { reponses: [...etat.reponses, reponse], depuis: maintenant };
}

export const estFini = (etat: EtatDesActivites, total: number = ACTIVITES.length): boolean =>
  etat.reponses.length >= total;
