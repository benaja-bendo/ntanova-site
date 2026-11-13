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
}
export interface FraisEcole extends FraisASaisir {
  id: string;
  /** v2 (13/11) : la classe (« CM2 », « 6e à 4e ») quand la ligne en précise une ; la formation du supérieur ; la preuve. */
  classe?: string | null;
  preuve?: 'declaration' | 'prospectus';
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
    inscription = s.inscription.trim() === '' ? null : entier(s.inscription);
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
        },
  };
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
