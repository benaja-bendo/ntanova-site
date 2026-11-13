import { photoExemple } from './photo-exemple';
import { jourDuCongo } from '../../modele/date-declaration';
import { decaler, type MediaPublic } from '../../modele/vitrine';
import type {
  DivisionPublique,
  DomainePublic,
  EcolePubliee,
  FormationPublique,
  PortCatalogue,
} from '../../modele/ports';

/**
 * Un catalogue fictif, pour les parcours Playwright (`PUBLIC_ADAPTATEUR=faux`) : des écoles d'exemple (leurs noms
 * sont entre crochets, elles n'existent pas) réparties sur trois villes du Congo, dont une école à deux campus, un
 * lycée avec des séries, un institut supérieur avec des diplômes, une école sans position.
 * Jamais utilisé en ligne.
 */

const division = (
  id: string,
  parentId: string | null,
  niveau: number,
  genre: DivisionPublique['genre'],
  nom: string,
  slug: string,
  adresse: string[],
  ordinal: number | null = null,
  ouverte = false,
): DivisionPublique => ({
  id,
  parentId,
  niveau,
  genre,
  nom,
  slug,
  adresse,
  ordinal,
  alias: [],
  verifieeLe: '2026-11-01',
  ouverte,
  deploiement: null,
  position: null,
  contour: null,
});

const D = {
  congo: 'd0000000-0000-4000-8000-000000000001',
  pnDep: 'd0000000-0000-4000-8000-000000000002',
  pnVille: 'd0000000-0000-4000-8000-000000000003',
  tieTie: 'd0000000-0000-4000-8000-000000000004',
  ngoyo: 'd0000000-0000-4000-8000-000000000005',
  loandjili: 'd0000000-0000-4000-8000-000000000006',
  mongo: 'd0000000-0000-4000-8000-00000000000d',
  mvou: 'd0000000-0000-4000-8000-00000000000e',
  quartier: 'd0000000-0000-4000-8000-000000000007',
  bzvDep: 'd0000000-0000-4000-8000-000000000008',
  bzvVille: 'd0000000-0000-4000-8000-000000000009',
  moungali: 'd0000000-0000-4000-8000-00000000000a',
  niari: 'd0000000-0000-4000-8000-00000000000b',
  dolisie: 'd0000000-0000-4000-8000-00000000000c',
} as const;

const DIVISIONS_BRUTES: DivisionPublique[] = [
  division(D.congo, null, 0, 'country', 'Congo', 'congo', ['congo']),
  division(D.pnDep, D.congo, 1, 'department', 'Pointe-Noire', 'pointe-noire', [
    'congo',
    'pointe-noire',
  ]),
  division(D.pnVille, D.pnDep, 2, 'city', 'Pointe-Noire', 'pointe-noire', [
    'congo',
    'pointe-noire',
    'pointe-noire',
  ]),
  division(
    D.tieTie,
    D.pnVille,
    3,
    'arrondissement',
    'Tié-Tié',
    'tie-tie',
    ['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'],
    3,
    true,
  ),
  division(
    D.ngoyo,
    D.pnVille,
    3,
    'arrondissement',
    'Ngoyo',
    'ngoyo',
    ['congo', 'pointe-noire', 'pointe-noire', 'ngoyo'],
    6,
    true,
  ),
  division(
    D.loandjili,
    D.pnVille,
    3,
    'arrondissement',
    'Loandjili',
    'loandjili',
    ['congo', 'pointe-noire', 'pointe-noire', 'loandjili'],
    4,
  ),
  division(
    D.mongo,
    D.pnVille,
    3,
    'arrondissement',
    'Mongo-Mpoukou',
    'mongo-mpoukou',
    ['congo', 'pointe-noire', 'pointe-noire', 'mongo-mpoukou'],
    5,
  ),
  // Une zone « déploiement programmé » sans école ni relevé ouvert : sa page ne vient que de son état public (comme
  // Brazzaville en production).
  division(
    D.mvou,
    D.pnVille,
    3,
    'arrondissement',
    'Mvou-Mvou',
    'mvou-mvou',
    ['congo', 'pointe-noire', 'pointe-noire', 'mvou-mvou'],
    2,
  ),
  division(D.quartier, D.loandjili, 4, 'quarter', '[Quartier Exemple]', 'quartier-exemple', [
    'congo',
    'pointe-noire',
    'pointe-noire',
    'loandjili',
    'quartier-exemple',
  ]),
  division(D.bzvDep, D.congo, 1, 'department', 'Brazzaville', 'brazzaville', [
    'congo',
    'brazzaville',
  ]),
  division(D.bzvVille, D.bzvDep, 2, 'city', 'Brazzaville', 'brazzaville', [
    'congo',
    'brazzaville',
    'brazzaville',
  ]),
  division(
    D.moungali,
    D.bzvVille,
    3,
    'arrondissement',
    'Moungali',
    'moungali',
    ['congo', 'brazzaville', 'brazzaville', 'moungali'],
    4,
    true,
  ),
  division(D.niari, D.congo, 1, 'department', 'Niari', 'niari', ['congo', 'niari']),
  division(
    D.dolisie,
    D.niari,
    2,
    'commune',
    'Dolisie',
    'dolisie',
    ['congo', 'niari', 'dolisie'],
    null,
    true,
  ),
];

