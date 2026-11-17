-- Atomic source save + 1–10 independent weekly copies. Existing RLS applies.
create or replace function public.save_event_with_copies(
  p_event_id uuid, p_input jsonb, p_copy_count integer
) returns setof public.events
language plpgsql security invoker set search_path = ''
as $$
declare
  source public.events;
  copied public.events;
  input public.events;
  week integer;
begin
  if auth.uid() is null then raise exception 'Sign in to save events' using errcode = '42501'; end if;
  if p_copy_count is null or p_copy_count < 1 or p_copy_count > 10 then
    raise exception 'Choose between 1 and 10 copies' using errcode = '22023';
  end if;
  input := pg_catalog.jsonb_populate_record(null::public.events, p_input);
  if p_event_id is null then
    insert into public.events(user_id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until)
    values(auth.uid(),input.title,coalesce(input.description,''),input.event_date,input.start_time,input.end_time,input.all_day,input.color,input.note_id,'none',null)
    returning * into source;
  else
    update public.events set title=input.title, description=coalesce(input.description,''), event_date=input.event_date,
      start_time=input.start_time, end_time=input.end_time, all_day=input.all_day, color=input.color,
      note_id=input.note_id, recurrence='none', repeat_until=null, updated_at=pg_catalog.now()
    where id=p_event_id and user_id=auth.uid() returning * into source;
    if not found then raise exception 'Event not found' using errcode = '42501'; end if;
  end if;
  return next source;
  for week in 1..p_copy_count loop
    insert into public.events(user_id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until)
    values(auth.uid(),source.title,source.description,source.event_date + week * 7,source.start_time,source.end_time,source.all_day,source.color,source.note_id,'none',null)
    returning * into copied;
    return next copied;
  end loop;
end;
$$;
revoke all on function public.save_event_with_copies(uuid,jsonb,integer) from public, anon;
grant execute on function public.save_event_with_copies(uuid,jsonb,integer) to authenticated;
