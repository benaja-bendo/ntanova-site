-- Un motif de plus pour demander à un relais de reprendre la position (ticket n° 67).
--
-- `hors_lot` (« l'école est hors de votre lot ») disait au relais que son école n'était pas où il devait être. Le lot
-- n'est plus une limite : l'administration ne le propose plus. La demande « reprenez la position devant l'entrée »
-- reste possible, sous son vrai nom. On ne retire jamais une valeur : `hors_lot` reste dans la liste pour lire les
-- fiches déjà renvoyées. La recette est celle de `supabase/schema.md`, « Les listes » : `not valid` (obligatoire pour
-- une liste en tableau comme `niveau`, sans danger ici), et on ne lance jamais `validate constraint`. Élargir une
-- liste n'invalide aucune ligne.
alter domain public.motif_decision drop constraint motif_decision_check;
alter domain public.motif_decision add constraint motif_decision_check
  check (value in ('photo_floue', 'hors_lot', 'doublon', 'enfant_sur_photo', 'autre', 'position_imprecise')) not valid;
