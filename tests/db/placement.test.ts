// risk: #1 (context/foundation/test-plan.md §2) — a player lands on the wrong list.
// Placement is derived, not stored: the first 12 ACTIVE sign-ups by queue position are the main list and the rest
// the waitlist (src/lib/signups.ts). The database enforces no cap itself, so what must hold is the queue itself:
// first come first served, positions never reused, and the admission rules that keep a player off a list at all.
// Expected values come from the sign-up order each test controls, never from reading the SQL back.
// The last-slot race and the per-player locks are in placement-race.test.ts.
import { describe, expect, it } from "vitest";
import {
  activeRoster,
  attempt,
  createPlayers,
  createTraining,
  inRollback,
  shiftTraining,
  signUp,
  withdraw,
} from "./helpers";

const MAIN_LIST_SIZE = 12;

describe("placement on the main list and the waitlist", () => {
  it("places sign-ups in the order they arrive: the first 12 are the main list, the 13th the waitlist", async () => {
    await inRollback(async (db) => {
      const players = await createPlayers(db, 13);
      const training = await createTraining(db);

      const positions: number[] = [];
      for (const player of players) positions.push(await signUp(db, player, training));

      expect(positions).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
      const roster = await activeRoster(db, training);
      expect(roster.map((row) => row.user_id)).toEqual(players);
      expect(roster.slice(0, MAIN_LIST_SIZE).map((row) => row.user_id)).toEqual(players.slice(0, MAIN_LIST_SIZE));
      expect(roster.slice(MAIN_LIST_SIZE).map((row) => row.user_id)).toEqual([players[12]]);
    });
  });

  it("keeps a withdrawn queue number taken and moves the first waitlister into the main list", async () => {
    await inRollback(async (db) => {
      const players = await createPlayers(db, 14);
      const training = await createTraining(db);
      for (const player of players.slice(0, 13)) await signUp(db, player, training);

      expect(await withdraw(db, players[0], training)).toBe(1);
      const newcomer = players[13];
      // Withdrawn row 1 still holds position 1, so the next number is max + 1 = 14, never a reused one.
      expect(await signUp(db, newcomer, training)).toBe(14);

      const roster = await activeRoster(db, training);
      expect(roster.map((row) => row.position)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      // The player who was 13th (waitlist) is now 12th among active sign-ups, i.e. on the main list.
      expect(roster.slice(0, MAIN_LIST_SIZE).map((row) => row.user_id)).toEqual(players.slice(1, 13));
      expect(roster.slice(MAIN_LIST_SIZE).map((row) => row.user_id)).toEqual([newcomer]);
    });
  });

  it("puts a player who signs up again after withdrawing at the end of the queue", async () => {
    await inRollback(async (db) => {
      const [first, second, third] = await createPlayers(db, 3);
      const training = await createTraining(db);
      await signUp(db, first, training);
      await signUp(db, second, training);
      await withdraw(db, first, training);
      await signUp(db, third, training);

      expect(await signUp(db, first, training)).toBe(4);
      const roster = await activeRoster(db, training);
      expect(roster.map((row) => row.user_id)).toEqual([second, third, first]);
    });
  });
});

describe("admission rules", () => {
  it("refuses a second active sign-up of the same player for one training", async () => {
    await inRollback(async (db) => {
      const [player] = await createPlayers(db, 1);
      const training = await createTraining(db);
      await signUp(db, player, training);

      const second = await attempt(db, () => signUp(db, player, training));

      expect(second).toMatchObject({ ok: false, code: "23505", constraint: "signups_one_active_per_player_idx" });
      expect(await activeRoster(db, training)).toHaveLength(1);
    });
  });

  it("refuses overlapping trainings less than 120 minutes apart and allows exactly 120", async () => {
    await inRollback(async (db) => {
      const [player] = await createPlayers(db, 1);
      const base = 48 * 60;
      const anchor = await createTraining(db, { startsInMinutes: base });
      const justInside = await createTraining(db, { startsInMinutes: base + 119 });
      const justOutside = await createTraining(db, { startsInMinutes: base + 120 });
      const earlierInside = await createTraining(db, { startsInMinutes: base - 119 });
      await signUp(db, player, anchor);

      const inside = await attempt(db, () => signUp(db, player, justInside));
      const before = await attempt(db, () => signUp(db, player, earlierInside));
      const outside = await attempt(db, () => signUp(db, player, justOutside));

      expect(inside).toMatchObject({ ok: false, code: "23514", message: "overlapping_signup" });
      expect(before).toMatchObject({ ok: false, code: "23514", message: "overlapping_signup" });
      expect(outside.ok).toBe(true);
    });
  });

  it("refuses sign-ups from three hours before the start on, and accepts them one minute earlier", async () => {
    await inRollback(async (db) => {
      const [early, atBoundary, late] = await createPlayers(db, 3);
      const training = await createTraining(db);

      await shiftTraining(db, training, 181);
      expect(await signUp(db, early, training)).toBe(1);

      await shiftTraining(db, training, 180);
      const exactly = await attempt(db, () => signUp(db, atBoundary, training));
      await shiftTraining(db, training, 179);
      const after = await attempt(db, () => signUp(db, late, training));

      expect(exactly).toMatchObject({ ok: false, code: "23514", message: "signup_closed" });
      expect(after).toMatchObject({ ok: false, code: "23514", message: "signup_closed" });
      expect(await activeRoster(db, training)).toHaveLength(1);
    });
  });
});
