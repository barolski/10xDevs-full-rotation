-- Organizer role (F-02): an account is an organizer iff it has a row here.
-- Organizer is an extension of a player account, not a separate account type.
-- Rows are granted/revoked only by the project owner via SQL (see README);
-- no client role has a write path.

create table public.organizers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.organizers enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- including TRUNCATE, which RLS does not cover. Close everything, then reopen
-- only SELECT for signed-in users.
revoke all on public.organizers from anon, authenticated;
grant select on public.organizers to authenticated;

create policy "organizers_select_own"
  on public.organizers
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Single source of truth for "is the current user an organizer?", used by the
-- app middleware (via rpc) and by RLS policies in later slices.
create function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizers where user_id = auth.uid()
  );
$$;

revoke execute on function public.is_organizer() from public, anon;
grant execute on function public.is_organizer() to authenticated;
