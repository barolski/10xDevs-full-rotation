// risk: #6 (context/foundation/test-plan.md §2) — a player or a signed-out visitor reads or writes what only an
// organizer may. The database is the security boundary (the app's role check is not): every case here asserts the
// DATA a role sees or leaves behind, not just that a request was refused. A refusal is either a permission error
// (42501: no grant, or a row-level-security violation) or a statement that touched zero rows because the policy hid
// them; either way the rows must be unchanged afterwards, which is read back as the table owner.
import { describe, expect, it } from "vitest";
import {
  type Attempt,
  type Db,
  asAnon,
  asUser,
  attempt,
  createOrganizer,
  createPlayers,
  createTraining,
  inRollback,
  signUp,
  withdraw,
} from "./helpers";

/** A user id, or the literal "anon" for a signed-out visitor. */
type Actor = string;

interface Run {
  rowCount: number;
  rows: Record<string, unknown>[];
}

async function as(db: Db, actor: Actor, sql: string, params: unknown[] = []): Promise<Attempt<Run>> {
  const run = async (): Promise<Run> => {
    const result = await db.query(sql, params);
    return { rowCount: result.rowCount ?? 0, rows: result.rows as Record<string, unknown>[] };
  };
  return attempt(db, () => (actor === "anon" ? asAnon(db, run) : asUser(db, actor, run)));
}

/** Refused: a permission/RLS error, or a statement that matched no visible row. */
function refused(result: Attempt<Run>): boolean {
  return result.ok ? result.value.rowCount === 0 : result.code === "42501";
}

interface Seeded {
  training: string;
  a: string;
  b: string;
  organizer: string;
}

async function seed(db: Db): Promise<Seeded> {
  const [a, b] = await createPlayers(db, 2);
  const organizer = await createOrganizer(db);
  const training = await createTraining(db);
  await db.query("insert into public.attendance (training_id, user_id, status) values ($1, $2, 'present')", [
    training,
    a,
  ]);
  await db.query("insert into public.team_assignments (training_id, user_id, team) values ($1, $2, 'A')", [
    training,
    a,
  ]);
  await db.query("insert into public.training_ratings (training_id, user_id, rating) values ($1, $2, 5)", [
    training,
    a,
  ]);
  return { training, a, b, organizer };
}

/** The rows of `table` that belong to the test's two players, as the table owner sees them. */
async function snapshot(db: Db, table: string, s: Seeded): Promise<string[]> {
  const { rows } = await db.query<{ row: string }>(
    `select t::text as row from public.${table} t where user_id = any($1) order by 1`,
    [[s.a, s.b]],
  );
  return rows.map((row) => row.row);
}

interface OrganizerOnlyTable {
  table: string;
  insert: string; // for player b, $1 = training, $2 = b
  update: string; // for player a, $1 = training, $2 = a
  delete?: string; // only team_assignments has a delete grant
}

const TABLES: OrganizerOnlyTable[] = [
  {
    table: "attendance",
    insert: "insert into public.attendance (training_id, user_id, status) values ($1, $2, 'absent')",
    update: "update public.attendance set status = 'absent' where training_id = $1 and user_id = $2",
  },
  {
    table: "team_assignments",
    insert: "insert into public.team_assignments (training_id, user_id, team) values ($1, $2, 'B')",
    update: "update public.team_assignments set team = 'B' where training_id = $1 and user_id = $2",
    delete: "delete from public.team_assignments where training_id = $1 and user_id = $2",
  },
  {
    table: "training_ratings",
    insert: "insert into public.training_ratings (training_id, user_id, rating) values ($1, $2, 9)",
    update: "update public.training_ratings set rating = 9 where training_id = $1 and user_id = $2",
  },
];

