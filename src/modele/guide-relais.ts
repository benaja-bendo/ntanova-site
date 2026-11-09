/**
 * Le guide des Relais et Contributeurs NTanova : le texte et la version, en un seul endroit.
 *
 * La page `/guide-relais/`, la même page dans l'espace relais (`/relais/guide/`, qui marche hors ligne), le PDF et les
 * images pour WhatsApp (`outils/guide-relais/`) sont tous construits à partir de ce fichier. Pour changer le guide :
 * modifier ici, passer `version` et `miseAJour`, ajouter une ligne à `changements`, mettre en ligne.
 *
 * Règles à tenir (le test `tests/unitaires/guide-relais.test.ts` les vérifie) :
 * - aucune hypothèse ni seuil du registre, aucune offre : on parle de relever une école et de la faire valider ;
 * - ni gratuité ni prix promis aux écoles (« on ne parle pas de prix pour l'instant ») ;
 * - **aucune promesse de rémunération, aucun montant, aucune mention de paiement** (décision du fondateur, 09/11/2026) :
 *   la page est lisible par quiconque a le lien, et elle s'adresse aussi aux contributeurs (étudiants, parents,
 *   habitants). Ce qui concerne la paie des relais historiques se dit par WhatsApp et dans l'espace relais (écran « Ma
 *   paie »), jamais ici. L'ancien texte (page « Ce que vous touchez », montants) est dans l'historique git, avant la v4 ;
 * - les phrases « À dire en entrant », « Jamais » et « À lui dire » sont celles de l'application
 *   (`src/app/relais/ecrans/MonLot.tsx` et `Ajouter.tsx`) ;
 * - le lot est un secteur conseillé, jamais une limite : « votre secteur » ;
 * - le Congo-Brazzaville (pas la RDC) ; on vouvoie ;
 * - le numéro WhatsApp n'est jamais écrit ici : il vient de la configuration (`PUBLIC_WHATSAPP`).
 *
 * Les textes sont du HTML de confiance (`<b>`, `<em>`, `&nbsp;`) écrit ici, jamais une saisie.
 */

export type Ligne = { signe: string; titre: string; html: string };

export type Bloc =
  | { type: 'titre'; texte: string }
  | { type: 'texte'; html: string; petit?: boolean }
  | { type: 'puces'; items: string[]; sorties?: string[] }
  | { type: 'lignes'; items: Ligne[] }
  | { type: 'attention'; html: string }
  | { type: 'dire'; html: string }
  | { type: 'jamais'; items: string[] }
  | { type: 'ou'; items: { cle: string; html: string }[] }
  | { type: 'flux'; cases: { numero: string; titre: string; html: string; actif?: boolean }[] }
  | {
      type: 'ecrans';
      items: { capture: string; rapport: string; numero: string; titre: string; html: string }[];
    }
  | { type: 'premier-jour'; etapes: Ligne[]; capture: string; legende: string }
  | { type: 'coches'; titre: string; items: string[] };

export interface Panneau {
  large?: boolean;
  blocs: Bloc[];
}

export interface PageGuide {
  /** Le nom de la page dans les fichiers : `01-bienvenue`. */
  fichier: string;
  titre: string;
  lead: string;
  /** Avant le panneau clair (le schéma de la page 1). */
  avant?: Bloc[];
  panneaux: Panneau[];
}

export interface CartePassage {
  titre: string;
  interdit: string;
  texte: string;
  contact: string;
  site: string;
}

export interface Guide {
  version: string;
  /** AAAA-MM-JJ : la date de la dernière modification du contenu. */
  miseAJour: string;
  /** Du plus récent au plus ancien. Dit aux relais ce qui a changé depuis le PDF qu'ils ont reçu. */
  changements: { date: string; texte: string }[];
  /** Les captures de l'application (sans extension) que le guide montre. */
  captures: string[];
  pages: PageGuide[];
  carte: CartePassage;
  /** Les trois rappels du pied de chaque page du PDF. */
  pied: string[];
}

const types = ['Privée', 'Publique', 'Confessionnelle', 'Communautaire'];
const niveaux = [
  'Crèche ou garderie',
  'Maternelle',
  'Primaire',
  'Collège',
  'Lycée',
  'Technique ou professionnel',
  'Supérieur',
];

