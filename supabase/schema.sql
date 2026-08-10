create extension if not exists pgcrypto;

create table if not exists public.layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  author_name text not null check (char_length(trim(author_name)) between 1 and 80),
  description text not null default '',
  layout_data jsonb not null,
  thumbnail text,
  version integer not null default 1 check (version > 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint layouts_data_shape check (
    jsonb_typeof(layout_data) = 'object'
    and layout_data ? 'room'
    and layout_data ? 'furniture'
    and jsonb_typeof(layout_data->'furniture') = 'array'
    and layout_data ? 'version'
  )
);

create index if not exists layouts_active_updated_idx on public.layouts (is_archived, updated_at desc);
create index if not exists layouts_name_idx on public.layouts (lower(name));
create index if not exists layouts_author_idx on public.layouts (lower(author_name));

create or replace function public.set_layout_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists layouts_set_updated_at on public.layouts;
create trigger layouts_set_updated_at before update on public.layouts
for each row execute function public.set_layout_updated_at();

alter table public.layouts enable row level security;

grant select, insert, update on public.layouts to anon;

drop policy if exists "public read active layouts" on public.layouts;
create policy "public read active layouts" on public.layouts for select to anon using (is_archived = false);

drop policy if exists "public create layouts" on public.layouts;
create policy "public create layouts" on public.layouts for insert to anon with check (is_archived = false and version = 1);

drop policy if exists "public update layouts" on public.layouts;
create policy "public update layouts" on public.layouts for update to anon using (is_archived = false) with check (version > 0);

-- archived rows are hidden by the SELECT policy, so soft delete is exposed as an
-- atomic function that can still report an optimistic-lock conflict.
create or replace function public.archive_layout(layout_id uuid, expected_version integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare changed integer;
begin
  update public.layouts
  set is_archived = true, version = version + 1
  where id = layout_id and version = expected_version and is_archived = false;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

grant execute on function public.archive_layout(uuid, integer) to anon;

-- Realtime 목록 갱신용. 이미 publication에 포함된 경우 오류가 날 수 있으므로
-- Dashboard > Database > Replication에서 layouts를 직접 활성화해도 됩니다.
do $$ begin
  alter publication supabase_realtime add table public.layouts;
exception when duplicate_object then null;
end $$;

comment on table public.layouts is 'AIAD 공용 연구실 배치안. 인증 없는 프로토타입 정책이므로 실제 권한 통제에는 Supabase Auth가 필요합니다.';
