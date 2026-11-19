// risk: #2 (context/foundation/test-plan.md §2) — a training is closed or resolved wrongly.
// close_due_trainings() finalizes every open training whose sign-up window has closed (starts_at - 3 h <= now()):
// `confirmed` with at least 10 active sign-ups, else `cancelled`. Expected outcomes come from the PRD threshold
// (FR-013..015) and the sign-ups each test makes, not from reading the SQL back. The browser-visible facet is in
// tests/e2e/training-close.spec.ts; the schedule itself (cron) is a deployment concern and not tested here.
// Every test rolls back, so the finalizer's side effect on unrelated due trainings in the local database vanishes.
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

interface TrainingState {
  status: string;
  closed_at: Date | null;
}

async function state(db: Db, trainingId: string): Promise<TrainingState> {
  const { rows } = await db.query<TrainingState>("select status, closed_at from public.trainings where id = $1", [
    trainingId,
  ]);
  return rows[0];
}

async function runFinalizer(db: Db): Promise<number> {
  const { rows } = await db.query<{ closed: number }>("select public.close_due_trainings() as closed");
  return rows[0].closed;
}

/**
 * A training with `signups` sign-ups made through the real trigger (the first `withdrawn` of them withdraw while
 * sign-ups are still open), then moved so it starts `startsInMinutes` from now. 120 means the window closed an hour ago.
 */
async function filledTraining(
  db: Db,
  options: { signups: number; withdrawn?: number; startsInMinutes?: number },
): Promise<{ training: string; players: string[] }> {
  const players = await createPlayers(db, options.signups);
  const training = await createTraining(db);
  for (const player of players) await signUp(db, player, training);
  for (const player of players.slice(0, options.withdrawn ?? 0)) await withdraw(db, player, training);
  await shiftTraining(db, training, options.startsInMinutes ?? 120);
  return { training, players };
}

describe("the confirm threshold", () => {
  it.each([
    { signups: 9, status: "cancelled" },
    { signups: 10, status: "confirmed" },
    { signups: 12, status: "confirmed" },
    { signups: 13, status: "confirmed" },
  ])("$signups active sign-ups finalize as $status", async ({ signups, status }) => {
    await inRollback(async (db) => {
      const { training } = await filledTraining(db, { signups });

      await runFinalizer(db);

      const result = await state(db, training);
      expect(result.status).toBe(status);
      expect(result.closed_at).toBeInstanceOf(Date);
    });
  });

  it.each([
    { signups: 11, withdrawn: 1, status: "confirmed" },
    { signups: 10, withdrawn: 1, status: "cancelled" },
  ])(
    "$signups sign-ups with $withdrawn withdrawn count only the active ones: $status",
    async ({ signups, withdrawn, status }) => {
      await inRollback(async (db) => {
        const { training } = await filledTraining(db, { signups, withdrawn });

        await runFinalizer(db);

        expect((await state(db, training)).status).toBe(status);
      });
    },
  );
});

describe("the sign-up window boundary", () => {
  it.each([
    { startsInMinutes: 181, status: "open" },
    { startsInMinutes: 180, status: "confirmed" },
    { startsInMinutes: 179, status: "confirmed" },
  ])(
    "a training starting in $startsInMinutes minutes is $status after the finalizer runs",
    async ({ startsInMinutes, status }) => {
      await inRollback(async (db) => {
        const { training } = await filledTraining(db, { signups: 10, startsInMinutes });

        await runFinalizer(db);

        const result = await state(db, training);
        expect(result.status).toBe(status);
        expect(result.closed_at === null).toBe(status === "open");
      });
    },
  );

  it("never touches a training whose window is still open, whatever its roster size", async () => {
    await inRollback(async (db) => {
      const { training } = await filledTraining(db, { signups: 12, startsInMinutes: 48 * 60 });

      await runFinalizer(db);

      expect(await state(db, training)).toEqual({ status: "open", closed_at: null });
    });
  });

  it("refuses new sign-ups once the window has closed", async () => {
    await inRollback(async (db) => {
      const { training } = await filledTraining(db, { signups: 10 });
      const [latecomer] = await createPlayers(db, 1);
      await runFinalizer(db);

      const result = await attempt(db, () => signUp(db, latecomer, training));

      expect(result).toMatchObject({ ok: false, code: "23514", message: "signup_closed" });
    });
  });
});

describe("a finalized training stays finalized", () => {
  it("is idempotent: a second run changes nothing and reports nothing to do", async () => {
    await inRollback(async (db) => {
      const { training } = await filledTraining(db, { signups: 10 });
      await runFinalizer(db);
      const first = await state(db, training);

      const secondRunCount = await runFinalizer(db);

      expect(secondRunCount).toBe(0);
      expect(await state(db, training)).toEqual(first);
    });
  });

  it("is not decided again after players withdraw late", async () => {
    await inRollback(async (db) => {
      const { training, players } = await filledTraining(db, { signups: 10 });
      await runFinalizer(db);
      const decided = await state(db, training);
      expect(decided.status).toBe("confirmed");

      // The database allows a withdrawal after the close (it counts as an absence); the outcome must not flip.
      await withdraw(db, players[0], training);
      await withdraw(db, players[1], training);
      await runFinalizer(db);

      expect(await state(db, training)).toEqual(decided);
    });
  });
});

describe("who may run the finalizer and who may set a status", () => {
  it("can be run by the cron worker (anon) and by a signed-in player, and finalizes the due training", async () => {
    await inRollback(async (db) => {
      const { training: byAnon } = await filledTraining(db, { signups: 10 });
      const anonRun = await asAnon(db, () => runFinalizer(db));
      expect(anonRun).toBeGreaterThanOrEqual(1);
      expect((await state(db, byAnon)).status).toBe("confirmed");

      const { training: byPlayer, players } = await filledTraining(db, { signups: 9 });
      const playerRun = await asUser(db, players[0], () => runFinalizer(db));
      expect(playerRun).toBeGreaterThanOrEqual(1);
      expect((await state(db, byPlayer)).status).toBe("cancelled");
    });
  });

  it("does not let a player or an organizer write a status or a closing time directly", async () => {
    await inRollback(async (db) => {
      const { training, players } = await filledTraining(db, { signups: 9 });
      const organizer = await createOrganizer(db);

      for (const actor of [players[0], organizer]) {
        const status = await attempt(db, () =>
          asUser(db, actor, () =>
            db.query("update public.trainings set status = 'confirmed' where id = $1", [training]),
          ),
        );
        const closedAt = await attempt(db, () =>
          asUser(db, actor, () => db.query("update public.trainings set closed_at = now() where id = $1", [training])),
        );
        expect(status).toMatchObject({ ok: false, code: "42501" });
        expect(closedAt).toMatchObject({ ok: false, code: "42501" });
      }
      expect(await state(db, training)).toEqual({ status: "open", closed_at: null });
    });
  });
});
