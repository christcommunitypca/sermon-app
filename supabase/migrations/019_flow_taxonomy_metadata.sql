-- ── 019_flow_taxonomy_metadata.sql ───────────────────────────────────────────
-- Add lightweight taxonomy metadata to sermon flows so they can be filtered and
-- understood by tradition/style/influence without changing the core flow steps.

alter table public.flows
  add column if not exists tradition_tags text[] not null default '{}',
  add column if not exists style_tags text[] not null default '{}',
  add column if not exists influenced_by text[] not null default '{}';

comment on column public.flows.tradition_tags is
  'Tradition labels attached to a flow, e.g. Reformed, Baptist, Anglican.';

comment on column public.flows.style_tags is
  'Homiletic style labels attached to a flow, e.g. Expository, Narrative, Christ-centered.';

comment on column public.flows.influenced_by is
  'Helpful preacher or tradition influences shown as reference, not strict imitation.';
