-- One-time conversion explicitly requested by the owner: one open-ended series
-- becomes its original record plus 10 independent weekly records.
do $$
declare source public.events;
begin
  if (select count(*) from public.events where recurrence='weekly') = 0 then return; end if;
  if (select count(*) from public.events where recurrence='weekly') <> 1
    or (select count(*) from public.events where recurrence='weekly' and repeat_until is null) <> 1 then
    raise exception 'Existing series changed; review before converting';
  end if;
  select * into source from public.events where recurrence='weekly' for update;
  insert into public.events(user_id,title,description,event_date,start_time,end_time,all_day,color,note_id,recurrence,repeat_until)
  select source.user_id,source.title,source.description,source.event_date + n * 7,source.start_time,source.end_time,
    source.all_day,source.color,source.note_id,'none',null from pg_catalog.generate_series(1,10) n;
  update public.events set recurrence='none',repeat_until=null,updated_at=pg_catalog.now() where id=source.id;
end;
$$;
