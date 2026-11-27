import type { FraisEcole, PeriodeCantine, PeriodeFrais } from '../../modele/frais-ecole';
import type { Valeur } from '../../modele/listes';
export interface LigneFrais {
  id: string; campus_id: string; cycle: Valeur<'niveau'>; minimum: number; maximum: number | null;
  period: PeriodeFrais; period_detail: string | null; registration: number | null;
  school_year: string | null; declared_on: string; note: string | null;
  level_label?: string | null; program_id?: string | null; evidence?: 'declaration' | 'prospectus';
  proof_photo_id?: string | null;
  /** Lot 1 du site public (15/11) : les mois facturés, et le jour du OUI de l'école (nul : la ligne attend). */
  billed_months?: number | null;
  confirmed_on?: string | null;
  /** Ticket 199 (A14) : quand la ligne a été saisie. */
  created_at?: string | null;
  /** Ticket 236 : la réinscription, la cantine et sa période (absentes d'une base d'avant). */
  re_registration?: number | null;
  canteen?: number | null;
  canteen_period?: PeriodeCantine | null;
}
export const versFrais = (f: LigneFrais): FraisEcole => ({ id:f.id, cycle:f.cycle, minimum:f.minimum, maximum:f.maximum, periode:f.period, precisionPeriode:f.period_detail, inscription:f.registration, anneeScolaire:f.school_year, declaresLe:f.declared_on, note:f.note, classe:f.level_label ?? null, formationId:f.program_id ?? null, preuve:f.evidence ?? 'declaration', photoPreuve:f.proof_photo_id ?? null, moisFactures:f.billed_months ?? null, confirmeLe:f.confirmed_on ?? null, creeLe:f.created_at ?? null, reinscription:f.re_registration ?? null, cantine:f.canteen ?? null, periodeCantine:f.canteen_period ?? null });
