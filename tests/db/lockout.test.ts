// risk: #3 (context/foundation/test-plan.md §2) — the no-show lockout blocks the wrong player, or the right one wrongly.
// Rule (PRD FR-009, FR-022..024): a main-list absence is a marked 'absent' row or a LATE withdrawal (after the sign-up
// window closed 3 h before the start) by someone who held a main-list spot; a waitlist-only or early withdrawal never
// counts. Two absences within the 8 most recent completed (confirmed and started) trainings block the player for the
// next training; once a completed training has started after the latest absence the penalty is served.
// Expected values come from those rules and the history each test builds, not from reading the SQL back.
import { describe, expect, it } from "vitest";
import {
  type Db,
  asAnon,
  asUser,
  attempt,
  createOrganizer,
  createPlayers,
  createTraining,
  inRollback,
  shiftTraining,
  signUp,
  withdraw,
} from "./helpers";

const DAY = 24 * 60;
let slot = 0;

interface PastOptions {
  /** Signed up in this order before the close, so they take positions 1..n. */
  players?: string[];
  /** Withdraw while sign-ups are still open (never an absence). */
  early?: string[];
  /** Withdraw after the close, once the training is confirmed. */
  late?: string[];
  /** Marked absent by the organizer. */
  absent?: string[];
  status?: "confirmed" | "cancelled";
}

/**
 * A training that started `daysAgo` days ago. Sign-ups and early withdrawals are made first, then the whole clock is
 * moved into the past (so they precede the close), then late withdrawals and attendance marks are made.
 */
async function past(db: Db, daysAgo: number, options: PastOptions = {}): Promise<string> {
  // Each call lands in its own future slot, 5 hours apart, so a player may sign up for several (overlap rule).
  const training = await createTraining(db, { startsInMinutes: 48 * 60 + ++slot * 300 });
  for (const player of options.players ?? []) await signUp(db, player, training);
  for (const player of options.early ?? []) await withdraw(db, player, training);
  await db.query("update public.trainings set status = $2 where id = $1", [training, options.status ?? "confirmed"]);
  await shiftTraining(db, training, -daysAgo * DAY);
  for (const player of options.late ?? []) await withdraw(db, player, training);
  for (const player of options.absent ?? []) {
    await db.query("insert into public.attendance (training_id, user_id, status) values ($1, $2, 'absent')", [
      training,
      player,
    ]);
  }
  return training;
}

/** Other completed trainings already in the local database would sit inside the window: take them out of play. */
async function clearHistory(db: Db): Promise<void> {
  await db.query("update public.trainings set status = 'cancelled' where status = 'confirmed' and starts_at <= now()");
}

async function isBlocked(db: Db, user: string, target: string): Promise<boolean> {
  const { rows } = await db.query<{ blocked: boolean }>("select public.is_blocked($1, $2) as blocked", [user, target]);
  return rows[0].blocked;
}

/** Twelve other players: enough to fill a main list so the next sign-up is on the waitlist. */
async function crowd(db: Db): Promise<string[]> {
  return createPlayers(db, 12);
}

describe("the absence threshold", () => {
  it("does not block after one absence, blocks after two, and refuses the sign-up with player_blocked", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player, other] = await createPlayers(db, 2);
      const target = await createTraining(db);
      await past(db, 6, { absent: [player] });
      expect(await isBlocked(db, player, target)).toBe(false);

      await past(db, 2, { absent: [player] });

      expect(await isBlocked(db, player, target)).toBe(true);
      expect(await attempt(db, () => signUp(db, player, target))).toMatchObject({
        ok: false,
        code: "23514",
        message: "player_blocked",
      });
      expect((await attempt(db, () => signUp(db, other, target))).ok).toBe(true);
    });
  });

  it("does not block when the two absences are another player's", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player, other] = await createPlayers(db, 2);
      const target = await createTraining(db);
      await past(db, 6, { absent: [other] });
      await past(db, 2, { absent: [other] });

      expect(await isBlocked(db, player, target)).toBe(false);
      expect(await isBlocked(db, other, target)).toBe(true);
    });
  });
});

describe("the window of the 8 most recent completed trainings", () => {
  async function nineTrainings(db: Db, oldestAbsent: boolean, absent: string): Promise<string> {
    await clearHistory(db);
    const target = await createTraining(db);
    // Oldest first: trainings 1..9, the newest (9) always an absence; training 1 is the 9th most recent.
    await past(db, 10, oldestAbsent ? { absent: [absent] } : {});
    await past(db, 9, oldestAbsent ? {} : { absent: [absent] });
    for (const daysAgo of [8, 7, 6, 5, 4, 3]) await past(db, daysAgo);
    await past(db, 2, { absent: [absent] });
    return target;
  }

  it("counts an absence on the 8th most recent completed training", async () => {
    await inRollback(async (db) => {
      const [player] = await createPlayers(db, 1);
      const target = await nineTrainings(db, false, player);

      expect(await isBlocked(db, player, target)).toBe(true);
    });
  });

  it("ignores an absence on the 9th most recent completed training", async () => {
    await inRollback(async (db) => {
      const [player] = await createPlayers(db, 1);
      const target = await nineTrainings(db, true, player);

      expect(await isBlocked(db, player, target)).toBe(false);
    });
  });

  it("neither counts nor lets a cancelled training reset or push an absence out of the window", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const target = await createTraining(db);
      await past(db, 12, { absent: [player] }); // 8th most recent once the others exist
      await past(db, 11, { status: "cancelled" });
      for (const daysAgo of [10, 9, 8, 7, 6]) await past(db, daysAgo);
      await past(db, 5, { status: "cancelled" });
      await past(db, 4);
      await past(db, 3, { absent: [player] });
      await past(db, 1, { status: "cancelled" }); // after the latest absence: no completed training, no reset

      expect(await isBlocked(db, player, target)).toBe(true);
    });
  });
});

