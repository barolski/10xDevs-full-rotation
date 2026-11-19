// risk: #4 (context/foundation/test-plan.md §2) — the team slot goes to the wrong player after a withdrawal.
// inherit_team_slot_after_withdrawal() runs right after promote_after_withdrawal(): the promoted waitlister takes the
// vacated slot in the SAME team (FR-019), and a team that lost its only setter gets a substitute setter, the
// highest-rated remaining member (FR-018). Generating teams is app-level, so these tests seed `team_assignments`
// rows directly: team A is the first six main-list players, team B the next six.
import { describe, expect, it } from "vitest";
import {
  type Db,
  confirmedTraining,
  createTraining,
  inRollback,
  promotedUsers,
  shiftTraining,
  withdraw,
} from "./helpers";

interface TeamRow {
  user_id: string;
  team: string;
  is_substitute_setter: boolean;
}

async function generateTeams(db: Db, training: string, players: string[]): Promise<void> {
  const members = players.slice(0, 12);
  for (const [i, user] of members.entries()) {
    await db.query("insert into public.team_assignments (training_id, user_id, team) values ($1, $2, $3)", [
      training,
      user,
      i < 6 ? "A" : "B",
    ]);
  }
}

async function makeSetters(db: Db, users: string[]): Promise<void> {
  await db.query("update public.profiles set primary_position = 'setter' where user_id = any($1)", [users]);
}

async function teamRows(db: Db, training: string): Promise<TeamRow[]> {
  const { rows } = await db.query<TeamRow>(
    "select user_id, team, is_substitute_setter from public.team_assignments where training_id = $1 order by team, user_id",
    [training],
  );
  return rows;
}

async function rowOf(db: Db, training: string, user: string): Promise<TeamRow | undefined> {
  return (await teamRows(db, training)).find((row) => row.user_id === user);
}

/** A rating for `user` on a separate training that starts `startsInMinutes` from now (negative = already played). */
async function rate(db: Db, user: string, rating: number, startsInMinutes: number): Promise<void> {
  const other = await createTraining(db);
  await shiftTraining(db, other, startsInMinutes);
  await db.query("insert into public.training_ratings (training_id, user_id, rating) values ($1, $2, $3)", [
    other,
    user,
    rating,
  ]);
}

const WEEK = 7 * 24 * 60;

describe("the promoted waitlister inherits the vacated team slot", () => {
  it("lands in the same team, not as a substitute setter, and is the same player the promotion stamped", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await generateTeams(db, training, players);
      await makeSetters(db, [players[0], players[6]]);

      await withdraw(db, players[2], training);

      expect(await promotedUsers(db, training)).toEqual([players[12]]);
      expect(await rowOf(db, training, players[2])).toBeUndefined();
      expect(await rowOf(db, training, players[12])).toMatchObject({ team: "A", is_substitute_setter: false });
      expect(await rowOf(db, training, players[13])).toBeUndefined();
      expect(await teamRows(db, training)).toHaveLength(12);
    });
  });

  it("deletes the vacated row when nobody is waiting", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 12 });
      await generateTeams(db, training, players);
      await makeSetters(db, [players[0], players[6]]);

      await withdraw(db, players[8], training);

      expect(await rowOf(db, training, players[8])).toBeUndefined();
      expect(await teamRows(db, training)).toHaveLength(11);
    });
  });
});

describe("a substitute setter when the team loses its only setter", () => {
  it("picks the remaining member with the highest average past rating, and ignores later trainings", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await generateTeams(db, training, players);
      await makeSetters(db, [players[1], players[6]]);
      await rate(db, players[3], 8, -WEEK);
      await rate(db, players[3], 7, -2 * WEEK);
      await rate(db, players[4], 6, -WEEK);
      await rate(db, players[5], 10, WEEK); // a training that has not happened yet does not count

      await withdraw(db, players[1], training);

      const team = (await teamRows(db, training)).filter((row) => row.team === "A");
      expect(team.filter((row) => row.is_substitute_setter).map((row) => row.user_id)).toEqual([players[3]]);
      expect(await rowOf(db, training, players[12])).toMatchObject({ team: "A", is_substitute_setter: false });
    });
  });

  it("breaks a rating tie by queue position, counting an unrated player as 0", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await generateTeams(db, training, players);
      await makeSetters(db, [players[1], players[6]]);

      await withdraw(db, players[1], training);

      // Nobody is rated: team A is players 0, 2, 3, 4, 5 and the inheritor (13th in the queue). Earliest wins.
      const team = (await teamRows(db, training)).filter((row) => row.team === "A");
      expect(team.filter((row) => row.is_substitute_setter).map((row) => row.user_id)).toEqual([players[0]]);
    });
  });

  it("leaves a team alone when it still has another setter", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await generateTeams(db, training, players);
      await makeSetters(db, [players[0], players[1], players[6]]);
      await rate(db, players[3], 9, -WEEK);

      await withdraw(db, players[1], training);

      const team = (await teamRows(db, training)).filter((row) => row.team === "A");
      expect(team.filter((row) => row.is_substitute_setter)).toEqual([]);
    });
  });
});

describe("withdrawals that must not touch the teams", () => {
  it("changes no team row when a waitlister withdraws", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });
      await generateTeams(db, training, players);
      const before = await teamRows(db, training);

      await withdraw(db, players[12], training);

      expect(await teamRows(db, training)).toEqual(before);
    });
  });

  it("creates no team row when the training has no generated teams", async () => {
    await inRollback(async (db) => {
      const { training, players } = await confirmedTraining(db, { signups: 14 });

      await withdraw(db, players[2], training);

      expect(await promotedUsers(db, training)).toEqual([players[12]]);
      expect(await teamRows(db, training)).toEqual([]);
    });
  });
});