// L'état public des zones et le point des villes : ceux de la base (ticket 102). Un faux serveur qui diffère de la base fait
// réussir des parcours qui échoueraient en vrai.
const ETATS_PUBLICS: Partial<Record<string, 'actif' | 'programme'>> = {
  [D.tieTie]: 'actif',
  [D.ngoyo]: 'actif',
  [D.loandjili]: 'programme',
  [D.mongo]: 'programme',
  [D.mvou]: 'programme',
  [D.bzvVille]: 'programme',
};
const POINTS: Partial<Record<string, { latitude: number; longitude: number }>> = {
  [D.pnVille]: { latitude: -4.7975373, longitude: 11.8503297 },
  [D.bzvVille]: { latitude: -4.2694407, longitude: 15.2712256 },
};
const DIVISIONS: DivisionPublique[] = DIVISIONS_BRUTES.map((d) => ({
  ...d,
  deploiement: ETATS_PUBLICS[d.id] ?? null,
  position: POINTS[d.id] ?? null,
}));

const DOMAINES: DomainePublic[] = [
  { slug: 'informatique', nom: 'Informatique', ordre: 10 },
  { slug: 'gestion', nom: 'Gestion', ordre: 20 },
  { slug: 'btp', nom: 'BTP', ordre: 60 },
  { slug: 'sante', nom: 'Santé', ordre: 100 },
  { slug: 'sciences-technologies', nom: 'Sciences et technologies', ordre: 160 },
  { slug: 'autre', nom: 'Autre', ordre: 999 },
];

const dom = (slug: string): FormationPublique['domaine'] => {
  const d = DOMAINES.find((x) => x.slug === slug);
  return d ? { slug: d.slug, nom: d.nom } : null;
};

const formation = (
  cycle: FormationPublique['cycle'],
  titre: string,
  domaine: string | null,
  serie: FormationPublique['serie'],
  diplome: FormationPublique['diplome'],
  rythmes: FormationPublique['rythmes'],
): FormationPublique => ({
  cycle,
  titre,
  domaine: domaine ? dom(domaine) : null,
  serie,
  diplome,
  rythmes,
});