describe.each(TABLES)("organizer-only table $table", (spec) => {
  it("shows its rows to an organizer and none to a player (even the row's own subject), nor to a visitor", async () => {
    await inRollback(async (db) => {
      const s = await seed(db);
      const select = `select user_id from public.${spec.table} where user_id = any($1)`;

      const asOrganizer = await as(db, s.organizer, select, [[s.a, s.b]]);
      const asSubject = await as(db, s.a, select, [[s.a, s.b]]);
      const asOther = await as(db, s.b, select, [[s.a, s.b]]);
      const asVisitor = await as(db, "anon", select, [[s.a, s.b]]);

      expect(asOrganizer).toMatchObject({ ok: true, value: { rows: [{ user_id: s.a }] } });
      expect(asSubject).toMatchObject({ ok: true, value: { rows: [] } });
      expect(asOther).toMatchObject({ ok: true, value: { rows: [] } });
      expect(asVisitor).toMatchObject({ ok: false, code: "42501" });
    });
  });

  it("refuses every non-organizer write and leaves the rows as they were", async () => {
    await inRollback(async (db) => {
      const s = await seed(db);
      const before = await snapshot(db, spec.table, s);

      for (const actor of [s.a, s.b, "anon"]) {
        expect(refused(await as(db, actor, spec.insert, [s.training, s.b]))).toBe(true);
        expect(refused(await as(db, actor, spec.update, [s.training, s.a]))).toBe(true);
        expect(refused(await as(db, actor, `delete from public.${spec.table}`))).toBe(true);
      }

      expect(await snapshot(db, spec.table, s)).toEqual(before);
    });
  });

  it("lets an organizer insert and update", async () => {
    await inRollback(async (db) => {
      const s = await seed(db);

      const inserted = await as(db, s.organizer, spec.insert, [s.training, s.b]);
      const updated = await as(db, s.organizer, spec.update, [s.training, s.a]);

      expect(inserted).toMatchObject({ ok: true, value: { rowCount: 1 } });
      expect(updated).toMatchObject({ ok: true, value: { rowCount: 1 } });
      expect(await snapshot(db, spec.table, s)).toHaveLength(2);
    });
  });
});

describe("team_assignments delete", () => {
  it("is allowed for an organizer only", async () => {
    await inRollback(async (db) => {
      const s = await seed(db);
      const sql = "delete from public.team_assignments where training_id = $1 and user_id = $2";

      expect(refused(await as(db, s.a, sql, [s.training, s.a]))).toBe(true);
      expect(await snapshot(db, "team_assignments", s)).toHaveLength(1);
      expect(await as(db, s.organizer, sql, [s.training, s.a])).toMatchObject({ ok: true, value: { rowCount: 1 } });
      expect(await snapshot(db, "team_assignments", s)).toEqual([]);
    });
  });
});

describe("trainings", () => {
  const insertTraining =
    "insert into public.trainings (title, starts_at, location) values ('E2E DB rls', now() + interval '3 days', 'Hall')";

  it("can be created and edited by an organizer only", async () => {
    await inRollback(async (db) => {
      const s = await seed(db);

      expect(refused(await as(db, s.a, insertTraining))).toBe(true);
      expect(refused(await as(db, "anon", insertTraining))).toBe(true);
      expect(await as(db, s.organizer, insertTraining)).toMatchObject({ ok: true, value: { rowCount: 1 } });

      const edit = "update public.trainings set note = 'changed' where id = $1";
      expect(refused(await as(db, s.a, edit, [s.training]))).toBe(true);
      expect(await as(db, s.organizer, edit, [s.training])).toMatchObject({ ok: true, value: { rowCount: 1 } });
    });
  });

  it("never lets anyone write the status through the client grants", async () => {
    await inRollback(async (db) => {
      const s = await seed(db);

      for (const actor of [s.a, s.organizer]) {
        const result = await as(db, actor, "update public.trainings set status = 'confirmed' where id = $1", [
          s.training,
        ]);
        expect(result).toMatchObject({ ok: false, code: "42501" });
      }

      const { rows } = await db.query<{ status: string }>("select status from public.trainings where id = $1", [
        s.training,
      ]);
      expect(rows[0].status).toBe("open");
    });
  });
});