describe("what counts as an absence", () => {
  it("counts a late withdrawal by a main-list player", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const target = await createTraining(db);
      await past(db, 6, { players: [player], late: [player] });
      await past(db, 2, { players: [player], late: [player] });

      expect(await isBlocked(db, player, target)).toBe(true);
    });
  });

  it("never counts an early withdrawal, before the sign-up window closed", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const target = await createTraining(db);
      await past(db, 6, { players: [player], early: [player] });
      await past(db, 2, { players: [player], early: [player] });

      expect(await isBlocked(db, player, target)).toBe(false);
    });
  });

  it("never counts a late withdrawal from the waitlist", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const others = await crowd(db);
      const target = await createTraining(db);
      // The player is 13th in the queue: on the waitlist at the close.
      await past(db, 6, { players: [...others, player], late: [player] });
      await past(db, 2, { players: [...others, player], late: [player] });

      expect(await isBlocked(db, player, target)).toBe(false);
    });
  });

  it("counts a late withdrawal by a waitlister who had been promoted", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const others = await crowd(db);
      const target = await createTraining(db);
      // A main-list player drops out after the close, the 13th in the queue is promoted, then withdraws too.
      for (const daysAgo of [6, 2]) {
        await past(db, daysAgo, { players: [...others, player], late: [others[0], player] });
      }

      expect(await isBlocked(db, player, target)).toBe(true);
    });
  });
});

describe("serving the penalty", () => {
  it("lifts the block once a completed training has started after the latest absence", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const target = await createTraining(db);
      await past(db, 6, { absent: [player] });
      await past(db, 4, { absent: [player] });
      expect(await isBlocked(db, player, target)).toBe(true);

      await past(db, 2); // a completed training the player did not attend: the single-training penalty is served

      expect(await isBlocked(db, player, target)).toBe(false);
    });
  });

  it("is not lifted by a cancelled training", async () => {
    await inRollback(async (db) => {
      await clearHistory(db);
      const [player] = await createPlayers(db, 1);
      const target = await createTraining(db);
      await past(db, 6, { absent: [player] });
      await past(db, 4, { absent: [player] });

      await past(db, 2, { status: "cancelled" });

      expect(await isBlocked(db, player, target)).toBe(true);
    });
  });
});

describe("who can read block status", () => {
  async function blockedPlayerAndTarget(db: Db): Promise<{ blocked: string; clean: string; target: string }> {
    await clearHistory(db);
    const [blocked, clean] = await createPlayers(db, 2);
    const target = await createTraining(db);
    await past(db, 6, { absent: [blocked, clean] });
    await past(db, 2, { absent: [blocked] });
    return { blocked, clean, target };
  }

  it("block_info returns only the caller's own status and absence count", async () => {
    await inRollback(async (db) => {
      const { blocked, clean, target } = await blockedPlayerAndTarget(db);
      const info = (user: string) =>
        asUser(db, user, async () => {
          const { rows } = await db.query<{ blocked: boolean; absences: number }>(
            "select * from public.block_info($1)",
            [target],
          );
          return rows;
        });

      expect(await info(blocked)).toEqual([{ blocked: true, absences: 2 }]);
      expect(await info(clean)).toEqual([{ blocked: false, absences: 1 }]);
    });
  });

  it("block_info is not available to a signed-out visitor", async () => {
    await inRollback(async (db) => {
      const { target } = await blockedPlayerAndTarget(db);

      const result = await attempt(db, () =>
        asAnon(db, () => db.query("select * from public.block_info($1)", [target])),
      );

      expect(result).toMatchObject({ ok: false, code: "42501" });
    });
  });

  it("training_blocked_players lists exactly the blocked players for an organizer", async () => {
    await inRollback(async (db) => {
      const { blocked, clean, target } = await blockedPlayerAndTarget(db);
      const organizer = await createOrganizer(db);

      const { rows } = await asUser(db, organizer, () =>
        db.query<{ id: string }>("select public.training_blocked_players($1) as id", [target]),
      );

      expect(rows.map((row) => row.id)).toEqual([blocked]);
      expect(rows.map((row) => row.id)).not.toContain(clean);
    });
  });

  it("training_blocked_players raises 42501 for a player and for a visitor, never an empty list", async () => {
    await inRollback(async (db) => {
      const { blocked, target } = await blockedPlayerAndTarget(db);

      const asPlayer = await attempt(db, () =>
        asUser(db, blocked, () => db.query("select public.training_blocked_players($1)", [target])),
      );
      const asVisitor = await attempt(db, () =>
        asAnon(db, () => db.query("select public.training_blocked_players($1)", [target])),
      );

      expect(asPlayer).toMatchObject({ ok: false, code: "42501" });
      expect(asVisitor).toMatchObject({ ok: false, code: "42501" });
    });
  });
});
