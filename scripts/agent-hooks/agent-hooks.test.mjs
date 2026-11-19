// Proof for the Claude Code hooks: every case feeds a payload to the real script and asserts the exit code and the
// channel (exit 2 + stderr reaches the agent, exit 0 is "checked, clean" or "nothing to check").
// Only the slow tools are stubbed (eslint, vitest, astro check): each stub fails when a file under test contains
// a marker (LINT_ERROR, TEST_FAIL, TYPE_ERROR). Git, the payload parsing, routing and checkout resolution are real.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const HOOKS = import.meta.dirname;
const PER_EDIT = path.join(HOOKS, "per-edit.mjs");
const END_OF_TURN = path.join(HOOKS, "end-of-turn.mjs");

const STUBS = {
  "eslint/bin/eslint.js": `
    import { readFileSync } from "node:fs";
    const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    const bad = files.filter((f) => readFileSync(f, "utf8").includes("LINT_ERROR"));
    for (const f of bad) console.log(f + ": error no-unused-vars");
    process.exit(bad.length > 0 ? 1 : 0);`,
  "vitest/vitest.mjs": `
    import { readdirSync, readFileSync } from "node:fs";
    import path from "node:path";
    const [mode, ...rest] = process.argv.slice(2);
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const files = mode === "related" ? rest.filter((a) => !a.startsWith("-")) : walk("src");
    const bad = files.filter((f) => readFileSync(f, "utf8").includes("TEST_FAIL"));
    for (const f of bad) console.log("FAIL " + f);
    process.exit(bad.length > 0 ? 1 : 0);`,
  "astro/bin/astro.mjs": `
    import { readdirSync, readFileSync } from "node:fs";
    import path from "node:path";
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const bad = walk("src").filter((f) => readFileSync(f, "utf8").includes("TYPE_ERROR"));
    const esc = String.fromCharCode(27);
    for (const f of bad) console.log(esc + "[91merror" + esc + "[0m " + f + ": ts(2322)");
    process.exit(bad.length > 0 ? 1 : 0);`,
};

