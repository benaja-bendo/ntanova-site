import { dateDeclareeValide, jourDuCongo } from './date-declaration';
import { listes, type Valeur } from './listes';
export const libelleEquipement: Record<Valeur<'equipment_key'>, string> = {
  electricite: 'Électricité',
  eau: 'Eau',
  cantine: 'Cantine',
  transport: 'Transport scolaire',
  bibliotheque: 'Bibliothèque',
  informatique: 'Salle informatique',
  terrain_sport: 'Terrain de sport',
  cloture: 'Clôture',
  autre: 'Autre équipement',
};
export const libelleEtatEquipement: Record<Valeur<'equipment_state'>, string> = {
  present: 'Présent',
  absent: 'Absent selon l’école',
  non_precise: 'Non précisé',
};
export interface EquipementASaisir {
  cle: Valeur<'equipment_key'>;
  precision: string | null;
  etat: Valeur<'equipment_state'>;
  source: Valeur<'fact_source'>;
  constateLe: string;
  note: string | null;
}
export interface Equipement extends EquipementASaisir {
  id: string;
}
export interface SaisieEquipement {
  cle: string;
  precision: string;
  etat: string;
  source: string;
  constateLe: string;
  note: string;
  confirme: boolean;
}
export const saisieEquipementVide = (): SaisieEquipement => ({
  cle: '',
  precision: '',
  etat: '',
  source: '',
  constateLe: '',
  note: '',
  confirme: false,
});
export const saisieDeEquipement = (e: Equipement): SaisieEquipement => ({
  ...e,
  precision: e.precision ?? '',
  note: e.note ?? '',
  confirme: false,
});
export function observableDepuisLaRue(cle: string): boolean {
  return ['cloture', 'terrain_sport', 'autre'].includes(cle);
}
export function lireEquipement(
  s: SaisieEquipement,
  aujourdHui = jourDuCongo(),
): { equipement: EquipementASaisir | null; erreur: string | null } {
  let erreur: string | null = null;
  if (!listes.equipment_key.includes(s.cle as Valeur<'equipment_key'>))
    erreur = 'Choisis l’équipement concerné.';
  else if (s.cle === 'autre' && !s.precision.trim()) erreur = 'Précise cet autre équipement.';
  else if (
    !listes.equipment_state.includes(s.etat as Valeur<'equipment_state'>) ||
    !listes.fact_source.includes(s.source as Valeur<'fact_source'>)
  )
    erreur = 'Indique l’état et la source de cette information.';
  else if (s.source === 'terrain' && (s.etat !== 'present' || !observableDepuisLaRue(s.cle)))
    erreur =
      'Le terrain atteste seulement un élément réellement visible : clôture, terrain de sport ou autre constat précisé. Une absence ou un service doit être déclaré par l’école.';
  else if (!dateDeclareeValide(s.constateLe, aujourdHui))
    erreur = 'Indique la date réelle de déclaration ou d’observation, pas une date future.';
  else if (!s.confirme)
    erreur = 'Confirme la provenance de cette information avant de l’enregistrer.';
  else if (s.precision.trim().length > 80 || s.note.trim().length > 300)
    erreur = 'Raccourcis le nom ou la précision de cet équipement.';
  return {
    erreur,
    equipement: erreur
      ? null
      : {
          cle: s.cle as Valeur<'equipment_key'>,
          precision: s.cle === 'autre' ? s.precision.trim() : null,
          etat: s.etat as Valeur<'equipment_state'>,
          source: s.source as Valeur<'fact_source'>,
          constateLe: s.constateLe,
          note: s.note.trim() || null,
        },
  };
}
export const nomEquipement = (e: Pick<EquipementASaisir, 'cle' | 'precision'>): string =>
  e.cle === 'autre'
    ? (e.precision ?? libelleEquipement.autre)
    : (libelleEquipement[e.cle] ?? 'Équipement à préciser');
export function etatPublicEquipement(e: { source: string; etat: string }): string {
  if (e.source === 'terrain')
    return e.etat === 'present' ? 'Observé sur place' : 'Constat à préciser';
  if (e.source !== 'ecole') return 'Source non précisée';
  return e.etat === 'present'
    ? 'Présence déclarée par l’école'
    : e.etat === 'absent'
      ? 'Absence déclarée par l’école'
      : e.etat === 'non_precise'
        ? 'Non précisé par l’école'
        : 'État non précisé';
}
