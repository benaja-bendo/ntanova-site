// Les cas extrêmes de la fiche d'une école (skill « break-ui », 18/11/2026) : la vraie fiche d'abord, puis la même école
// avec les valeurs les plus longues que la base accepte (nom 200, programme 200, légende 60, note de frais 500, repère 300,
// titre de formation 160), une fiche presque vide, et une fiche où tout vaut « un ». Réservé au développement : la page
// qui s'en sert n'existe pas en production. Les longueurs viennent des contraintes `check` des migrations.
import type { EcolePubliee, FormationPublique } from '../../modele/ports';
import type { Equipement } from '../../modele/equipements-ecole';
import type { FraisEcole } from '../../modele/frais-ecole';

export const CAS = ['demo', 'pire', 'vide', 'un'] as const;
export type CasFiche = (typeof CAS)[number];
export const LIBELLES_CAS: Record<CasFiche, string> = {
  demo: 'Vraie fiche',
  pire: 'Pire cas',
  vide: 'Presque vide',
  un: 'Un de chaque',
};

const jour = '2026-11-18';

const formation = (
  n: number,
  titre: string,
  extra: Partial<FormationPublique> = {},
): FormationPublique => ({
  id: `99000000-0000-4000-8000-00000000000${n}`,
  cycle: 'superieur',
  titre,
  domaine: { slug: 'gestion', nom: 'Gestion, commerce et administration des entreprises' },
  serie: null,
  diplome: 'licence',
  rythmes: ['jour', 'soir', 'weekend'],
  dureeAnnees: 3,
  niveauDemande: 'Bac toutes séries, ou diplôme étranger reconnu équivalent par le ministère',
  selection: 'dossier_entretien',
  fraisDossier: 1_250_000,
  delivrePar: 'Université Marien-Ngouabi, par convention signée avec l’établissement',
  detailsDitsLe: jour,
  ...extra,
});

const frais = (
  n: number,
  formationId: string | null,
  extra: Partial<FraisEcole> = {},
): FraisEcole => ({
  id: `98000000-0000-4000-8000-00000000000${n}`,
  cycle: 'superieur',
  classe: null,
  formationId,
  minimum: 1_850_000,
  maximum: 12_500_000,
  periode: 'annee',
  precisionPeriode: null,
  inscription: 1_175_000,
  anneeScolaire: '2026-2027',
  declaresLe: jour,
  confirmeLe: jour,
  note: null,
  preuve: 'declaration',
  ...extra,
});

const equipement = (n: number, extra: Partial<Equipement>): Equipement => ({
  id: `96000000-0000-4000-8000-00000000000${n}`,
  cle: 'electricite',
  precision: null,
  etat: 'present',
  source: 'ecole',
  constateLe: jour,
  note: null,
  ...extra,
});

/** Un texte de la longueur exacte que la base accepte, en phrases plausibles. */
const coupe = (texte: string, max: number) => texte.slice(0, max).trimEnd();

