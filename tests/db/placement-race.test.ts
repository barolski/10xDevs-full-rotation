// risk: #1 (context/foundation/test-plan.md §2) — several players take the last main-list spot at once.
// signups_assign_position() serializes a training's queue number and a player's overlap check with two advisory
// locks. They only matter under real contention, so these tests commit on separate connections (20 racers) and
// delete their own rows afterwards. A sweep at the start and a delete at the end keep the database as found.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Db,
  activeRoster,
  connect,
  counts,
  createPlayers,
  createTraining,
  sweepTestData,
  uniqueToken,
} from "./helpers";

const RACERS = 20;
const SEEDED = 11;
const ROUNDS = 3;

interface Outcome {
  ok: boolean;
  position?: number;
  code?: string;
  message?: string;
}

let admin: Db;
let racers: Db[];
let baseline: Awaited<ReturnType<typeof counts>>;

/** Opens a transaction acting as `userId`, then inserts the sign-up and commits; resolves instead of throwing. */
async function prepare(client: Db, userId: string): Promise<void> {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
}

async function fire(client: Db, trainingId: string): Promise<Outcome> {
  try {
    const { rows } = await client.query<{ position: number }>(
      "insert into public.signups (training_id) values ($1) returning position",
      [trainingId],
    );
    await client.query("commit");
    return { ok: true, position: rows[0].position };
  } catch (error) {
    await client.query("rollback");
    const detail = error as { code?: string; message?: string };
    return { ok: false, code: detail.code, message: detail.message };
  }
}

/** All given users insert for their training at the same moment, each on its own connection. */
async function race(entries: { client: Db; userId: string; trainingId: string }[]): Promise<Outcome[]> {
  await Promise.all(entries.map((entry) => prepare(entry.client, entry.userId)));
  return Promise.all(entries.map((entry) => fire(entry.client, entry.trainingId)));
}

async function seedSignups(trainingId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await prepare(admin, userId);
    await admin.query("insert into public.signups (training_id) values ($1)", [trainingId]);
    await admin.query("commit");
  }
}

beforeAll(async () => {
  admin = await connect();
  await sweepTestData(admin);
  baseline = await counts(admin);
  racers = await Promise.all(Array.from({ length: RACERS }, () => connect()));
});

afterAll(async () => {
  await Promise.all(racers.map((client) => client.end()));
  await sweepTestData(admin);
  // Every committed row this file created is gone again.
  expect(await counts(admin)).toEqual(baseline);
  await admin.end();
});

describe("last main-list slot under contention", () => {
  it.each(Array.from({ length: ROUNDS }, (_, i) => i + 1))(
    "round %i: 20 racers for the one free slot get unique, contiguous positions",
    async (round) => {
      const token = `${uniqueToken()}-r${round}`;
      const players = await createPlayers(admin, SEEDED + RACERS, token);
      const training = await createTraining(admin, { title: `E2E DB race ${token}` });
      const seeded = players.slice(0, SEEDED);
      const contenders = players.slice(SEEDED);
      await seedSignups(training, seeded);

      const outcomes = await race(contenders.map((userId, i) => ({ client: racers[i], userId, trainingId: training })));

      expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([]);
      const roster = await activeRoster(admin, training);
      // 11 + 20 sign-ups: every number from 1 to 31 is used exactly once.
      expect(roster.map((row) => row.position)).toEqual(Array.from({ length: SEEDED + RACERS }, (_, i) => i + 1));
      const winners = outcomes.filter((outcome) => outcome.position === SEEDED + 1);
      expect(winners).toHaveLength(1);
      // The main list is the 11 seeded players plus whoever took position 12; the other 19 wait.
      const main = roster.slice(0, 12).map((row) => row.user_id);
      expect(main.slice(0, SEEDED)).toEqual(seeded);
      expect(contenders).toContain(main[SEEDED]);
      expect(roster.slice(12)).toHaveLength(RACERS - 1);
    },
  );
});

describe("per-player locks", () => {
  it("lets one of two parallel sign-ups by the same player for the same training in", async () => {
    const token = uniqueToken();
    const [player] = await createPlayers(admin, 1, token);
    const training = await createTraining(admin, { title: `E2E DB same-player ${token}` });

    const outcomes = await race([
      { client: racers[0], userId: player, trainingId: training },
      { client: racers[1], userId: player, trainingId: training },
    ]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.find((outcome) => !outcome.ok)?.code).toBe("23505");
    expect(await activeRoster(admin, training)).toHaveLength(1);
  });

  it("lets only one of two parallel sign-ups by the same player for overlapping trainings in", async () => {
    const token = uniqueToken();
    const [player] = await createPlayers(admin, 1, token);
    const first = await createTraining(admin, { title: `E2E DB overlap-a ${token}`, startsInMinutes: 48 * 60 });
    const second = await createTraining(admin, { title: `E2E DB overlap-b ${token}`, startsInMinutes: 49 * 60 });

    const outcomes = await race([
      { client: racers[0], userId: player, trainingId: first },
      { client: racers[1], userId: player, trainingId: second },
    ]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({ code: "23514", message: "overlapping_signup" });
    const held = (await activeRoster(admin, first)).length + (await activeRoster(admin, second)).length;
    expect(held).toBe(1);
  });
});