const scratch = mkdtempSync(path.join(os.tmpdir(), "agent-hooks-test-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let counter = 0;
function sh(cwd, cmd, args) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function installStubs(dir) {
  for (const [file, body] of Object.entries(STUBS)) {
    const target = path.join(dir, "node_modules", file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

function makeRepo({ stubs = true } = {}) {
  const dir = path.join(scratch, `repo-${String(++counter)}`);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  sh(dir, "git", ["init", "-q"]);
  sh(dir, "git", ["config", "user.email", "t@example.com"]);
  sh(dir, "git", ["config", "user.name", "t"]);
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
  writeFileSync(path.join(dir, "src/ok.ts"), "export const ok = 1;\n");
  writeFileSync(path.join(dir, "README.md"), "# readme\n");
  if (stubs) installStubs(dir);
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "init"]);
  return dir;
}

function write(dir, rel, body) {
  writeFileSync(path.join(dir, rel), body);
  return path.join(dir, rel);
}

function run(script, payload, { cwd, env = {} } = {}) {
  const tmp = path.join(scratch, "tmp");
  mkdirSync(tmp, { recursive: true });
  const result = spawnSync(process.execPath, [script], {
    cwd,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const edit = (dir, file, extra = {}) => ({
  session_id: "s1",
  cwd: dir,
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path: file },
  ...extra,
});

describe("per-edit hook", () => {
  it("blocks a lint error in the edited file and names file and problem on stderr", () => {
    const dir = makeRepo();
    const file = write(dir, "src/bad.ts", "// LINT_ERROR\n");

    const result = run(PER_EDIT, edit(dir, file), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ESLint reported errors in src/bad.ts");
    expect(result.stderr).toContain("no-unused-vars");
  });

  it("blocks a failing related test", () => {
    const dir = makeRepo();
    const file = write(dir, "src/flaky.ts", "// TEST_FAIL\n");

    const result = run(PER_EDIT, edit(dir, file), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Tests related to src/flaky.ts fail");
  });

  it("passes a clean file", () => {
    const dir = makeRepo();

    expect(run(PER_EDIT, edit(dir, path.join(dir, "src/ok.ts")), { cwd: dir }).status).toBe(0);
  });

  it("skips file types the linter does not cover, even when they contain an error marker", () => {
    const dir = makeRepo();
    const file = write(dir, "README.md", "LINT_ERROR\n");

    expect(run(PER_EDIT, edit(dir, file), { cwd: dir }).status).toBe(0);
  });

  it("passes when the edited file no longer exists", () => {
    const dir = makeRepo();

    expect(run(PER_EDIT, edit(dir, path.join(dir, "src/gone.ts")), { cwd: dir }).status).toBe(0);
  });

  it.each([["{}"], ["not json"], [""], [JSON.stringify({ tool_name: "Edit", tool_input: {} })]])(
    "passes on an empty or unusable payload (%j)",
    (payload) => {
      const dir = makeRepo();

      expect(run(PER_EDIT, payload, { cwd: dir }).status).toBe(0);
    },
  );

  it("resolves a relative path against the payload cwd", () => {
    const dir = makeRepo();
    write(dir, "src/bad.ts", "// LINT_ERROR\n");

    const result = run(PER_EDIT, edit(dir, "src/bad.ts"), { cwd: scratch });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/bad.ts");
  });

  it("skips a file of another repository", () => {
    const dir = makeRepo();
    const other = makeRepo();
    const file = write(other, "src/bad.ts", "// LINT_ERROR\n");

    expect(run(PER_EDIT, edit(dir, file), { cwd: dir }).status).toBe(0);
  });

  it("checks the session checkout even when CLAUDE_PROJECT_DIR names another one", () => {
    const dir = makeRepo();
    const other = makeRepo();
    write(other, "src/ok.ts", "// LINT_ERROR\n");

    const result = run(PER_EDIT, edit(dir, path.join(dir, "src/ok.ts")), {
      cwd: dir,
      env: { CLAUDE_PROJECT_DIR: other },
    });

    expect(result.status).toBe(0);
  });

  it("fails visibly when the linter is not installed instead of passing", () => {
    const dir = makeRepo({ stubs: false });
    const file = write(dir, "src/ok.ts", "export const ok = 2;\n");

    const result = run(PER_EDIT, edit(dir, file), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("eslint");
    expect(result.stderr).toContain("not found");
  });

  it("checks an edit in a sibling worktree of the same repository", () => {
    const dir = makeRepo();
    const tree = path.join(scratch, `tree-${String(counter)}`);
    sh(dir, "git", ["worktree", "add", "-q", "-b", "side", tree]);
    symlinkSync(path.join(dir, "node_modules"), path.join(tree, "node_modules"), "junction");
    const file = write(tree, "src/bad.ts", "// LINT_ERROR\n");

    const result = run(PER_EDIT, edit(dir, file), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/bad.ts");
  });
});

describe("end-of-turn hook", () => {
  const stop = (dir, extra = {}) => ({ session_id: "s2", cwd: dir, hook_event_name: "Stop", ...extra });

  it("passes without running any tool when nothing changed", () => {
    const dir = makeRepo({ stubs: false });

    expect(run(END_OF_TURN, stop(dir), { cwd: dir }).status).toBe(0);
  });

  it("blocks on a lint error in a file rewritten without any per-edit payload", () => {
    const dir = makeRepo();
    write(dir, "src/ok.ts", "// LINT_ERROR\n");

    const result = run(END_OF_TURN, stop(dir), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Fix these before you finish");
    expect(result.stderr).toContain("ESLint errors in changed files");
    expect(result.stderr).toContain("src/ok.ts");
  });

  it("blocks on a failing test and a type error in the same sweep", () => {
    const dir = makeRepo();
    write(dir, "src/a.ts", "// TEST_FAIL\n");
    write(dir, "src/b.ts", "// TYPE_ERROR\n");

    const result = run(END_OF_TURN, stop(dir), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unit tests fail");
    expect(result.stderr).toContain("Typecheck fails");
    // astro check colours its output regardless of NO_COLOR; the agent must get plain text.
    expect(result.stderr).not.toContain(String.fromCharCode(27));
  });

  it("lets the agent finish when the Stop hook already sent it back once", () => {
    const dir = makeRepo();
    write(dir, "src/ok.ts", "// LINT_ERROR\n");

    expect(run(END_OF_TURN, stop(dir, { stop_hook_active: true }), { cwd: dir }).status).toBe(0);
    expect(run(END_OF_TURN, stop(dir, { loop_count: 1 }), { cwd: dir }).status).toBe(0);
  });

  it("passes on a clean changed file", () => {
    const dir = makeRepo();
    write(dir, "src/ok.ts", "export const ok = 2;\n");

    expect(run(END_OF_TURN, stop(dir), { cwd: dir }).status).toBe(0);
  });

  it("says why nothing was checked outside a git checkout", () => {
    const outside = mkdtempSync(path.join(scratch, "nogit-"));

    const result = run(END_OF_TURN, stop(outside), { cwd: outside });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("nothing checked");
  });

  it("sweeps a sibling worktree registered by the per-edit hook", () => {
    const dir = makeRepo();
    const tree = path.join(scratch, `tree-${String(counter)}`);
    sh(dir, "git", ["worktree", "add", "-q", "-b", "side", tree]);
    symlinkSync(path.join(dir, "node_modules"), path.join(tree, "node_modules"), "junction");
    const file = write(tree, "src/ok.ts", "export const ok = 3;\n");
    expect(run(PER_EDIT, edit(dir, file, { session_id: "s3" }), { cwd: dir }).status).toBe(0);
    write(tree, "src/ok.ts", "// LINT_ERROR\n");

    const result = run(END_OF_TURN, stop(dir, { session_id: "s3" }), { cwd: dir });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/ok.ts");
  });
});

describe("hook scripts", () => {
  it("ship next to this test", () => {
    expect(readdirSync(HOOKS)).toEqual(expect.arrayContaining(["lib.mjs", "per-edit.mjs", "end-of-turn.mjs"]));
    expect(readFileSync(PER_EDIT, "utf8")).toContain("block(");
  });
});
