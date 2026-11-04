import type { Equipement } from '../../modele/equipements-ecole';
import type { Valeur } from '../../modele/listes';
export interface LigneEquipement { id:string;campus_id:string;key:Valeur<'equipment_key'>;custom_label:string|null;value:Valeur<'equipment_state'>;source:Valeur<'fact_source'>;observed_on:string;note:string|null }
export const versEquipement=(e:LigneEquipement):Equipement=>({id:e.id,cle:e.key,precision:e.custom_label,etat:e.value,source:e.source,constateLe:e.observed_on,note:e.note});
