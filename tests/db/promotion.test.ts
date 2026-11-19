// risk: #4 (context/foundation/test-plan.md §2) — a waitlister is promoted wrongly (twice, to the wrong spot, or at all).
// promote_after_withdrawal() stamps `promoted_at` on the first waitlister when a main-list player withdraws AFTER the
// training is confirmed (FR-016). The expected promotee is always derived from the sign-up order a test controls: the
// first 12 active sign-ups are the main list, the 13th is first on the waitlist. The team-slot follow-up (same trigger
// event) is in team-slot.test.ts; the concurrent-withdrawal guard is at the end of this file and commits.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Db,
  confirmedTraining,
  connect,
  counts,
  createPlayers,
  createTraining,
  inRollback,
  promotedUsers,
  signUp,
  sweepTestData,
  uniqueToken,
  withdraw,
} from "./helpers";

async function promotedAt(db: Db, training: string, user: string): Promise<Date> {
  const { rows } = await db.query<{ promoted_at: Date }>(
    "select promoted_at from public.signups where training_id = $1 and user_id = $2",
    [training, user],
  );
  return rows[0].promoted_at;
}

describe("who is promoted after a withdrawal", () => {
  it("promotes only the first waitlister when a main-list player withdraws after confirmation", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });

      expect(await withdraw(db, players[3], training)).toBe(1);

      expect(await promotedUsers(db, training)).toEqual([players[12]]);
    });
  });

  it("promotes nobody when a waitlister withdraws", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });

      await withdraw(db, players[12], training);

      expect(await promotedUsers(db, training)).toEqual([]);
    });
  });

  it("promotes nobody when the main list withdraws before the training is confirmed", async () => {
    await inRollback(async (db) => {
      const players = await createPlayers(db, 14);
      const training = await createTraining(db);
      for (const player of players) await signUp(db, player, training);

      await withdraw(db, players[0], training);

      expect(await promotedUsers(db, training)).toEqual([]);
    });
  });

  it("promotes nobody on a cancelled training", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await db.query("update public.trainings set status = 'cancelled' where id = $1", [training]);

      await withdraw(db, players[0], training);

      expect(await promotedUsers(db, training)).toEqual([]);
    });
  });

  it("promotes nobody when the waitlist is empty", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 12 });

      await withdraw(db, players[11], training);

      expect(await promotedUsers(db, training)).toEqual([]);
    });
  });

  it("promotes each waitlister in queue order, the row now at rank 12 every time", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 15 });

      await withdraw(db, players[0], training);
      expect(await promotedUsers(db, training)).toEqual([players[12]]);
      await withdraw(db, players[7], training);
      expect(await promotedUsers(db, training)).toEqual([players[12], players[13]]);
      await withdraw(db, players[9], training);

      expect(await promotedUsers(db, training)).toEqual([players[12], players[13], players[14]]);
    });
  });

  it("keeps the first stamp when a later withdrawal runs the promotion again", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await withdraw(db, players[0], training);
      // Age the stamp by an hour (triggers relaxed for this one edit): now() is frozen, so a rewrite would be invisible.
      await db.query("set local session_replication_role = replica");
      await db.query(
        "update public.signups set promoted_at = promoted_at - interval '1 hour' where training_id = $1 and user_id = $2",
        [training, players[12]],
      );
      await db.query("set local session_replication_role = origin");
      const before = await promotedAt(db, training, players[12]);

      await withdraw(db, players[1], training);

      expect(await promotedAt(db, training, players[12])).toEqual(before);
      expect(await promotedUsers(db, training)).toEqual([players[12], players[13]]);
    });
  });
});

describe("concurrent withdrawals", () => {
  let admin: Db;
  let racers: Db[];
  let baseline: Awaited<ReturnType<typeof counts>>;

  beforeAll(async () => {
    admin = await connect();
    await sweepTestData(admin);
    baseline = await counts(admin);
    racers = await Promise.all([connect(), connect()]);
  });

  afterAll(async () => {
    await Promise.all(racers.map((client) => client.end()));
    await sweepTestData(admin);
    // Every committed row this block created is gone again.
    expect(await counts(admin)).toEqual(baseline);
    await admin.end();
  });

  it("promotes two distinct waitlisters when two main-list players withdraw at the same moment", async () => {
    const token = uniqueToken();
    await admin.query("begin");
    const { training, players } = await confirmedTraining(admin, { signups: 14, title: `E2E DB promo-race ${token}` });
    await admin.query("commit");

    await Promise.all(
      racers.map(async (client, i) => {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: players[i], role: "authenticated" }),
        ]);
      }),
    );
    await Promise.all(
      racers.map(async (client, i) => {
        await client.query("update public.signups set status = 'withdrawn' where training_id = $1 and user_id = $2", [
          training,
          players[i],
        ]);
        await client.query("commit");
      }),
    );

    expect(await promotedUsers(admin, training)).toEqual([players[12], players[13]]);
  });
});
