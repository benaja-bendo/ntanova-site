-- « Hors du lot » avec une tolérance de 50 m (ticket #49).
--
-- Jusqu'ici, une position était « hors du lot » dès qu'elle sortait du contour. Avec des lots
-- fins, la limite coupe un quartier : une école à 20 m du trait, ou un GPS précis à 30 m, et le
-- relais était signalé à tort (et sa fiche risquait un refus). Désormais seule une position à plus
-- de 50 m du contour du lot, ou de son arrondissement quand le lot n'a pas de contour, est
-- « hors du lot ». Le téléphone fait le même calcul (`dansLeLot`, src/modele/geo.ts) : il prévient,
-- la base tranche. Le calcul reste fait une seule fois, à l'arrivée du relevé.
--
-- `st_dwithin` sur des géographies compte en mètres, sur l'ellipsoïde ; une position dans le contour
-- est à 0 m. Seule la fonction change : le déclencheur `releves_avant_insertion` la rappelle tel quel.

create or replace function public.releves_avant_insertion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  contour extensions.geometry;
  ecole_corrigee uuid;
begin
  -- L'auteur, l'heure de réception et le statut viennent de la base, jamais du téléphone.
  new.relais_id := coalesce((select auth.uid()), new.relais_id);
  new.recu_le := now();
  if (select auth.uid()) is not null then
    new.statut := 'a_valider';
    new.motif := null;
    new.message_au_relais := null;
    new.decide_le := null;
    new.ecole_id := null;
    new.contact_confirme_le := null;
    new.contact_fonction := null;
  end if;
  new.lot_id := coalesce(new.lot_id, (select r.lot_id from public.relais r where r.id = new.relais_id));

  if new.corrige_releve_id is not null then
    select r.ecole_id into ecole_corrigee
    from public.releves r
    where r.id = new.corrige_releve_id and r.relais_id = new.relais_id;
    if not found then
      raise exception 'La fiche corrigée n''appartient pas à ce relais.' using errcode = '42501';
    end if;
  end if;

  -- Hors du lot : la position est à plus de 50 m du contour du lot (ou de son arrondissement).
  -- Un lot fin coupe un quartier, et un GPS se trompe de 10 à 30 m : la limite n'est pas un mur.
  select coalesce(l.contour, a.contour) into contour
  from public.lots l
  join public.arrondissements a on a.id = l.arrondissement_id
  where l.id = new.lot_id;

  new.hors_lot := case
    when new.position is null or contour is null then null
    else not extensions.st_dwithin(contour::extensions.geography, new.position::extensions.geography, 50)
  end;

  -- Doublon possible : une école ou un autre relevé à moins de 40 m.
  new.doublon_possible := new.position is not null and (
    exists (
      select 1 from public.ecoles e
      where e.publication <> 'retiree'
        and e.position is not null
        and e.id is distinct from ecole_corrigee
        and extensions.st_dwithin(e.position::extensions.geography, new.position::extensions.geography, 40)
    )
    or exists (
      select 1 from public.releves r
      where r.id <> new.id
        and r.id is distinct from new.corrige_releve_id
        and r.corrige_releve_id is distinct from coalesce(new.corrige_releve_id, new.id)
        and r.statut <> 'refuse'
        and r.position is not null
        and extensions.st_dwithin(r.position::extensions.geography, new.position::extensions.geography, 40)
    )
  );

  return new;
end;
$$;
