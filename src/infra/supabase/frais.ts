import type { FraisEcole, PeriodeFrais } from '../../modele/frais-ecole';
import type { Valeur } from '../../modele/listes';
export interface LigneFrais {
  id: string; campus_id: string; cycle: Valeur<'niveau'>; minimum: number; maximum: number;
  period: PeriodeFrais; period_detail: string | null; registration: number | null;
  school_year: string | null; declared_on: string; note: string | null;
  level_label?: string | null; program_id?: string | null; evidence?: 'declaration' | 'prospectus';
  proof_photo_id?: string | null;
}
export const versFrais = (f: LigneFrais): FraisEcole => ({ id:f.id, cycle:f.cycle, minimum:f.minimum, maximum:f.maximum, periode:f.period, precisionPeriode:f.period_detail, inscription:f.registration, anneeScolaire:f.school_year, declaresLe:f.declared_on, note:f.note, classe:f.level_label ?? null, formationId:f.program_id ?? null, preuve:f.evidence ?? 'declaration', photoPreuve:f.proof_photo_id ?? null });
