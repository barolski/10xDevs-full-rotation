// Stop: sweep everything this turn changed before the agent finishes, with one retry.
// Lints every changed file (this also catches files rewritten through a shell command, which never reach the
// per-edit hook), runs the whole unit suite (about a second) and typechecks the project, in every checkout this
// session touched.
import { existsSync } from "node:fs";
import path from "node:path";
import {
  LINT_EXT,
  allTests,
  block,
  clearRegistry,
  git,
  lint,
  readPayload,
  registered,
  tail,
  topLevel,
  typecheck,
  workerTypes,
} from "./lib.mjs";

const payload = readPayload();

// Already sent back once by this hook: let the agent finish. The commit gate catches the rest.
// (loop_count is Cursor's counterpart of stop_hook_active, for when it imports this hook.)
if (payload.stop_hook_active === true || Number(payload.loop_count ?? 0) > 0) process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const roots = [...new Set([topLevel(cwd), ...registered(payload.session_id).map(topLevel)].filter(Boolean))];
if (roots.length === 0) {
  // Not silent: the user sees why nothing was checked.
  process.stdout.write(
    `${JSON.stringify({ systemMessage: `end-of-turn: no git checkout at ${cwd}, nothing checked.` })}\n`,
  );
  process.exit(0);
}

const report = [];
for (const root of roots) {
  const changed = [
    ...new Set(
      [git(root, "diff", "--name-only", "HEAD"), git(root, "ls-files", "-o", "--exclude-standard")]
        .flatMap((out) => (out ?? "").split("\n"))
        .filter(Boolean),
    ),
  ];
  // Nothing changed (a Q&A turn): nothing to check here.
  if (changed.length === 0) continue;

  const files = changed.filter((f) => LINT_EXT.test(f) && existsSync(path.join(root, f)));
  if (files.length === 0) continue;

  const linted = lint(root, files);
  if (!linted.ok) report.push(`ESLint errors in changed files (${root}):\n${tail(linted.out)}`);

  const tested = allTests(root);
  if (!tested.ok) report.push(`Unit tests fail (${root}):\n${tail(tested.out)}`);

  if (!existsSync(path.join(root, "worker-configuration.d.ts"))) workerTypes(root);
  const typed = typecheck(root);
  if (!typed.ok) report.push(`Typecheck fails (${root}):\n${tail(typed.out)}`);
}

if (report.length > 0) block(`Fix these before you finish:\n\n${report.join("\n\n")}`);
// Green: the registered checkouts are clean, start the next turn with an empty registry.
clearRegistry(payload.session_id);
