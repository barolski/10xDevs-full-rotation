// PostToolUse (Write|Edit): lint the file the agent just edited and run the tests related to it.
// Reports through stderr + exit 2, the only channel that reaches the agent. Anything it cannot check
// (no path, uncovered file type, deleted file, a file of another repository) is "nothing to check", exit 0.
import { existsSync } from "node:fs";
import {
  LINT_EXT,
  TEST_EXT,
  block,
  lint,
  readPayload,
  register,
  relatedTests,
  resolveCheckout,
  tail,
  toRel,
} from "./lib.mjs";

const payload = readPayload();
const input = payload.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};
const file = input.file_path ?? input.notebook_path;
if (typeof file !== "string" || !file || !LINT_EXT.test(file)) process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const checkout = resolveCheckout(file, cwd);
if (!checkout || !existsSync(checkout.abs)) process.exit(0);
const rel = toRel(checkout.root, checkout.abs);
if (!rel) process.exit(0);

register(payload.session_id, checkout.root);

const failures = [];
const linted = lint(checkout.root, [rel]);
if (!linted.ok) failures.push(`ESLint reported errors in ${rel}:\n${tail(linted.out)}`);
if (TEST_EXT.test(rel)) {
  const tested = relatedTests(checkout.root, [rel]);
  if (!tested.ok) failures.push(`Tests related to ${rel} fail:\n${tail(tested.out)}`);
}
if (failures.length > 0) block(failures.join("\n\n"));