describe("signups", () => {
  async function roster(db: Db): Promise<{ training: string; a: string; b: string; c: string; organizer: string }> {
    const [a, b, c] = await createPlayers(db, 3);
    const organizer = await createOrganizer(db);
    const training = await createTraining(db);
    for (const player of [a, b, c]) await signUp(db, player, training);
    await withdraw(db, b, training);
    return { training, a, b, c, organizer };
  }

  async function visible(db: Db, actor: Actor, training: string): Promise<string[] | "refused"> {
    const result = await as(db, actor, "select user_id from public.signups where training_id = $1 order by position", [
      training,
    ]);
    return result.ok ? result.value.rows.map((row) => String(row.user_id)) : "refused";
  }

  it("shows a player the active rows and their own withdrawn one, an organizer everything, a visitor nothing", async () => {
    await inRollback(async (db) => {
      const { training, a, b, c, organizer } = await roster(db);

      expect(await visible(db, a, training)).toEqual([a, c]); // b withdrew: hidden from others
      expect(await visible(db, b, training)).toEqual([a, b, c]); // but b still sees their own row
      expect(await visible(db, organizer, training)).toEqual([a, b, c]);
      expect(await visible(db, "anon", training)).toBe("refused");
    });
  });

  it("does not let a player withdraw or delete someone else's sign-up", async () => {
    await inRollback(async (db) => {
      const { training, a, c } = await roster(db);

      const withdrawOther = await as(
        db,
        a,
        "update public.signups set status = 'withdrawn' where training_id = $1 and user_id = $2",
        [training, c],
      );
      const deleteAny = await as(db, a, "delete from public.signups where training_id = $1", [training]);

      expect(refused(withdrawOther)).toBe(true);
      expect(deleteAny).toMatchObject({ ok: false, code: "42501" });
      const { rows } = await db.query<{ status: string }>(
        "select status from public.signups where training_id = $1 and user_id = $2",
        [training, c],
      );
      expect(rows).toEqual([{ status: "active" }]);
    });
  });
});

describe("function execute rights", () => {
  it("keeps lockout_absences() closed to visitors and players", async () => {
    await inRollback(async (db) => {
      const [player] = await createPlayers(db, 1);
      const sql = "select public.lockout_absences(gen_random_uuid(), gen_random_uuid())";

      expect(await as(db, "anon", sql)).toMatchObject({ ok: false, code: "42501" });
      expect(await as(db, player, sql)).toMatchObject({ ok: false, code: "42501" });
    });
  });

  // These are trigger functions. Supabase grants execute on new public functions to anon/authenticated by default and
  // the migrations only revoke it from PUBLIC, so the privilege itself is held; what actually keeps a client out is
  // that Postgres refuses to run a trigger function outside a trigger (0A000), whoever asks.
  it.each(["promote_after_withdrawal", "inherit_team_slot_after_withdrawal"])(
    "cannot be called directly by a visitor or a player: %s()",
    async (name) => {
      await inRollback(async (db) => {
        const [player] = await createPlayers(db, 1);
        const sql = `select public.${name}()`;

        expect(await as(db, "anon", sql)).toMatchObject({ ok: false, code: "0A000" });
        expect(await as(db, player, sql)).toMatchObject({ ok: false, code: "0A000" });
      });
    },
  );

  it.each([
    "select public.is_organizer()",
    "select * from public.block_info(gen_random_uuid())",
    "select public.training_blocked_players(gen_random_uuid())",
  ])("is closed to visitors: %s", async (sql) => {
    await inRollback(async (db) => {
      expect(await as(db, "anon", sql)).toMatchObject({ ok: false, code: "42501" });
    });
  });

  it("answers is_organizer() false for a player and true for an organizer", async () => {
    await inRollback(async (db) => {
      const [player] = await createPlayers(db, 1);
      const organizer = await createOrganizer(db);

      const asPlayer = await as(db, player, "select public.is_organizer() as yes");
      const asOrganizer = await as(db, organizer, "select public.is_organizer() as yes");
      expect(asPlayer).toMatchObject({ ok: true, value: { rows: [{ yes: false }] } });
      expect(asOrganizer).toMatchObject({ ok: true, value: { rows: [{ yes: true }] } });
    });
  });
});
