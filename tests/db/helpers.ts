// Shared plumbing for the database integration tests (test-plan Phase 2, risks #1-#4 and #6).
//
// Rule tests run inside one transaction that is always rolled back, act as a user through
// `set local role authenticated` + `request.jwt.claims` (so RLS, grants and triggers behave exactly as for the
// app), and move time by shifting a training's clock instead of sleeping. Only the race tests commit.
import pg from "pg";

const DEFAULT_URL = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type Db = pg.Client;

/** A fresh connection to the LOCAL Supabase database. Never skips, and never talks to anything but localhost. */
export async function connect(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
  const { hostname, port } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    // The tests insert and delete users and relax triggers: never point them at a shared or production database.
    throw new Error(
      `Refusing to run database tests against "${hostname}": only the local Supabase stack (127.0.0.1 / localhost) is allowed. Start it with \`npm run db:start\`.`,
    );
  }
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Cannot reach the local database at ${hostname}:${port || "5432"}. Start the local Supabase stack with \`npm run db:start\`.`,
      { cause },
    );
  }
  return client;
}

/** Runs `fn` in a transaction on its own connection and ALWAYS rolls back, so a test leaves nothing behind. */
export async function inRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await connect();
  try {
    await db.query("begin");
    return await fn(db);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

/** Runs `fn` as the given signed-in user: role `authenticated` with that user's JWT subject, for this transaction. */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    // After an uncaught error the transaction is aborted and this fails too; the original error is the useful one.
    await db.query("reset role").catch(() => undefined);
  }
}

/** Runs `fn` as a signed-out visitor: role `anon`, no JWT subject, for this transaction. */
export async function asAnon<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("set local role anon");
  await db.query("select set_config('request.jwt.claims', '', true)");
  try {
    return await fn();
  } finally {
    await db.query("reset role").catch(() => undefined);
  }
}

export type Attempt<T> =
  { ok: true; value: T } | { ok: false; code: string; message: string; constraint: string | undefined };

let savepointSeq = 0;

/** Runs `fn` behind a savepoint so an expected database error does not abort the surrounding transaction. */
export async function attempt<T>(db: Db, fn: () => Promise<T>): Promise<Attempt<T>> {
  const savepoint = `attempt_${++savepointSeq}`;
  await db.query(`savepoint ${savepoint}`);
  try {
    const value = await fn();
    await db.query(`release savepoint ${savepoint}`);
    return { ok: true, value };
  } catch (error) {
    if (!(error instanceof pg.DatabaseError)) throw error;
    await db.query(`rollback to savepoint ${savepoint}`);
    return { ok: false, code: error.code ?? "", message: error.message, constraint: error.constraint };
  }
}

export function uniqueToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function only<T>(rows: T[], what: string): T {
  if (rows.length !== 1) throw new Error(`Expected exactly one ${what}, got ${rows.length}`);
  return rows[0];
}

/**
 * Inserts `count` confirmed accounts straight into auth.users (as supabase/seed.sql does); the profile comes from
 * the create_profile_for_new_user trigger. The `e2e-db-` e-mail prefix marks them so a crashed run can be swept.
 */
export async function createPlayers(db: Db, count: number, token = uniqueToken()): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     )
     select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'e2e-db-' || $2::text || '-' || n || '@example.test', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
     from generate_series(1, $1::int) n
     order by n
     returning id`,
    [count, token],
  );
  return rows.map((row) => row.id);
}

export async function createOrganizer(db: Db, token = uniqueToken()): Promise<string> {
  const id = only(await createPlayers(db, 1, `org-${token}`), "organizer account");
  await db.query("insert into public.organizers (user_id) values ($1)", [id]);
  return id;
}

/** Creates a training as the table owner; it starts `startsInMinutes` from now (default 48 h, sign-ups open). */
export async function createTraining(
  db: Db,
  options: { startsInMinutes?: number; title?: string } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.trainings (title, starts_at, location)
     values ($1, now() + $2::int * interval '1 minute', 'DB test hall')
     returning id`,
    [options.title ?? `E2E DB ${uniqueToken()}`, options.startsInMinutes ?? 48 * 60],
  );
  return only(rows, "training").id;
}

/** Signs `userId` up through the real trigger and returns the queue position it assigned. */
export async function signUp(db: Db, userId: string, trainingId: string): Promise<number> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ position: number }>(
      "insert into public.signups (training_id) values ($1) returning position",
      [trainingId],
    );
    return only(rows, "sign-up").position;
  });
}

/** Withdraws the user's active sign-up and returns how many rows changed (0 or 1). */
export async function withdraw(db: Db, userId: string, trainingId: string): Promise<number> {
  return asUser(db, userId, async () => {
    const result = await db.query(
      `update public.signups set status = 'withdrawn'
       where training_id = $1 and user_id = $2 and status = 'active'`,
      [trainingId, userId],
    );
    return result.rowCount ?? 0;
  });
}

export interface RosterRow {
  user_id: string;
  position: number;
}

/** Active sign-ups of a training in queue order, read as the table owner (so RLS hides nothing). */
export async function activeRoster(db: Db, trainingId: string): Promise<RosterRow[]> {
  const { rows } = await db.query<RosterRow>(
    "select user_id, position from public.signups where training_id = $1 and status = 'active' order by position",
    [trainingId],
  );
  return rows;
}

/**
 * Moves a training's whole clock so it starts `startsInMinutes` from now: `starts_at`, `closed_at` and the
 * `signed_up_at` / `withdrawn_at` of its sign-ups all shift by the same delta. now() is frozen inside a transaction,
 * so shifting only `starts_at` would leave every sign-up AFTER the close time. Make sign-ups and early withdrawals
 * BEFORE the shift and late withdrawals AFTER it.
 *
 * The edit runs with triggers relaxed (`session_replication_role = replica`); it always switches back to `origin`
 * so the statements a test makes next fire the triggers under test. Call it as the table owner, not as a user.
 */
export async function shiftTraining(db: Db, trainingId: string, startsInMinutes: number): Promise<void> {
  await db.query("set local session_replication_role = replica");
  try {
    await db.query(
      `with moved as (
         select id, now() + $2::int * interval '1 minute' - starts_at as delta
         from public.trainings where id = $1
       ), signups_moved as (
         update public.signups s
         set signed_up_at = s.signed_up_at + moved.delta, withdrawn_at = s.withdrawn_at + moved.delta
         from moved where s.training_id = moved.id
         returning s.id
       )
       update public.trainings t
       set starts_at = t.starts_at + moved.delta, closed_at = t.closed_at + moved.delta
       from moved where t.id = moved.id`,
      [trainingId, startsInMinutes],
    );
  } finally {
    await db.query("set local session_replication_role = origin");
  }
}

export interface Counts {
  trainings: number;
  signups: number;
  users: number;
}

/** Row counts used to prove a run left the database as it found it. */
export async function counts(db: Db): Promise<Counts> {
  const { rows } = await db.query<Counts>(
    `select (select count(*) from public.trainings)::int as trainings,
            (select count(*) from public.signups)::int as signups,
            (select count(*) from auth.users)::int as users`,
  );
  return only(rows, "counts row");
}

/** Deletes everything the committed tests leave behind (trainings cascade to their sign-ups, users to profiles). */
export async function sweepTestData(db: Db): Promise<void> {
  await db.query("delete from public.trainings where title like 'E2E DB %'");
  await db.query("delete from auth.users where email like 'e2e-db-%@example.test'");
}