/** v2 (13/11) : une image publique fictive ; toutes servent la même enseigne dessinée (`photoExemple`). */
const media = (
  n: number,
  sujet: MediaPublic['sujet'],
  legende: string | null = null,
): MediaPublic => ({
  id: `95000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sujet,
  legende,
  prisLe: '2026-11-03',
});
const MEDIAS_FAUX = new Set<string>();
const retenir = <T extends { id: string } | null>(m: T): T => {
  if (m) MEDIAS_FAUX.add(m.id);
  return m;
};
// L'admission fictive se cale sur le jour de la construction : les dossiers sont ouverts depuis dix jours, pour douze encore.
const aujourdhui = jourDuCongo();

type Brouillon = Omit<
  EcolePubliee,
  | 'divisionId'
  | 'adresse'
  | 'divisionNoms'
  | 'arrondissement'
  | 'etat'
  | 'verifieeLe'
  | 'formations'
> &
  Partial<Pick<EcolePubliee, 'etat' | 'verifieeLe' | 'formations'>> & { division: string };

const sansRepetition = <T>(valeurs: T[]): T[] =>
  valeurs.filter((v, i) => i === 0 || v !== valeurs[i - 1]);

/** L'adresse et les noms d'une école viennent de sa division, comme dans la base. */
function ecole(b: Brouillon): EcolePubliee {
  const { division: id, ...reste } = b;
  const d = DIVISIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Division inconnue : ${id}`);
  const chaine: DivisionPublique[] = [];
  for (
    let x: DivisionPublique | undefined = d;
    x;
    x = DIVISIONS.find((y) => y.id === x?.parentId)
  ) {
    chaine.unshift(x);
  }
  return {
    etat: 'relevee',
    verifieeLe: null,
    formations: [],
    ...reste,
    divisionId: d.id,
    adresse: sansRepetition(d.adresse),
    divisionNoms: sansRepetition(chaine.map((x) => x.nom)),
    arrondissement: d.niveau === 3 ? d.slug : (d.adresse[d.adresse.length - 1] ?? ''),
  };
}

