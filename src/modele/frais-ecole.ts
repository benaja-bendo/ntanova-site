import { dateDeclareeValide, jourDuCongo } from './date-declaration';
import { listes, type Valeur } from './listes';
export const periodesFrais = {
  mois: 'Par mois',
  trimestre: 'Par trimestre',
  annee: 'Par année',
  autre: 'Autre période',
} as const;
export type PeriodeFrais = keyof typeof periodesFrais;
export interface FraisASaisir {
  cycle: Valeur<'niveau'>;
  minimum: number;
  maximum: number;
  periode: PeriodeFrais;
  precisionPeriode: string | null;
  inscription: number | null;
  anneeScolaire: string | null;
  declaresLe: string;
  note: string | null;
  /** v2 (13/11) : la classe (« CM2 ») ; la photo du prospectus qui prouve la ligne (photo de travail, jamais publique). */
  classe?: string | null;
  photoPreuve?: string | null;
  /** La formation du supérieur à qui la ligne est rattachée (lot I : gardée quand on modifie la ligne). */
  formationId?: string | null;
  /** Lot 2 du site public (15/11) : les mois facturés dans l'année, pour des frais au mois (1 à 12) ; nul : pas dit. */
  moisFactures?: number | null;
}
export interface FraisEcole extends FraisASaisir {
  id: string;
  /** v2 (13/11) : la classe (« CM2 », « 6e à 4e ») quand la ligne en précise une ; la formation du supérieur ; la preuve. */
  classe?: string | null;
  preuve?: 'declaration' | 'prospectus';
  /**
   * Lot 2 : le jour du OUI écrit de l'école sur ces montants (`confirmed_on`). Nul ou absent : la ligne est préparée, elle
   * ne paraît pas sur le site. Une ligne modifiée le perd (la base l'efface).
   */
  confirmeLe?: string | null;
}
export interface SaisieFrais {
  cycle: string;
  minimum: string;
  maximum: string;
  periode: string;
  precisionPeriode: string;
  inscription: string;
  anneeScolaire: string;
  declaresLe: string;
  note: string;
  declarationConfirmee: boolean;
  /** v2 (13/11) : la classe, facultative ; la photo du prospectus quand la ligne y a été lue. */
  classe?: string;
  photoPreuve?: string | null;
  formationId?: string | null;
  /** Lot 2 : les mois facturés, tels que tapés (« 10 ») ; vide : pas dit. */
  moisFactures?: string;
}
export const saisieFraisVide = (): SaisieFrais => ({
  cycle: '',
  minimum: '',
  maximum: '',
  periode: '',
  precisionPeriode: '',
  inscription: '',
  anneeScolaire: '',
  declaresLe: '',
  note: '',
  declarationConfirmee: false,
  classe: '',
  photoPreuve: null,
  moisFactures: '',
});
export const saisieDeFrais = (f: FraisEcole): SaisieFrais => ({
  ...f,
  minimum: String(f.minimum),
  maximum: String(f.maximum),
  inscription: f.inscription === null ? '' : String(f.inscription),
  precisionPeriode: f.precisionPeriode ?? '',
  anneeScolaire: f.anneeScolaire ?? '',
  note: f.note ?? '',
  declarationConfirmee: false,
  classe: f.classe ?? '',
  photoPreuve: f.photoPreuve ?? null,
  moisFactures: f.moisFactures == null ? '' : String(f.moisFactures),
});
function entier(s: string): number | null {
  const n = s.trim().replace(/[\s\u00a0\u202f]/g, '');
  return /^\d+$/.test(n) && Number(n) <= 2147483647 ? Number(n) : null;
}
export function lireFraisEcole(
  s: SaisieFrais,
  aujourdHui = jourDuCongo(),
): { frais: FraisASaisir | null; erreur: string | null } {
  const minimum = entier(s.minimum),
    maximum = s.maximum.trim() === '' ? minimum : entier(s.maximum),
    inscription = s.inscription.trim() === '' ? null : entier(s.inscription),
    moisTapes = (s.moisFactures ?? '').trim(),
    mois = moisTapes === '' ? null : entier(moisTapes);
  let erreur: string | null = null;
  if (!listes.niveau.includes(s.cycle as Valeur<'niveau'>)) erreur = 'Choisis le cycle concerné.';
  else if (
    minimum === null ||
    maximum === null ||
    maximum < minimum ||
    (s.inscription.trim() !== '' && inscription === null)
  )
    erreur =
      'Indique des montants entiers positifs ou nuls en FCFA, avec un maximum au moins égal au minimum.';
  else if (
    !Object.hasOwn(periodesFrais, s.periode) ||
    (s.periode === 'autre' && !s.precisionPeriode.trim())
  )
    erreur = 'Indique la période et précise-la si elle est différente.';
  // Les mois facturés ne valent que pour des frais au mois : une autre période les laisse de côté (la base les refuse).
  else if (s.periode === 'mois' && moisTapes !== '' && (mois === null || mois < 1 || mois > 12))
    erreur = 'Les mois facturés vont de 1 à 12.';
  else if (!dateDeclareeValide(s.declaresLe, aujourdHui))
    erreur = 'Indique la date réelle de déclaration, pas une date future.';
  else if (!s.declarationConfirmee)
    erreur = 'Confirme que ces frais ont été communiqués par l’école pour être affichés.';
  else if (
    s.anneeScolaire.trim().length > 30 ||
    s.precisionPeriode.trim().length > 80 ||
    s.note.trim().length > 300 ||
    (s.classe ?? '').trim().length > 40
  )
    erreur = 'Raccourcis l’année scolaire, la période, la classe ou la précision.';
  return {
    erreur,
    frais: erreur
      ? null
      : {
          cycle: s.cycle as Valeur<'niveau'>,
          minimum: minimum!,
          maximum: maximum!,
          periode: s.periode as PeriodeFrais,
          precisionPeriode: s.periode === 'autre' ? s.precisionPeriode.trim() : null,
          inscription,
          anneeScolaire: s.anneeScolaire.trim() || null,
          declaresLe: s.declaresLe,
          note: s.note.trim() || null,
          classe: (s.classe ?? '').trim() || null,
          photoPreuve: s.photoPreuve ?? null,
          formationId: s.formationId ?? null,
          moisFactures: s.periode === 'mois' ? mois : null,
        },
  };
}

