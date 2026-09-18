---
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
---

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
