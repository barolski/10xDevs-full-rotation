-- LOCAL / CI ONLY. Applied by `supabase start` (fresh instance) and `supabase db reset`.
-- Never push this file to production: it contains a known password.
-- `supabase db push` must never be run with `--include-seed`.

-- Seeded organizer account: organizer@example.com / Organizer-Passw0rd!
-- Token columns must be '' (not NULL) or GoTrue fails to sign the user in.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'organizer@example.com',
  extensions.crypt('Organizer-Passw0rd!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'email',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"organizer@example.com","email_verified":true}',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

insert into public.organizers (user_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (user_id) do nothing;
