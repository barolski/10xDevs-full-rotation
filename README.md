# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

This project uses Supabase Auth's built-in `auth.users` table, plus any application tables you add as version-controlled SQL migrations — see [Database Migrations](#database-migrations) below for the local authoring workflow.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Database Migrations

Schema changes are version-controlled as SQL files under `supabase/migrations/`.

1. Generate a new timestamped migration file:

```bash
npm run db:new -- <name>
```

2. Hand-write the DDL in the generated file.

3. Re-apply all migrations (plus the seed script) against your local instance to verify:

```bash
npm run db:reset
```

4. Commit the migration file.

CI's `smoke` job already applies any committed migration automatically — it runs `supabase start` against a fresh instance on every run — so no separate CI step is needed to keep local and CI databases in sync.

#### Production deploys

The `deploy` job in `.github/workflows/ci.yml` automatically pushes any committed migrations to the linked production Supabase project on merge to `main`, before the Worker code deploys. This requires three repository secrets, set once:

| Secret                  | Where to find it                                                        |
| ----------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens                            |
| `SUPABASE_DB_PASSWORD`  | Supabase dashboard → your project → Settings → Database                 |
| `SUPABASE_PROJECT_REF`  | Supabase dashboard → your project → Settings → API (or the project URL) |

If any of the three secrets is unset, the push step is skipped and the rest of the `deploy` job still runs.

> **Note:** `wrangler rollback` never reverts schema changes. Keep migrations backward-compatible for at least one deploy cycle so a Worker rollback doesn't break against newer schema.

### Organizer accounts

An account is an organizer when it has a row in `public.organizers`. Being an organizer adds permissions on top of a regular player account: organizers can still sign up for and play in trainings. No client can grant the role; it is managed with SQL only.

**Local and CI:** `supabase/seed.sql` creates an organizer account, `organizer@example.com` / `Organizer-Passw0rd!`, on every fresh `supabase start` and `npm run db:reset`. The seed is local-only and is never pushed to production.

**Production:** the person signs up normally, then the project owner runs this in the Supabase dashboard's SQL editor:

```sql
-- grant
insert into public.organizers (user_id) select id from auth.users where email = '<email>';

-- revoke
delete from public.organizers where user_id = (select id from auth.users where email = '<email>');
```

The change takes effect on the user's next request; no sign-out is needed.

### Trainings

`public.trainings` holds the trainings organizers create and share as `/t/<id>`. Access is enforced in the database, not only in the app:

- Any signed-in account can read trainings; `anon` has no access.
- Only organizers (`public.is_organizer()`) can insert or update them, and only the `title`, `starts_at`, `location` and `note` columns. Nobody can delete them.
- A trigger rejects a training that starts within 3 hours (`training_starts_too_soon`) and any edit once sign-ups have closed, 3 hours before the start (`training_signup_closed`).

**Local only:** to create a training whose sign-ups are already closed (for manual checks), bypass the trigger in a local SQL session. Never do this in production.

```sql
set session_replication_role = replica;
insert into public.trainings (title, starts_at, location) values ('Closed training', now() + interval '1 hour', 'Hall');
set session_replication_role = default;
```

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) and the organizer gate (anonymous / player / organizer) over HTTP. Run it against the dev server or the production preview after dependency upgrades.

It needs a **local** Supabase instance: the organizer steps sign in as the seeded `organizer@example.com` (see [Organizer accounts](#organizer-accounts)), which only exists locally and in CI.

1. Start local Supabase and apply the seed: `npm run db:start && npm run db:reset`.
2. Point `.dev.vars` at it: `SUPABASE_URL` = `API_URL` and `SUPABASE_KEY` = `ANON_KEY` from `npx supabase status -o env`.
3. Run the app and the smoke test:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

> **Warning:** `npm run build` copies `.dev.vars` into `dist/server/.dev.vars`, so a build made while `.dev.vars` pointed at a cloud project keeps using it in `npm run preview`. Rebuild after switching. Never run the smoke test against production Supabase: each run creates a real `smoke-*@example.com` account there.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.

## License

MIT
