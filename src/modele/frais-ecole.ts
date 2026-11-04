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
}
export interface FraisEcole extends FraisASaisir {
  id: string;
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
    s.note.trim().length > 300
  )
    erreur = 'Raccourcis l’année scolaire, la période ou la précision.';
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
        },
  };
}
export const francsCFA = (n: number): string => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
export const montantFrais = (f: Pick<FraisASaisir, 'minimum' | 'maximum'>): string =>
  f.minimum === f.maximum
    ? francsCFA(f.minimum)
    : `${new Intl.NumberFormat('fr-FR').format(f.minimum)} à ${francsCFA(f.maximum)}`;
