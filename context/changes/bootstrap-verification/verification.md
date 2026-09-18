---
bootstrapped_at: 2026-09-17T18:47:26Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: full-rotation
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: full-rotation
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
```

## Why this stack

FullRotation is a solo-built, web-app MVP with a 5-week after-hours timeline, email+password
auth (FR-001, FR-002), and a scheduled sign-up close 3 hours before each training (FR-013).
10x Astro Starter is the recommended default for `(web, js)`, clears all four agent-friendly
gates, and ships auth + database + edge deploy out of the box via Supabase and Cloudflare —
a good match for a short, solo timeline. Team balancing (FR-017–020) is a deterministic
constraint-satisfaction algorithm, not an AI feature, so `has_ai` is false; the scheduled
sign-up close is a background-job flag the starter's Cloudflare deployment can cover with
Cron Triggers, though that wiring is a setup step beyond the starter's defaults. Deployment
stays on the starter's own default (Cloudflare Pages), and CI runs on GitHub Actions with
auto-deploy-on-merge — the standard shape for a solo project moving fast.

## Pre-scaffold verification

| Signal             | Value                                                      | Severity | Notes                                                              |
| ------------------- | ----------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| npm package        | not run                                                    | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to check |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-09-12  | fresh    | from card `docs_url`                                               |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level entries (`.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `AGENTS.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `scripts/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`, plus `CLAUDE.md` sidelined below)
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (existing project CLAUDE.md preserved)
**.gitignore handling**: moved silently (no pre-existing `.gitignore` in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed first, per git-clone strategy)

Retry note: the first attempt at this run HARD-STOPPED at this step (`npm install` failed — see prior log entry, now superseded) because the scaffold's `.nvmrc` pins Node `22.14.0`, which was not installed under this machine's version manager (only `24.21.0` was present). The user installed Node `22.14.0` via `nvm install 22.14.0 && nvm use 22.14.0` and re-invoked; this log reflects the successful retry.

`npm install` completed with non-blocking `EBADENGINE` warnings for `astro-eslint-parser@3.1.0`, `eslint-plugin-astro@3.1.0`, and `undici@8.10.2` (each wants a newer Node than `22.14.0`); install still succeeded (654 packages added, 0 vulnerabilities at install time).

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not applicable — 0 findings total (804 total dependencies: 377 prod, 269 dev, 167 optional, 0 peer)

Clean tree. No findings in any severity tier.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ------------------------------------ |
| bootstrapper_confidence    | first-class                          |
| quality_override           | false                                 |
| path_taken                 | standard                              |
| self_check_answers         | null                                  |
| team_size                  | solo                                  |
| deployment_target          | cloudflare-pages                      |
| ci_provider                | github-actions                        |
| ci_default_flow            | auto-deploy-on-merge                  |
| has_auth                   | true                                  |
| has_payments               | false                                  |
| has_realtime               | false                                  |
| has_ai                     | false                                  |
| has_background_jobs        | true                                   |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` and decide what, if anything, to merge in from the starter's version.
- The starter's `.nvmrc` pins Node `22.14.0`; a few dependencies (`astro-eslint-parser`, `eslint-plugin-astro`, `undici`) prefer a newer Node — consider bumping the pin if you hit runtime issues, or leave as-is since install and audit both succeeded cleanly.
- Address audit findings per your project's risk tolerance — none were found in this run, but re-run `npm audit` after adding dependencies.
