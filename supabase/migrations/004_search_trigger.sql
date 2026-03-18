-- Migration 004: Full-text search trigger for teaching_sessions
-- Keeps search_index.search_vector in sync automatically

create or replace function public.update_session_search_vector()
returns trigger language plpgsql security definer as $$
begin
  insert into public.search_index (
    church_id, entity_type, entity_id, teacher_id, search_vector, visibility, updated_at
  )
  values (
    NEW.church_id,
    'session',
    NEW.id,
    NEW.teacher_id,
    to_tsvector('english',
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW.scripture_ref, '') || ' ' ||
      coalesce(NEW.notes, '')
    ),
    NEW.visibility,
    now()
  )
  on conflict (entity_type, entity_id) do update set
    search_vector = to_tsvector('english',
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW.scripture_ref, '') || ' ' ||
      coalesce(NEW.notes, '')
    ),
    visibility = NEW.visibility,
    updated_at = now();
  return NEW;
end;
$$;

create trigger session_search_vector_trigger
  after insert or update on public.teaching_sessions
  for each row execute function public.update_session_search_vector();

-- Also clean up search index when session deleted
create or replace function public.delete_session_search_vector()
returns trigger language plpgsql security definer as $$
begin
  delete from public.search_index
  where entity_type = 'session' and entity_id = OLD.id;
  return OLD;
end;
$$;

create trigger session_search_vector_delete_trigger
  after delete on public.teaching_sessions
  for each row execute function public.delete_session_search_vector();