/**
 * Lot 2 : une ligne enregistrée change-t-elle ? Une ligne qui ne change pas n'est pas réécrite, et garde ainsi le OUI de
 * l'école. La photo du prospectus n'en décide pas : c'est la preuve de la ligne, pas son contenu.
 */
export function ligneChangee(avant: FraisEcole, apres: FraisASaisir): boolean {
  const cles = [
    'cycle',
    'minimum',
    'maximum',
    'periode',
    'precisionPeriode',
    'inscription',
    'anneeScolaire',
    'declaresLe',
    'note',
    'classe',
    'formationId',
    'moisFactures',
  ] as const;
  return cles.some((c) => (avant[c] ?? null) !== (apres[c] ?? null));
}

/** Lot 2 : où en est le OUI de l'école sur ses frais enregistrés. */
export type EtatDuOui =
  | { etat: 'vide' }
  /** Des lignes l'attendent (`lignes`) ; le OUI ne peut pas précéder la plus récente de leurs dates. */
  | { etat: 'attend'; lignes: number; auPlusTot: string }
  | { etat: 'confirme'; le: string };

export function etatDuOui(
  frais: readonly Pick<FraisEcole, 'confirmeLe' | 'declaresLe'>[],
): EtatDuOui {
  if (frais.length === 0) return { etat: 'vide' };
  const attente = frais.filter((f) => !f.confirmeLe);
  if (attente.length > 0)
    return {
      etat: 'attend',
      lignes: attente.length,
      auPlusTot: attente
        .map((f) => f.declaresLe)
        .sort()
        .at(-1)!,
    };
  return {
    etat: 'confirme',
    le: frais
      .map((f) => f.confirmeLe!)
      .sort()
      .at(-1)!,
  };
}

/** Le jour du OUI : une date réelle, pas dans le futur, pas avant les frais qu'il confirme. L'erreur, ou null. */
export function erreurDuOui(
  le: string,
  auPlusTot: string,
  aujourdHui = jourDuCongo(),
): string | null {
  if (!dateDeclareeValide(le, aujourdHui)) return 'Donne le jour réel où l’école a répondu OUI.';
  if (le < auPlusTot) return 'Le OUI ne peut pas précéder la date des frais qu’il confirme.';
  return null;
}

/** Les mois facturés le plus souvent dits sur les lignes au mois (pour préremplir), ou null. */
export function moisFacturesDesLignes(frais: readonly FraisEcole[]): number | null {
  const compte = new Map<number, number>();
  for (const f of frais)
    if (f.periode === 'mois' && f.moisFactures != null)
      compte.set(f.moisFactures, (compte.get(f.moisFactures) ?? 0) + 1);
  let meilleur: number | null = null;
  for (const [mois, n] of compte)
    if (meilleur === null || n > (compte.get(meilleur) ?? 0)) meilleur = mois;
  return meilleur;
}

/**
 * Lot I, « Même inscription sur toutes les lignes » : les lignes dont l'inscription change, avec le nouveau montant. Le reste
 * de chaque ligne (montant, période, preuve, formation, date) ne bouge pas ; une ligne qui a déjà ce montant n'est pas
 * réécrite.
 */
export function avecMemeInscription(
  frais: readonly FraisEcole[],
  inscription: number,
): FraisEcole[] {
  return frais.filter((f) => f.inscription !== inscription).map((f) => ({ ...f, inscription }));
}

/** L'inscription la plus fréquente parmi les lignes (pour préremplir), ou null. */
export function inscriptionLaPlusFrequente(frais: readonly FraisEcole[]): number | null {
  const compte = new Map<number, number>();
  for (const f of frais)
    if (f.inscription !== null) compte.set(f.inscription, (compte.get(f.inscription) ?? 0) + 1);
  let meilleure: number | null = null;
  for (const [montant, n] of compte)
    if (meilleure === null || n > (compte.get(meilleure) ?? 0)) meilleure = montant;
  return meilleure;
}

/** Une saisie de montant en FCFA (« 25 000 ») : l'entier, ou null. */
export const lireMontant = (s: string): number | null => entier(s);
export const francsCFA = (n: number): string => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
export const montantFrais = (f: Pick<FraisASaisir, 'minimum' | 'maximum'>): string =>
  f.minimum === f.maximum
    ? francsCFA(f.minimum)
    : `${new Intl.NumberFormat('fr-FR').format(f.minimum)} à ${francsCFA(f.maximum)}`;
