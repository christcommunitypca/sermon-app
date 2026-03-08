-- ─────────────────────────────────────────────────────────────────────────────
-- Church seed — run once after schema migrations
-- ─────────────────────────────────────────────────────────────────────────────
--
-- BEFORE RUNNING:
-- 1. Create the owner account in Supabase Auth dashboard or via CLI:
--      supabase auth admin create-user --email owner@yourchurch.com --password <pw>
--    Note the returned UUID.
-- 2. Set OWNER_USER_ID below to that UUID.
-- 3. Set CHURCH_SLUG to match NEXT_PUBLIC_CHURCH_SLUG in your .env.local
--
-- RUN:
--    psql <connection-string> -f supabase/seeds/church.sql
--  OR via Supabase Studio SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Configuration — edit these before running ─────────────────────────────────
do $$
declare
  v_owner_user_id  uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE with real UUID
  v_church_name    text := 'Grace Community Church';               -- REPLACE
  v_church_slug    text := 'grace-community';                      -- REPLACE — must match NEXT_PUBLIC_CHURCH_SLUG
  v_church_id      uuid;
begin

  -- ── 1. Insert church ───────────────────────────────────────────────────────
  insert into public.churches (name, slug, owner_id)
  values (v_church_name, v_church_slug, v_owner_user_id)
  on conflict (slug) do nothing
  returning id into v_church_id;

  -- If church already existed, fetch its ID
  if v_church_id is null then
    select id into v_church_id from public.churches where slug = v_church_slug;
  end if;

  -- ── 2. Insert owner membership ─────────────────────────────────────────────
  insert into public.church_members (church_id, user_id, role, is_active)
  values (v_church_id, v_owner_user_id, 'owner', true)
  on conflict (church_id, user_id) do update set role = 'owner', is_active = true;

  -- ── 3. Seed tag taxonomies ─────────────────────────────────────────────────
  insert into public.tag_taxonomies (church_id, name, slug, is_system)
  values
    (v_church_id, 'Scripture',      'scripture',     true),
    (v_church_id, 'Doctrine',       'doctrine',      true),
    (v_church_id, 'Theme',          'theme',         true),
    (v_church_id, 'Audience',       'audience',      true),
    (v_church_id, 'Season',         'season',        true),
    (v_church_id, 'Teaching Type',  'teaching_type', true),
    (v_church_id, 'Tradition',      'tradition',     true)
  on conflict (church_id, slug) do nothing;

  raise notice 'Seed complete. church_id = %', v_church_id;
end;
$$;