export function casDeLaFiche(base: EcolePubliee): Record<CasFiche, EcolePubliee> {
  const galerie = base.medias?.galerie ?? [];
  const medias = base.medias ?? { logo: null, couverture: null, galerie: [] };
  const legendes = [
    'Amphithéâtre principal de 450 places, bâtiment administratif',
    'Laboratoire : étuve, autoclave, poste de sécurité microbio',
    'Salle informatique',
    'Bibliothèque universitaire et salle de lecture du 2e étage',
    'Électrophorèse, biologie moléculaire',
    'Cour',
  ];
  const formations = [
    formation(
      1,
      coupe(
        'Licence professionnelle en Management des Organisations, Gestion des Ressources Humaines, Comptabilité-Contrôle-Audit et Fiscalité des Entreprises (parcours en alternance)',
        160,
      ),
    ),
    formation(2, 'BTS', {
      diplome: 'bts',
      dureeAnnees: 2,
      rythmes: [],
      niveauDemande: null,
      selection: null,
      fraisDossier: null,
      delivrePar: null,
      domaine: null,
    }),
    formation(3, 'Master en Ingénierie Financière et Banque', {
      diplome: 'master',
      dureeAnnees: 1,
      selection: 'concours',
      fraisDossier: 0,
    }),
    formation(4, 'Doctorat en Sciences Juridiques', { diplome: 'doctorat', dureeAnnees: 5 }),
    formation(5, 'Certificat de langue anglaise (TOEIC)', {
      diplome: 'certificat',
      dureeAnnees: null,
    }),
    formation(6, 'Licence en Génie Informatique (Data Science, Cybersécurité, Cloud)', {
      domaine: { slug: 'informatique', nom: 'Informatique' },
    }),
    formation(7, 'Formation sans diplôme précisé', { diplome: null, dureeAnnees: null }),
  ];
  const pire: EcolePubliee = {
    ...base,
    nom: coupe(
      'Institut Supérieur de Management, de Commerce et des Technologies de l’Information et de la Communication Sainte-Marie-Madeleine-de-Mpita (ISMCTIC-SMMM), établissement privé d’enseignement supérieur',
      200,
    ),
    sigle: 'ISMCTIC-SMMM',
    etiquette: 'Campus annexe de Mpita, derrière le marché Tié-Tié, bâtiment B, 2e étage',
    quartier: 'Mpita-Château-d’eau-Fond-Tié-Tié',
    fondeeEn: 1987,
    siteWeb:
      'https://www.institut-superieur-management-commerce-sainte-marie-madeleine.cg/formations/admissions-2026-2027',
    langues: ['francais', 'anglais'],
    programme: coupe(
      'Licences en 3 ans (Génie informatique, Biotechnologie, Gestion des entreprises, Droit des affaires) ; masters en 2 ans ; cours en français, anglais progressif dès la deuxième année ; stages obligatoires en entreprise',
      200,
    ),
    repere: coupe(
      'Avenue de l’aéroport, après la station Total du rond-point Kassaï, deuxième rue à gauche en venant du centre-ville, portail bleu en face de la pharmacie Sainte-Anne, à côté de l’église évangélique ; demander le gardien au poste de sécurité, l’entrée des étudiants est par la ruelle derrière le terrain de basket',
      300,
    ),
    numeroEnseigne: '242061234567',
    formations,
    frais: [
      frais(1, formations[0]?.id ?? null, {
        periode: 'mois',
        moisFactures: 10,
        minimum: 125_000,
        maximum: 125_000,
      }),
      frais(2, formations[2]?.id ?? null),
      frais(3, null, {
        classe: 'L1 et L2 (tronc commun, toutes filières confondues, cours du soir compris)',
        periode: 'mois',
        minimum: 80_000,
        maximum: 1_250_000,
        note: coupe(
          'Étude de dossier (concours d’entrée) : 20 000. Frais annexes par an : 75 000 (kit pratique) et 50 000 (activités extra-académiques). Mensualité payée avant le 10 du mois, par virement sur le compte de l’université ou en espèces à la caisse, contre reçu. Réduction de 10 % pour le deuxième enfant inscrit, de 15 % à partir du troisième. Les frais d’examen de fin de cycle (150 000) et de soutenance (250 000) sont payés à part, en une fois, avant la session.',
          500,
        ),
      }),
      frais(4, null, { classe: 'L3', minimum: 0, maximum: 0, inscription: null }),
    ],
    equipements: [
      equipement(1, {
        cle: 'electricite',
        note: 'Groupe électrogène de secours, 2 heures par jour',
      }),
      equipement(2, { cle: 'eau', source: 'terrain' }),
      equipement(3, { cle: 'informatique', note: '42 postes, connexion par fibre optique' }),
      equipement(4, { cle: 'toilettes' }),
      equipement(5, { cle: 'bibliotheque', etat: 'absent' }),
      equipement(6, { cle: 'cantine', etat: 'non_precise' }),
      equipement(7, { cle: 'transport' }),
      equipement(8, { cle: 'terrain_sport' }),
      equipement(9, {
        cle: 'autre',
        precision: 'Laboratoire de biotechnologie et de biologie moléculaire',
      }),
    ],
    admission: base.admission
      ? {
          ...base.admission,
          pieces: [
            'Pièce d’identité de l’étudiant (carte nationale d’identité, passeport ou acte de naissance)',
            'Pièce d’identité d’un parent ou tuteur légal',
            'Attestation de réussite au bac',
            'Relevé de notes du bac',
            '2 photos d’identité',
            'Toute condition médicale ou alimentaire connue',
            'Certificat de nationalité',
            'Reçu des frais de dossier',
            'Lettre de motivation manuscrite',
            'Curriculum vitae',
          ],
          ouDeposer: coupe(
            'Auprès de l’équipe Admissions de l’université, avenue de l’aéroport, du lundi au vendredi de 8 h à 15 h et le samedi de 9 h à 12 h ; candidature en ligne sur le site de l’université, puis test d’admission écrit et entretien individuel avec le responsable de la filière choisie',
            300,
          ),
        }
      : null,
    medias: {
      ...medias,
      galerie: [...galerie, ...galerie].map((m, i) => ({
        ...m,
        legende: legendes[i % legendes.length] ?? null,
      })),
    },
  };
  const vide: EcolePubliee = {
    ...base,
    nom: 'Lycée',
    sigle: null,
    etiquette: null,
    quartier: null,
    fondeeEn: null,
    siteWeb: null,
    langues: [],
    programme: null,
    repere: null,
    numeroEnseigne: null,
    formations: [],
    frais: [],
    equipements: [],
    admission: null,
    nouvelles: [],
    medias: { logo: null, couverture: null, galerie: [] },
    photo: null,
    agrement: null,
  };
  const un: EcolePubliee = {
    ...base,
    nom: 'Jo',
    formations: formations.slice(1, 2),
    frais: [frais(9, null, { minimum: 1, maximum: 1, inscription: 1 })],
    equipements: [equipement(1, { cle: 'eau' })],
    medias: {
      ...medias,
      galerie: galerie.slice(0, 1),
    },
    admission: base.admission
      ? { ...base.admission, pieces: ['Le bac'], ouDeposer: 'Sur place.' }
      : null,
  };
  return { demo: base, pire, vide, un };
}
