-- Une décision qui renvoie ou refuse une fiche dit toujours quoi faire (ticket #80).
--
-- Chaque motif a sa phrase automatique côté relais (« La photo est floue. »), mais « autre » est le motif des cas qui
-- ne rentrent dans aucune case : sa phrase de repli (« Une information est à revoir. ») ne dit rien, et un relais s'est
-- déjà retrouvé renvoyé sans savoir quoi corriger. Avec ce motif, le message est obligatoire, pour une correction comme
-- pour un refus (un refus est définitif : il doit dire pourquoi).
--
-- Un message vide, ou fait d'espaces et de retours à la ligne seulement (`btrim` ne retire que les espaces : d'où
-- `!~ '\S'`), n'est pas un message : comme `trim()` côté écran.
--
-- Mêmes signatures, mêmes droits (`create or replace` les garde) : rien ne casse, dans aucun ordre de mise en ligne.
-- Un ancien écran qui envoie « autre » sans message reçoit ce refus, avec sa phrase. Les lignes déjà écrites sans message
-- se lisent toujours (« Une information est à revoir. ») : rien n'est réécrit.

create or replace function public.request_correction(p_submission uuid, p_reason public.motif_decision, p_message text default null)
returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  if p_reason = 'autre' and coalesce(p_message, '') !~ '\S' then
    raise exception 'Avec le motif « autre », écris un message : le relais doit savoir quoi faire.' using errcode = '22023';
  end if;
  update public.field_submissions s set
    status = 'a_corriger', reason = p_reason, message_to_relay = p_message, decided_at = now()
  where s.id = p_submission and s.status in ('a_valider', 'a_corriger');
  if not found then
    raise exception 'Relevé introuvable ou déjà décidé.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.refuse_submission(p_submission uuid, p_reason public.motif_decision, p_message text default null)
returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  if p_reason = 'autre' and coalesce(p_message, '') !~ '\S' then
    raise exception 'Avec le motif « autre », écris un message : le relais doit savoir quoi faire.' using errcode = '22023';
  end if;
  update public.field_submissions s set
    status = 'refuse', reason = p_reason, message_to_relay = p_message, decided_at = now()
  where s.id = p_submission and s.status in ('a_valider', 'a_corriger');
  if not found then
    raise exception 'Relevé introuvable ou déjà décidé.' using errcode = 'P0002';
  end if;
end;
$$;