export const GUIDE: Guide = {
  version: 'v4',
  miseAJour: '2026-11-09',
  changements: [
    {
      date: '2026-11-09',
      texte:
        'Le guide devient celui des Relais et Contributeurs : étudiant, parent ou habitant, on peut aussi envoyer une information sur WhatsApp. Il tient en cinq pages.',
    },
    {
      date: '2026-11-09',
      texte:
        'Les séries et les filières se touchent au lieu de s’écrire (séries du lycée ; diplôme puis domaines pour le technique et le supérieur). Le repère remonte sous le nom : « Qu’y a-t-il juste à côté ? », avec des repères à toucher.',
    },
    {
      date: '2026-11-03',
      texte:
        'Le guide est en ligne. Cette page est toujours la version à jour : un PDF reçu sur WhatsApp peut être plus ancien. Le contenu est celui de la v3.',
    },
    {
      date: '2026-11-02',
      texte:
        'Votre lot devient votre secteur : un conseil, plus une limite. Relevez toutes les écoles que vous croisez. Essayez de couvrir votre secteur avant la date « à rendre le ».',
    },
    {
      date: '2026-11-02',
      texte:
        'Photo de l’enseigne seule obligatoire, d’autres photos facultatives, séries et filières à noter, refus de la direction, tableau « Où trouver chaque information ».',
    },
  ],
  captures: ['mon-lot', 'ajouter-1', 'ajouter-2', 'ajouter-3'],
  pied: ['Rien n’est inventé', 'Jamais d’enfant en photo', 'Un doute ? WhatsApp'],
  pages: [
    {
      fichier: '01-bienvenue',
      titre: 'Bienvenue chez les <em>Relais et Contributeurs</em>',
      lead: 'NTanova construit un annuaire en ligne des écoles du Congo-Brazzaville, ville par ville, pour aider les familles à s’orienter.',
      avant: [
        {
          type: 'flux',
          cases: [
            { numero: '1', titre: 'Dans la rue', html: 'Vous relevez l’école' },
            { numero: '2', titre: 'Votre téléphone', html: 'La fiche se garde, même sans réseau' },
            { numero: '3', titre: 'NTanova', html: 'Valide en 24&nbsp;à&nbsp;48&nbsp;h' },
            { numero: '4', titre: 'Le site', html: 'ntanova.com', actif: true },
          ],
        },
      ],
      panneaux: [
        {
          blocs: [
            { type: 'titre', texte: 'Deux façons d’aider' },
            {
              type: 'texte',
              html:
                '<b>Envoyer une information</b> : étudiant, parent ou habitant, écrivez à NTanova sur WhatsApp. ' +
                'Dites le nom de l’école, sa ville et son quartier, et ce qui manque ou ce qui est faux. ' +
                'Une photo de l’enseigne aide, jamais celle d’un enfant. NTanova relit chaque information avant toute publication.',
            },
            {
              type: 'texte',
              html:
                '<b>Devenir relais</b> : <b>répertorier les écoles autour de vous</b>, avec l’application (photo de l’enseigne, ' +
                'position de l’entrée, ce qui est écrit, à qui s’adresser pour faire valider la fiche). Les pages suivantes expliquent comment.',
            },
            { type: 'titre', texte: 'Où ?' },
            {
              type: 'texte',
              html:
                'À <b>Brazzaville, Pointe-Noire, Dolisie, Nkayi, Ouesso, Oyo</b> ou ailleurs au Congo-Brazzaville. ' +
                'NTanova publie ville après ville.',
            },
            { type: 'titre', texte: 'Votre secteur' },
            {
              type: 'texte',
              html:
                'NTanova vous indique sur WhatsApp un <b>secteur</b> (un quartier ou un groupe de rues) : un <b>conseil, pas une limite</b>. ' +
                'Relevez <b>toutes</b> les écoles que vous croisez, où que vous soyez, et essayez de couvrir votre secteur ' +
                'avant la date « à rendre le » de l’écran « Mon secteur ».',
            },
            { type: 'titre', texte: 'Ce que NTanova vous donne' },
            {
              type: 'texte',
              html: 'Un compte à votre nom, un secteur conseillé et une réponse sur WhatsApp dans la demi-journée.',
            },
            {
              type: 'texte',
              petit: true,
              html:
                'Cadre d’essai, pas un contrat : les règles évoluent, on les ajuste avec vous. ' +
                'Votre premier lot est un lot d’essai (page 5).',
            },
          ],
        },
      ],
    },
    {
      fichier: '02-toutes-les-ecoles',
      titre: '<em>Toutes</em> les écoles',
      lead: 'Vous ne triez pas : vous relevez ce que vous voyez, et NTanova range.',
      panneaux: [
        {
          blocs: [
            {
              type: 'texte',
              html:
                '<b>Toutes les écoles comptent</b> : celles de l’État, privées, confessionnelles, communautaires, ' +
                'les centres de formation. Une très petite école compte autant qu’un grand complexe.',
            },
            { type: 'titre', texte: 'Type d’école' },
            { type: 'puces', items: types, sorties: ['Autre', 'Pas indiqué'] },
            { type: 'titre', texte: 'Niveaux (plusieurs possibles)' },
            { type: 'puces', items: niveaux, sorties: ['Autre formation'] },
            {
              type: 'texte',
              html:
                'Lycée, technique, supérieur ou autre formation : touchez <b>les séries ou filières</b> écrites ' +
                '(série C ; BTS puis gestion…), ou dites qu’elles sont sur un panneau pris en photo.',
            },
            { type: 'titre', texte: 'Si ça ne rentre pas dans une case' },
            {
              type: 'lignes',
              items: [
                {
                  signe: '?',
                  titre: 'Rien n’est écrit',
                  html: 'Choisissez <b>« Pas indiqué »</b>. Ne devinez pas : une case vide vaut mieux qu’une case fausse.',
                },
                {
                  signe: '+',
                  titre: 'C’est écrit, mais pas dans la liste',
                  html: 'Choisissez <b>« Autre »</b> et recopiez ce qui est écrit dans la ligne de texte juste en dessous.',
                },
                {
                  signe: '=',
                  titre: 'Une école déjà relevée',
                  html:
                    'L’application affiche <b>« doublon possible »</b> quand une école déjà en ligne est à moins de 40 m. ' +
                    'Ne la relevez pas deux fois : un doublon n’est pas retenu. Si un autre relais a déjà relevé la même école, ' +
                    'sa fiche est déjà là.',
                },
              ],
            },
            {
              type: 'attention',
              html:
                '<b>Ce que l’application exige pour envoyer une fiche</b> : la photo de l’enseigne, ' +
                'le nom écrit sur l’enseigne, et la réponse à <span style="white-space:nowrap">« Avez-vous vu la direction ? »</span>. Tout le reste est facultatif.',
            },
          ],
        },
      ],
    },
    {
      fichier: '03-trois-ecrans',
      titre: 'Le déroulé en <em>trois écrans</em>',
      lead:
        '« Ajouter une école » a trois écrans (1/3, 2/3, 3/3). Chacun se garde seul : sans réseau, ' +
        'l’envoi part au retour de la connexion.',
      panneaux: [
        {
          large: true,
          blocs: [
            {
              type: 'ecrans',
              items: [
                {
                  capture: 'ajouter-1',
                  rapport: '1080 / 2395',
                  numero: '1/3',
                  titre: 'Photo et position',
                  html:
                    'Enseigne de face, nette, <b>sans enfant</b>. Facultatif : panneau des filières, ' +
                    'prospectus, vue du bâtiment (3 au plus). Position à <b>50&nbsp;m ou moins</b>, devant le portail.',
                },
                {
                  capture: 'ajouter-2',
                  rapport: '1080 / 2320',
                  numero: '2/3',
                  titre: 'Ce qui se voit de la rue',
                  html:
                    '<b>Nom écrit sur l’enseigne : obligatoire.</b> Niveaux et type : seulement ce qui est écrit. ' +
                    'Lycée, technique, supérieur : les séries ou filières vues.',
                },
                {
                  capture: 'ajouter-3',
                  rapport: '1080 / 2394',
                  numero: '3/3',
                  titre: 'La direction',
                  html:
                    '« Avez-vous vu la direction ? » Oui, Absente ou Refus. Si oui : sa fonction, son accord, ' +
                    'son numéro. Puis « Enregistrer la fiche ».',
                },
              ],
            },
          ],
        },
        {
          blocs: [
            { type: 'titre', texte: 'Où trouver chaque information' },
            {
              type: 'ou',
              items: [
                {
                  cle: 'Nom',
                  html: 'Enseigne ou mur du portail. <b>Obligatoire.</b> Pas de nom ? Écrivez « Sans&nbsp;nom » et prévenez NTanova.',
                },
                { cle: 'Niveaux', html: 'Ceux écrits sur l’enseigne, pas d’autres.' },
                { cle: 'Type', html: 'Ce que l’enseigne dit. Sinon : « Pas indiqué ».' },
                {
                  cle: 'Séries, filières',
                  html:
                    'Sur l’enseigne ou un panneau : on touche, on ne tape pas. Un prospectus, oui : ' +
                    'jamais une liste d’élèves ni un bulletin.',
                },
                {
                  cle: 'Mentions, numéro',
                  html: 'Langues, programme ou numéro écrits. Facultatif.',
                },
                {
                  cle: 'Repère',
                  html: 'Juste à côté : le marché, la pharmacie (on touche). Les familles s’en servent pour trouver l’école.',
                },
                {
                  cle: 'Direction',
                  html: 'Gardien ou accueil : « à qui pouvons-nous nous adresser ? »',
                },
                {
                  cle: 'Pour être acceptée',
                  html:
                    '<b>Photo nette + nom + position (précision 50&nbsp;m ou moins) + ' +
                    'pas de doublon.</b>',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      fichier: '04-posture',
      titre: 'La posture : <em>simple et honnête</em>',
      lead: 'Vous êtes la première personne que l’école voit de NTanova.',
      panneaux: [
        {
          blocs: [
            { type: 'titre', texte: 'En entrant, vous dites' },
            {
              type: 'dire',
              html:
                '« Bonjour. Nous relevons les écoles du quartier pour un annuaire en ligne destiné aux familles. ' +
                'Nous venons de relever votre école, avec ce qui se voit de la rue. Pour que sa fiche soit juste et que ' +
                'l’établissement puisse la corriger si besoin, nous voulons la faire valider par la direction : ' +
                'à qui pouvons-nous nous adresser ? »',
            },
            { type: 'titre', texte: 'Jamais' },
            {
              type: 'jamais',
              items: [
                'Se dire parent',
                'Dire que le site est déjà connu',
                'Promettre quelque chose',
                'Photographier un enfant',
              ],
            },
            { type: 'titre', texte: 'Si on vous pose la question' },
            {
              type: 'lignes',
              items: [
                {
                  signe: '€',
                  titre: '« C’est payant ? »',
                  html: '« On ne parle pas de prix pour l’instant. » Ni gratuit, ni tarif.',
                },
                {
                  signe: '✋',
                  titre: 'On vous refuse l’entrée',
                  html:
                    'Relevez depuis la rue, ne forcez pas. À la question « Avez-vous vu la direction ? », cochez ' +
                    '<b>« Refus »</b>. Si l’accueil est bon mais que la direction n’est pas là : cochez <b>« Absente »</b>.',
                },
                {
                  signe: '☎',
                  titre: 'En prenant le numéro de la direction',
                  html:
                    'Cochez l’accord de la personne, puis dites : « Votre numéro ne sera jamais publié. NTanova vous écrira ' +
                    'au sujet de la fiche de l’école, et l’effacera si vous le demandez. » Ajoutez : <b>« NTanova va vous ' +
                    'envoyer un court message sur WhatsApp pour confirmer votre contact et vérifier la fiche. »</b> ' +
                    'Notez le numéro dans l’application seulement : ni carnet, ni WhatsApp, ni papier. Inutile de ' +
                    'convaincre : vous notez, NTanova écrit ensuite.',
                },
              ],
            },
            { type: 'titre', texte: 'Réactivité' },
            {
              type: 'texte',
              html:
                'NTanova vous répond sur WhatsApp dans la demi-journée, plus vite pendant les heures de relevé. ' +
                'Quand on vous demande une correction, reprenez-la le jour même si possible.',
            },
          ],
        },
      ],
    },
    {
      fichier: '05-premier-jour',
      titre: 'Votre premier jour',
      lead: 'Vous commencez par le lot Essai : c’est l’entraînement.',
      panneaux: [
        {
          blocs: [
            {
              type: 'premier-jour',
              capture: 'mon-lot',
              legende: 'Votre écran d’accueil',
              etapes: [
                {
                  signe: '1',
                  titre: 'Installer et se connecter',
                  html:
                    'Ouvrez <b>ntanova.com/relais</b> dans Chrome, puis « Continuer avec Google ». Si le lien s’ouvre depuis ' +
                    'WhatsApp, choisissez « Ouvrir dans Chrome ». Votre compte est <b>en attente</b> : NTanova vous active.',
                },
                {
                  signe: '2',
                  titre: 'Lot Essai : 3 fiches',
                  html: 'Trois vraies écoles de votre secteur, pour vous entraîner. NTanova les revoit avec vous.',
                },
                {
                  signe: '3',
                  titre: 'On corrige ensemble',
                  html:
                    'NTanova répond en 24 à 48 h. Corrigez ce qui est demandé. Tant que les 3 fiches ne sont pas validées, ' +
                    'vous ne passez pas à votre secteur.',
                },
                {
                  signe: '4',
                  titre: 'Puis votre secteur',
                  html: 'Les 3 fiches validées, vous passez à votre secteur et vous relevez toutes les écoles que vous croisez.',
                },
              ],
            },
            {
              type: 'coches',
              titre: 'Avant de partir, je sais dire…',
              items: [
                'ce que je dis en entrant',
                'ce qui rend une fiche acceptée',
                'ce que je ne fais jamais',
                'à qui j’écris si je suis bloqué : <b>NTanova, sur WhatsApp</b>',
              ],
            },
          ],
        },
      ],
    },
  ],
  carte: {
    titre: 'Recensement des établissements scolaires',
    interdit: 'Aucune photo d’enfant',
    texte:
      'Je relève l’enseigne et la position de l’école, depuis la rue, pour un annuaire en ligne ' +
      'qui démarre. Je ne photographie aucun élève.',
    contact: 'Pour vérifier ou nous joindre · WhatsApp',
    site: 'ntanova.com',
  },
};

/** « 2026-11-03 » → « 3 novembre 2026 » (sans dépendre du fuseau de la machine). */
export function dateLisible(iso: string): string {
  const [annee, mois, jour] = iso.split('-').map(Number);
  if (!annee || !mois || !jour) throw new Error(`Date illisible : ${iso}`);
  return new Date(Date.UTC(annee, mois - 1, jour)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Les chiffres du numéro WhatsApp sans l'indicatif 242 : 9 chiffres, sinon rien (jamais un numéro inventé). */
export function chiffresDuNumero(numero: string | undefined): string | null {
  if (!numero) return null;
  const chiffres = numero.replace(/\D/g, '');
  const local = chiffres.startsWith('242') ? chiffres.slice(3) : chiffres;
  return /^\d{9}$/.test(local) ? local : null;
}

/** Le numéro à la congolaise, en groupes de 2-3-2-2 : « +242 06 123 45 67 ». */
export function numeroLisible(numero: string | undefined): string[] | null {
  const c = chiffresDuNumero(numero);
  return c ? ['+242', c.slice(0, 2), c.slice(2, 5), c.slice(5, 7), c.slice(7)] : null;
}

/** Les noms des fichiers exportés : la version et la date y figurent, pour ne jamais confondre deux envois. */
export function nomsDesFichiers(guide: Guide = GUIDE) {
  const base = `${guide.version}-${guide.miseAJour}`;
  return {
    pdf: `NTANOVA-guide-relais-${base}.pdf`,
    images: guide.pages.map((p) => ({
      fichier: `guide-relais-${base}-${p.fichier}.png`,
      page: p.fichier,
    })),
    carte: `guide-relais-${base}-06-carte-de-passage.png`,
  };
}
