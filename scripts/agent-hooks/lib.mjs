// Shared helpers for the Claude Code hooks in this folder (see per-edit.mjs and end-of-turn.mjs).
// Plain Node on purpose: the repo develops on Windows without jq, and Node 22 is already required.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Hook output is read by a model, not a terminal: no colours, whatever the user's shell exports.
const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

// Files ESLint covers in this repo (eslint.config.js: js/ts/tsx plus eslint-plugin-astro for .astro).
export const LINT_EXT = /\.(?:[cm]?[jt]sx?|astro)$/;
// Files vitest can map to related tests.
export const TEST_EXT = /\.(?:[cm]?[jt]sx?)$/;

export function readPayload() {
  try {
    const value = JSON.parse(readFileSync(0, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    // Empty stdin, unreadable stdin and malformed JSON all mean "no usable payload": nothing to check.
    return {};
  }
}

export function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: ENV });
  return result.status === 0 ? result.stdout.trim() : null;
}

function real(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function commonDir(dir) {
  const out = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return out ? real(out) : null;
}

export function topLevel(dir) {
  const out = existsSync(dir) ? git(dir, "rev-parse", "--show-toplevel") : null;
  return out ? real(out) : null;
}

// The checkout of the edited file (not $CLAUDE_PROJECT_DIR, which goes stale after EnterWorktree). Files of other
// repositories (~/.claude, other projects) resolve to null; any worktree of the session's repository is accepted.
export function resolveCheckout(file, cwd) {
  const abs = path.resolve(cwd, file);
  const root = topLevel(path.dirname(abs));
  if (!root) return null;
  const common = commonDir(root);
  if (!common || common !== commonDir(cwd)) return null;
  return { root, abs: path.join(real(path.dirname(abs)), path.basename(abs)) };
}

export function toRel(root, abs) {
  const rel = path.relative(root, abs);
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel.split(path.sep).join("/");
}

function runTool(root, bin, args) {
  const script = path.join(root, bin);
  if (!existsSync(script)) return { ok: false, out: `${bin} not found in ${root}: run \`npm ci\` there.` };
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) return { ok: false, out: `could not run ${bin}: ${result.error.message}` };
  return { ok: result.status === 0, out: `${result.stdout}${result.stderr}` };
}

export const lint = (root, files) => runTool(root, "node_modules/eslint/bin/eslint.js", ["--quiet", ...files]);
export const relatedTests = (root, files) =>
  runTool(root, "node_modules/vitest/vitest.mjs", ["related", ...files, "--run"]);
export const allTests = (root) => runTool(root, "node_modules/vitest/vitest.mjs", ["run"]);
// astro check regenerates .astro/ types itself, so a fresh checkout does not need a separate sync.
export const typecheck = (root) => runTool(root, "node_modules/astro/bin/astro.mjs", ["check"]);
// worker-configuration.d.ts is gitignored and generated; the typecheck fails without it.
export const workerTypes = (root) => runTool(root, "node_modules/wrangler/bin/wrangler.js", ["types"]);

// Tools such as astro check colour their output regardless of NO_COLOR; strip it so the agent reads plain text.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export function tail(text, lines = 60) {
  const all = text.replace(ANSI, "").trim().split("\n");
  return all.length > lines ? `…\n${all.slice(-lines).join("\n")}` : all.join("\n");
}

// Checkouts the per-edit hook touched in this session, so the Stop hook also sweeps sibling worktrees.
function registryFile(sessionId) {
  const id = String(sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return id ? path.join(os.tmpdir(), "claude-hooks", `${id}.roots`) : null;
}

export function register(sessionId, root) {
  const file = registryFile(sessionId);
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${root}\n`);
}

export function registered(sessionId) {
  const file = registryFile(sessionId);
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean);
}

export function clearRegistry(sessionId) {
  const file = registryFile(sessionId);
  if (file && existsSync(file)) writeFileSync(file, "");
}

// Exit code 2 plus stderr is the only combination Claude Code feeds back to the agent
// (PostToolUse: next to the tool result; Stop: the agent keeps working).
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
