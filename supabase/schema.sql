-- IndexCards accounts & sync schema.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.

-- One row per study set per user. The set itself is stored as JSON so the
-- client format can evolve without migrations.
create table if not exists public.sets (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  modified_at bigint      not null,          -- client edit time (ms), decides which copy wins
  deleted     boolean     not null default false,  -- tombstone so deletions sync too
  updated_at  timestamptz not null default now(),  -- server time, used for incremental pulls
  primary key (user_id, id)
);

create index if not exists sets_user_updated_idx on public.sets (user_id, updated_at);

-- Server-side timestamp on every write so "changed since" pulls are reliable
-- regardless of device clocks.
create or replace function public.sets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sets_touch_updated_at on public.sets;
create trigger sets_touch_updated_at
  before insert or update on public.sets
  for each row execute function public.sets_touch_updated_at();

-- Row Level Security: each user can only ever see and change their own rows.
alter table public.sets enable row level security;

drop policy if exists "sets: read own"   on public.sets;
drop policy if exists "sets: insert own" on public.sets;
drop policy if exists "sets: update own" on public.sets;
drop policy if exists "sets: delete own" on public.sets;

create policy "sets: read own"   on public.sets for select to authenticated using ((select auth.uid()) = user_id);
create policy "sets: insert own" on public.sets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sets: update own" on public.sets for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sets: delete own" on public.sets for delete to authenticated using ((select auth.uid()) = user_id);

-- Guard against abuse of the free tier: cap a single set's JSON at ~2 MB.
alter table public.sets drop constraint if exists sets_data_size;
alter table public.sets add constraint sets_data_size check (pg_column_size(data) < 2000000);

-- Self-service account deletion (required by app stores and GDPR).
-- Deleting the auth user cascades to all of their sets.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
