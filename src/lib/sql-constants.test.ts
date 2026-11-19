import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ABSENCE_LIMIT, ABSENCE_WINDOW } from "@/lib/attendance";
import { MAIN_LIST_SIZE, MIN_CONFIRMED } from "@/lib/signups";

// The TS side mirrors a few numbers whose authoritative copy is SQL. The rule itself is tested against a real
// database in test-plan Phase 2; this only catches the two copies drifting apart.
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");

interface Definition {
  file: string;
  body: string;
}

// The latest migration (by filename order) that defines the function wins; its body runs up to the next
// top-level `create`. `--` comments are stripped so a number mentioned in prose cannot match.
function latestDefinition(functionName: string): Definition {
  const header = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${functionName}\\s*\\(`, "i");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files.toReversed()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/--.*$/gm, "");
    const start = sql.search(header);
    if (start < 0) continue;
    const rest = sql.slice(start + 1);
    const next = rest.search(/\bcreate\s/i);
    return { file, body: next < 0 ? rest : rest.slice(0, next) };
  }
  throw new Error(`No migration in ${MIGRATIONS_DIR} defines public.${functionName}`);
}

function numberAfter(definition: Definition, pattern: RegExp, what: string): number {
  const match = pattern.exec(definition.body);
  if (!match) throw new Error(`${definition.file}: could not find ${what}; update this test if the SQL was rewritten`);
  return Number(match[1]);
}

describe("TS constants that mirror SQL", () => {
  it("ABSENCE_WINDOW matches the trailing-training window in lockout_absences", () => {
    const sql = latestDefinition("lockout_absences");

    expect(numberAfter(sql, /\blimit\s+(\d+)/i, "the window `limit N`")).toBe(ABSENCE_WINDOW);
  });

  it("ABSENCE_LIMIT matches the absence threshold in is_blocked", () => {
    const sql = latestDefinition("is_blocked");

    expect(numberAfter(sql, /v_count\s*<\s*(\d+)/i, "the `v_count < N` threshold")).toBe(ABSENCE_LIMIT);
  });

  it("MIN_CONFIRMED matches the confirm threshold in close_due_trainings", () => {
    const sql = latestDefinition("close_due_trainings");

    expect(numberAfter(sql, />=\s*(\d+)\s*then\s*'confirmed'/i, "the `>= N then 'confirmed'` threshold")).toBe(
      MIN_CONFIRMED,
    );
  });

  it("MAIN_LIST_SIZE matches the main-list size in promote_after_withdrawal", () => {
    const sql = latestDefinition("promote_after_withdrawal");

    expect(numberAfter(sql, /\)\s*>=\s*(\d+)\s*then/i, "the `) >= N then` main-list check")).toBe(MAIN_LIST_SIZE);
  });

  it("MAIN_LIST_SIZE matches the main-list size in lockout_absences", () => {
    const sql = latestDefinition("lockout_absences");

    expect(numberAfter(sql, /\)\s*<\s*(\d+)/, "the `) < N` main-list check")).toBe(MAIN_LIST_SIZE);
  });
});