const ECOLES: EcolePubliee[] = [
  ecole({
    id: '20000000-0000-4000-8000-000000000001',
    institutionId: '10000000-0000-4000-8000-000000000001',
    division: D.tieTie,
    slug: 'complexe-scolaire-exemple',
    numero: '482913',
    photo: { id: '93000000-0000-4000-8000-000000000001', prisLe: '2026-11-03' },
    equipements: [
      {
        id: '83000000-0000-4000-8000-000000000001',
        cle: 'cloture',
        precision: null,
        etat: 'present',
        source: 'terrain',
        constateLe: '2026-11-03',
        note: 'Visible depuis la rue.',
      },
      {
        id: '83000000-0000-4000-8000-000000000002',
        cle: 'cantine',
        precision: null,
        etat: 'absent',
        source: 'ecole',
        constateLe: '2026-11-03',
        note: null,
      },
      {
        id: '83000000-0000-4000-8000-000000000003',
        cle: 'eau',
        precision: null,
        etat: 'non_precise',
        source: 'ecole',
        constateLe: '2026-11-03',
        note: null,
      },
    ],
    frais: [
      {
        id: '73000000-0000-4000-8000-000000000001',
        cycle: 'primaire',
        minimum: 25000,
        maximum: 30000,
        periode: 'mois',
        precisionPeriode: null,
        inscription: null,
        anneeScolaire: null,
        declaresLe: '2026-11-03',
        note: 'Tenue non comprise.',
      },
    ],
    contactPublic: { numero: '242060000009', accordLe: '2026-11-03' },
    nom: '[Complexe scolaire Exemple]',
    etiquette: null,
    quartier: '[Quartier]',
    typeEcole: 'privee',
    niveaux: ['maternelle', 'primaire'],
    programme: 'Programme français-congolais, bilingue',
    repere: '[face au marché]',
    numeroEnseigne: '242060000001',
    latitude: -4.79105,
    longitude: 11.925,
    releveeLe: '2026-11-02T10:00:00Z',
    situeeLe: null,
    misAJourLe: '2026-11-02T10:00:00Z',
  }),
  // Un type « Autre » (c'est écrit, mais ça ne rentre dans aucune case) et un niveau « Autre formation ».
  ecole({
    id: '20000000-0000-4000-8000-000000000002',
    institutionId: '10000000-0000-4000-8000-000000000002',
    division: D.tieTie,
    slug: 'centre-de-formation-exemple',
    numero: '315702',
    nom: '[Centre de formation Exemple]',
    etiquette: null,
    quartier: null,
    typeEcole: 'autre',
    niveaux: ['autre_formation'],
    programme: null,
    repere: null,
    numeroEnseigne: null,
    latitude: -4.7931,
    longitude: 11.9262,
    // Relevée le 2 novembre, modifiée depuis le 20 : la fiche dit « relevée le 2 novembre ».
    releveeLe: '2026-11-02T10:00:00Z',
    situeeLe: null,
    misAJourLe: '2026-11-20T10:00:00Z',
    formations: [
      formation('autre_formation', 'Couture et stylisme', 'autre', null, 'certificat', ['soir']),
    ],
  }),
  // Rien d'écrit sur l'enseigne : ni type, ni niveau, ni programme. Sans position.
  ecole({
    id: '20000000-0000-4000-8000-000000000003',
    institutionId: '10000000-0000-4000-8000-000000000003',
    division: D.tieTie,
    slug: 'ecole-sans-detail-exemple',
    numero: '270846',
    contactPublic: { numero: '242060000002', accordLe: '2026-11-03' },
    nom: '[École sans détail Exemple]',
    etiquette: null,
    quartier: null,
    typeEcole: 'non_indique',
    niveaux: [],
    programme: null,
    repere: null,
    numeroEnseigne: '242060000002',
    latitude: null,
    longitude: null,
    // Une fiche d'avant la date de relevé : la page retombe sur la dernière mise à jour.
    releveeLe: null,
    situeeLe: null,
    misAJourLe: '2026-11-05T10:00:00Z',
  }),
  // Située par l'administration (une école qu'elle connaît), sans relevé : « ajoutée par NTanova ».
  ecole({
    id: '20000000-0000-4000-8000-000000000004',
    institutionId: '10000000-0000-4000-8000-000000000004',
    division: D.tieTie,
    slug: 'ecole-ajoutee-exemple',
    numero: '639158',
    nom: '[École ajoutée Exemple]',
    etiquette: null,
    quartier: null,
    typeEcole: 'publique',
    niveaux: ['primaire'],
    programme: null,
    repere: null,
    numeroEnseigne: null,
    latitude: -4.815,
    longitude: 11.94,
    releveeLe: null,
    situeeLe: '2026-11-03T10:00:00Z',
    misAJourLe: '2026-11-03T10:00:00Z',
  }),
  // Une institution à deux campus : le premier avec tous les cycles et des séries de lycée, le second plus petit.
  ecole({
    id: '20000000-0000-4000-8000-000000000005',
    institutionId: '10000000-0000-4000-8000-000000000005',
    division: D.quartier,
    slug: 'groupe-scolaire-exemple',
    numero: '158427',
    nom: '[Groupe scolaire Exemple]',
    etiquette: 'Campus du quartier',
    quartier: '[Quartier Exemple]',
    typeEcole: 'privee',
    niveaux: ['maternelle', 'primaire', 'college', 'lycee'],
    programme: null,
    repere: '[derrière la station]',
    numeroEnseigne: '242060000003',
    latitude: -4.7955,
    longitude: 11.928,
    releveeLe: '2026-11-02T11:00:00Z',
    situeeLe: null,
    misAJourLe: '2026-11-04T08:00:00Z',
    etat: 'verifiee',
    verifieeLe: '2026-11-04',
    contactPublic: { numero: '242060000005', accordLe: '2026-11-04' },
    // v2 (13/11) : la fiche complète. Logo, couverture, cinq photos, deux nouvelles, frais par classe, profil dit par l'école.
    sigle: 'GSE',
    fondeeEn: 2009,
    siteWeb: 'https://exemple.cg/',
    horaires: ['matin'],
    langues: ['francais'],
    medias: {
      logo: retenir(media(1, 'logo')),
      couverture: retenir(media(2, 'batiment')),
      galerie: [
        retenir(media(3, 'enseigne')),
        retenir(media(4, 'cour', '[La cour]')),
        retenir(media(5, 'salle', '[La salle informatique]')),
        retenir(media(6, 'terrain')),
        retenir(media(7, 'batiment')),
      ],
    },
    nouvelles: [
      {
        id: '96000000-0000-4000-8000-000000000001',
        genre: 'evenement',
        titre: '[Portes ouvertes le samedi]',
        texte: '[Visite des classes et inscriptions pour la rentrée.]',
        publieeLe: decaler(aujourdhui, -5),
        fournieParLEcole: true,
        media: retenir({
          id: '96000000-0000-4000-8000-000000000001',
          sujet: 'activite',
          legende: null,
          prisLe: null,
        }),
      },
      {
        id: '96000000-0000-4000-8000-000000000002',
        genre: 'vie_ecole',
        titre: '[Tournoi de football inter-classes]',
        texte: '[Une ou deux phrases remises par l’école.]',
        publieeLe: decaler(aujourdhui, -20),
        fournieParLEcole: false,
        media: null,
      },
      {
        id: '96000000-0000-4000-8000-000000000003',
        genre: 'evenement',
        titre: '[Une fête passée depuis longtemps]',
        texte: '[Elle ne paraît plus.]',
        publieeLe: decaler(aujourdhui, -90),
        fournieParLEcole: true,
        media: null,
      },
    ],
    equipements: [
      {
        id: '83000000-0000-4000-8000-000000000011',
        cle: 'cantine',
        precision: null,
        etat: 'present',
        source: 'terrain',
        constateLe: '2026-11-03',
        note: null,
      },
      {
        id: '83000000-0000-4000-8000-000000000012',
        cle: 'informatique',
        precision: null,
        etat: 'present',
        source: 'terrain',
        constateLe: '2026-11-03',
        note: null,
      },
      {
        id: '83000000-0000-4000-8000-000000000013',
        cle: 'electricite',
        precision: null,
        etat: 'present',
        source: 'ecole',
        constateLe: '2026-11-04',
        note: null,
      },
    ],
    frais: [
      {
        id: '73000000-0000-4000-8000-000000000011',
        cycle: 'maternelle',
        classe: null,
        minimum: 15000,
        maximum: 15000,
        periode: 'mois',
        precisionPeriode: null,
        inscription: 10000,
        anneeScolaire: '2026-2027',
        declaresLe: '2026-11-04',
        note: null,
        preuve: 'prospectus',
      },
      {
        id: '73000000-0000-4000-8000-000000000012',
        cycle: 'primaire',
        classe: 'CP1 à CM2',
        minimum: 20000,
        maximum: 20000,
        periode: 'mois',
        precisionPeriode: null,
        inscription: 10000,
        anneeScolaire: '2026-2027',
        declaresLe: '2026-11-04',
        note: null,
        preuve: 'prospectus',
      },
      {
        id: '73000000-0000-4000-8000-000000000013',
        cycle: 'college',
        classe: '6e à 4e',
        minimum: 25000,
        maximum: 25000,
        periode: 'mois',
        precisionPeriode: null,
        inscription: 15000,
        anneeScolaire: '2026-2027',
        declaresLe: '2026-11-04',
        note: 'Tenue non comprise.',
        preuve: 'declaration',
      },
    ],
    // Une fiche confirmée : référence sans lien, mot de la direction, une date passée et une à venir.
    agrement: {
      genre: 'autorisation_ouverture',
      precision: null,
      reference: 'arrêté n° [référence]',
      delivreLe: '2024-03-12',
      sourceTexte: 'copie remise par l’établissement',
      sourceLien: null,
    },
    motDirection: {
      texte: '[Nous accueillons les élèves de la sixième à la terminale.]',
      ditLe: '2026-11-04',
    },
    inscriptions: [
      {
        id: '74000000-0000-4000-8000-000000000001',
        anneeScolaire: '2025-2026',
        limite: '2025-12-15',
        declareeLe: '2025-11-05',
      },
      {
        id: '74000000-0000-4000-8000-000000000002',
        anneeScolaire: '2030-2031',
        limite: '2030-12-15',
        declareeLe: '2026-11-04',
      },
    ],
    formations: [
      formation('lycee', 'Série A', 'autre', 'a', 'bac', ['jour']),
      formation('lycee', 'Série C', 'sciences-technologies', 'c', 'bac', ['jour']),
      formation('lycee', 'Série D', 'sciences-technologies', 'd', 'bac', ['jour']),
      formation('lycee', 'Série G2', 'gestion', 'g', 'bac', ['jour', 'soir']),
    ],
  }),
  ecole({
    id: '20000000-0000-4000-8000-000000000006',
    institutionId: '10000000-0000-4000-8000-000000000005',
    division: D.mongo,
    slug: 'groupe-scolaire-exemple',
    numero: '904316',
    nom: '[Groupe scolaire Exemple]',
    etiquette: 'Campus de Mongo-Mpoukou',
    quartier: null,
    typeEcole: 'privee',
    niveaux: ['maternelle', 'primaire'],
    programme: 'Français',
    photo: { id: '93000000-0000-4000-8000-000000000002', prisLe: '2026-11-03' },
    repere: '[près de la mairie]',
    numeroEnseigne: null,
    latitude: -4.8,
    longitude: 11.89,
    releveeLe: '2026-11-03T09:00:00Z',
    situeeLe: null,
    misAJourLe: '2026-11-03T09:00:00Z',
  }),
  // Un institut supérieur : diplômes, domaines, rythmes.
  ecole({
    id: '20000000-0000-4000-8000-000000000007',
    institutionId: '10000000-0000-4000-8000-000000000007',
    division: D.loandjili,
    slug: 'institut-superieur-exemple',
    numero: '527064',
    nom: '[Institut supérieur Exemple]',
    // v2 (13/11) : le supérieur. Sigle, admission en cours, détail des formations et leurs frais.
    sigle: 'ISE',
    admission: {
      anneeScolaire: '2026-2027',
      pieces: ['[Le bac ou le relevé de notes]', '[Un acte de naissance]', '[4 photos d’identité]'],
      ouDeposer: '[Au secrétariat, du lundi au vendredi.]',
      surPlaceSeulement: true,
      declareeLe: '2026-11-04',
      etapes: [
        { etape: 'dossiers', debut: decaler(aujourdhui, -10), fin: decaler(aujourdhui, 12) },
        { etape: 'selection', debut: decaler(aujourdhui, 20), fin: null },
        { etape: 'resultats', debut: decaler(aujourdhui, 30), fin: null },
        { etape: 'rentree', debut: decaler(aujourdhui, 60), fin: null },
      ],
    },
    frais: [
      {
        id: '73000000-0000-4000-8000-000000000021',
        cycle: 'superieur',
        classe: null,
        formationId: '97000000-0000-4000-8000-000000000001',
        minimum: 450000,
        maximum: 450000,
        periode: 'annee',
        precisionPeriode: null,
        inscription: 50000,
        anneeScolaire: '2026-2027',
        declaresLe: '2026-11-04',
        note: null,
        preuve: 'declaration',
      },
    ],
    etiquette: null,
    quartier: null,
    typeEcole: 'privee',
    niveaux: ['superieur'],
    programme: null,
    repere: '[boulevard]',
    numeroEnseigne: '242060000004',
    latitude: -4.798,
    longitude: 11.931,
    releveeLe: '2026-11-04T09:00:00Z',
    situeeLe: null,
    misAJourLe: '2026-11-04T09:00:00Z',
    // Une fiche non confirmée : l'agrément paraît avec son lien, le mot jamais, et la seule date est passée.
    agrement: {
      genre: 'agrement',
      precision: null,
      reference: 'arrêté n° [référence]',
      delivreLe: '2023-06-20',
      sourceTexte: '[Journal officiel]',
      sourceLien: 'https://exemple.cg/arrete',
    },
    motDirection: { texte: '[Ce mot ne paraît pas : fiche non confirmée.]', ditLe: '2026-11-04' },
    inscriptions: [
      {
        id: '74000000-0000-4000-8000-000000000003',
        anneeScolaire: '2025-2026',
        limite: '2025-12-15',
        declareeLe: '2025-11-05',
      },
    ],
    formations: [
      {
        ...formation('superieur', 'BTS Informatique de gestion', 'informatique', null, 'bts', [
          'jour',
          'soir',
        ]),
        id: '97000000-0000-4000-8000-000000000001',
        dureeAnnees: 2,
        niveauDemande: '[Bac, toutes séries]',
        selection: 'dossier',
        fraisDossier: 15000,
        delivrePar: '[L’établissement]',
        agrement: {
          genre: 'agrement',
          precision: null,
          reference: 'arrêté n° [filière]',
          delivreLe: '2024-01-15',
          sourceTexte: '[Journal officiel]',
          sourceLien: null,
        },
      },
      formation('superieur', 'Licence en gestion', 'gestion', null, 'licence', ['soir', 'weekend']),
      formation('superieur', 'Licence Banque et assurance', 'gestion', null, 'licence', ['jour']),
      formation('superieur', 'Master en gestion de projets', 'gestion', null, 'master', [
        'weekend',
      ]),
    ],
  }),
  // Une autre ville : Brazzaville, Moungali.
  ecole({
    id: '20000000-0000-4000-8000-000000000008',
    institutionId: '10000000-0000-4000-8000-000000000008',
    division: D.moungali,
    slug: 'ecole-de-brazzaville-exemple',
    numero: '731590',
    origine: 'school',
    declareeLe: '2026-11-01',
    nom: '[École de Brazzaville Exemple]',
    etiquette: null,
    quartier: null,
    typeEcole: 'confessionnelle',
    niveaux: ['primaire', 'college'],
    programme: null,
    repere: '[près de l’église]',
    numeroEnseigne: null,
    latitude: -4.2634,
    longitude: 15.2429,
    releveeLe: null,
    situeeLe: '2026-11-06T09:00:00Z',
    misAJourLe: '2026-11-06T09:00:00Z',
  }),
  // Une ville sans arrondissement : le campus est directement dans la commune.
  ecole({
    id: '20000000-0000-4000-8000-000000000009',
    institutionId: '10000000-0000-4000-8000-000000000009',
    division: D.dolisie,
    slug: 'college-de-dolisie-exemple',
    numero: '846271',
    nom: '[Collège de Dolisie Exemple]',
    etiquette: null,
    quartier: null,
    typeEcole: 'publique',
    niveaux: ['college'],
    programme: null,
    repere: null,
    numeroEnseigne: null,
    latitude: -4.1983,
    longitude: 12.6666,
    releveeLe: null,
    situeeLe: '2026-11-06T10:00:00Z',
    misAJourLe: '2026-11-06T10:00:00Z',
  }),
];

export const catalogueFaux: PortCatalogue = {
  async lireMedia(id) {
    if (!MEDIAS_FAUX.has(id)) throw new Error('Image inconnue.');
    return photoExemple();
  },
  async lirePhotoPublique(id) {
    if (
      !['93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002'].includes(id)
    )
      throw new Error('Photo inconnue.');
    return photoExemple();
  },
  async divisions() {
    return DIVISIONS;
  },
  async ecoles() {
    return ECOLES;
  },
  async domaines() {
    return DOMAINES;
  },
  async redirections() {
    return [
      {
        de: {
          chemin: ['congo', 'pointe-noire', 'tie-tie'],
          slug: 'ancienne-fiche-exemple',
          numero: '362850',
        },
        versNumero: '482913',
      },
    ];
  },
  // Ticket 147 : le Complexe scolaire Exemple s'appelait « complexe-exemple » dans l'adresse de sa fiche.
  async anciennesAdresses() {
    return [
      { chemin: ['congo', 'pointe-noire', 'tie-tie'], slug: 'complexe-exemple', numero: '482913' },
    ];
  },
};
