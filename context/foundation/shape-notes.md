---
project: "FullRotation"
context_type: greenfield
created: 2026-09-15
updated: 2026-09-15
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "coordination overhead — manual tracking of sign-ups/absences and manual on-site team splitting"
    - topic: "insight"
      decision: "no-show penalty requires persistent player identity across weeks; a chat-thread sign-up can't count '2 of last 8'"
    - topic: "primary persona scope"
      decision: "a single named user (the organizer) running exactly one training group"
    - topic: "auth mechanism"
      decision: "email + password; no OAuth"
    - topic: "role model"
      decision: "two roles — organizer and player — with different capabilities"
    - topic: "organizer cardinality"
      decision: "more than one account can hold the organizer role for the single group; no conflict-resolution mechanism between co-organizers in MVP"
    - topic: "MVP scope"
      decision: "full first flow as described in the seed notes (create training -> sign-up with waitlist/lockout -> threshold close/cancel -> team generation -> withdrawal swap -> attendance/counters); ~5-week estimate, sustained-effort cost accepted"
  frs_drafted: 24
  quality_check_status: accepted
product_type: web-app # responsive web app, phone-first
target_scale:
  users: medium # matches the ~20-person group from the seed notes
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 5
  hard_deadline: 2026-11-04
  after_hours_only: true # mostly after-hours; user notes actual hours vary with availability, not strictly evenings/weekends only
---

# Shape Notes — FullRotation

## Vision & Problem Statement

The organizer runs a weekly recreational volleyball session for ~20 people. Sign-ups happen today in a WhatsApp thread; the hall holds 12 and needs a minimum of 10 to be worth playing. The list of who's in gets lost in the thread, nobody tracks who actually showed up, and a no-show carries no consequence — the spot is wasted and the hall still has to be paid. Twice this season attendance landed at 9 and the organizer had to decide last-minute, by counting thumbs-up in a chat, whether to cancel. Separately, once the roster is known, splitting ~10-12 people into two balanced teams takes about 10 minutes on-site and usually produces uneven teams anyway.

The insight: a no-show penalty that looks back over the last 8 sessions requires a persistent identity per player — a name typed into a chat thread can't support that count, and typos/duplicate name variants would let a penalized player just re-sign as "a new player." A chat thread also can't give a live, at-a-glance read of the roster state needed to decide cancel-vs-confirm late, or supply the structured (rating + position) data a fair team split needs.

> Scale probe (Step 6): at 100x scale (~2000 people), the single-training-holds-12 constraint means the natural answer is running many trainings, possibly concurrently, not one giant training — a deliberate out-of-scope direction for this MVP, not a rule change.

## User & Persona

**Primary persona: the organizer** (also the account owner/admin) — runs exactly one training group. Creates trainings, marks attendance, sets player ratings, and needs to decide, as late as possible, whether a session is confirmed, needs to be watched, or should be cancelled — without counting reactions in a chat thread.

### Secondary persona

Players in the organizer's group — each holds one account, belongs to exactly one training group, and signs up for a training from a public event link. They see the main list and waitlist rosters (who's on each), but not who hasn't responded or who is currently blocked.

## Access Control

Email + password accounts; no OAuth. Two roles: **organizer** and **player**.

| Capability | Organizer | Player |
| --- | --- | --- |
| Create a training | ✓ | — |
| View full roster status (main / waitlist / no-response / blocked) | ✓ | — |
| View main list & waitlist rosters | ✓ | ✓ |
| View no-response / blocked breakdown | ✓ | — |
| Sign up / withdraw for a training | — | ✓ |
| Mark attendance | ✓ | — |
| Set player ratings and positions | ✓ (ratings); player sets own positions on their profile | ✓ (own profile positions) |
| Generate teams | ✓ | — |

Sign-up vs sign-in: organizer accounts exist ahead of time (out of scope how they're provisioned). More than one account can hold the organizer role for the single group — no conflict-resolution mechanism between co-organizers is needed at this scale. Players reach the app via a public event link, then either create an account or log in; both flows land them on the training's sign-up view. An unauthenticated user hitting the event link is routed to create-account/login before they can act, but the link itself is public (not access-gated) so it can be shared on WhatsApp as today.

## Success Criteria

### Primary
- The organizer decides confirm/cancel from an app screen — not by counting reactions in a chat thread — for 4 consecutive trainings.
- Teams are generated in under a minute, with no manual fixes needed, in at least 3 of 4 trainings.

### Secondary
- The count of "signed up but absent" per training drops from ~2 today to at most 1 within 4 weeks.
- At least 15 of the 20 group members have an account and sign up through the site.

### Guardrails
- Attendance is marked after every one of the first 4 trainings — the 8-training lockout window has nothing to count against if attendance goes unmarked.

## Timeline acknowledgment

Acknowledged on 2026-09-15: 5-week MVP requires sustained after-hours dedication (6-10h/week) across that period; user accepted. First flow ships the full rule set described in the seed notes (lockout counter, threshold-based confirm/cancel, waitlist promotion, rating+position-balanced team generation) rather than a narrower slice — this was a deliberate choice, not an oversight.

## Functional Requirements

### Authentication & Profile
- FR-001: Player can create an account with email + password. Priority: must-have
  > Socrates: Counter-argument considered: "email+password adds sign-up friction for a casual weekly game." Resolution: kept; it stands as written.
- FR-002: Player can log in with email + password. Priority: must-have
  > Socrates: Counter-argument considered: "forgotten passwords could lose casual players who give up rather than reset." Resolution: kept; it stands as written.
- FR-003: Player can set and edit their profile (name, primary position, secondary position). Priority: must-have
  > Socrates: Counter-argument considered: "position self-report could be gamed to always claim setter." Resolution: kept; it stands as written.

### Sign-up & Roster
- FR-004: Organizer can create a training and get a public sign-up link. Priority: must-have
  > Socrates: Counter-argument considered: "there could be more than one organizer in the system." Resolution: split — still one group (per Non-Goals), but the organizer role can be held by more than one account for that group; see FR-005.
- FR-005: More than one account can hold the organizer role for the group — any organizer account can create trainings, view the full roster, mark attendance, and generate teams. Priority: must-have
  > Socrates: Counter-argument considered: "two organizers could contradict each other (e.g., both mark attendance differently, or one cancels what the other confirmed)." Resolution: kept for MVP; last-write-wins is acceptable at this scale, no conflict-resolution mechanism needed yet.
- FR-006: Player can sign up for a training via the public link; if they don't yet have an account, creating one and logging in happens as a separate, prior step before the sign-up action itself. Priority: must-have
  > Socrates: Counter-argument considered: "merging account creation and sign-up into one action adds friction for someone who just wanted to look." Resolution: revised — account creation/login is explicitly a separate step before sign-up, not fused into it.
- FR-007: System assigns sign-up order to the main list (12 slots), then the waitlist (13th person onward). Priority: must-have
  > Socrates: Counter-argument considered: "pure sign-up order rewards being online at the right moment, not real intent to play." Resolution: kept; everyone who wants to play signs up — this is a casual group, simple first-come-first-served is the right level of complexity.
- FR-008: Player can withdraw their sign-up before sign-ups close. Priority: must-have
  > Socrates: Counter-argument considered: "free withdrawal with no limit could be abused as 'reserve and drop'." Resolution: kept; risk acknowledged but accepted — the group is small, adults who know and respect each other, and the rule needs to stay simple.
- FR-009: System blocks a player from signing up for the next training if they were on the main list and didn't show up twice within the trailing 8 completed trainings. Priority: must-have
  > Socrates: Counter-argument considered: "the lockout could punish ordinary bad luck (illness, work) rather than bad faith." Resolution: kept; the intended mitigation is behavioral, not a rule change — a player unsure whether they'll make it should sign up for the waitlist rather than the main list, per the existing late-withdrawal-as-absence rule (FR-023).
- FR-010: A blocked player sees the reason they can't sign up. Priority: must-have
  > Socrates: Counter-argument considered: "showing the reason could feel like it publicly flags the player." Resolution: kept; it stands as written — visible only to that player, and transparency is better than an unexplained inability to sign up.
- FR-011: Organizer sees the full roster status for a training: main list, waitlist, no-response, blocked. Priority: must-have
  > Socrates: Counter-argument considered: "seeing a 'blocked' status could tempt the organizer to expect a manual unblock, which Non-Goals rules out." Resolution: kept; it stands as written — full visibility is the direct enabler of the Primary success criterion.
- FR-012: Player can see the main list and waitlist rosters (who's on each), but not who hasn't responded or who is currently blocked. Priority: must-have
  > Socrates: Counter-argument considered: "not showing anything beyond the player's own status prevents players from self-organizing to fill gaps." Resolution: revised — corrected against the seed notes; players see the main list and waitlist rosters, just not the no-response/blocked breakdown that's organizer-only.

### Threshold & Cancellation
- FR-013: System automatically closes sign-ups 3 hours before the training and checks whether the main list has at least 10 people. Priority: must-have
  > Socrates: Counter-argument considered: "3 hours might be too late to find substitutes if the hall needs earlier payment confirmation." Resolution: kept; it stands as written — this timing is a deliberate choice from the seed notes (the roster moves until the last day).
- FR-014: System marks a training cancelled if fewer than 10 are signed up when sign-ups close; a cancelled training does not count toward anyone's absence window. Priority: must-have
  > Socrates: Counter-argument considered: "a cancelled training is a lost chance for a blocked player to 'sit out' their penalty." Resolution: kept; it stands as written.
- FR-015: System marks a training confirmed if 10 or more are signed up when sign-ups close. Priority: must-have
  > Socrates: Direct complement of FR-014 — no independent counter-argument to raise. Stands as written.
- FR-016: When a main-list player withdraws after confirmation, the system promotes the first waitlisted player to the main list, if the waitlist is non-empty. Priority: must-have
  > Socrates: Counter-argument considered: "auto-promotion without confirmation could land on someone no longer available." Resolution: kept; it stands as written.

### Team Generation
- FR-017: Organizer can generate two teams from the confirmed/present roster, balanced so team-size difference is at most one and the rating-sum difference stays within a set threshold. Priority: must-have
  > Socrates: Counter-argument considered: "a rigid threshold could reject workable splits since ratings are set casually, not measured." Resolution: kept; it stands as written.
- FR-018: Team generation prioritizes giving each team a player with the setter position (primary or secondary); if too few setters exist, the system assigns a fallback setter by highest rating within that team and marks them as a substitute. Priority: must-have
  > Socrates: Counter-argument considered: "forcing the highest-rated player into an unfamiliar substitute-setter role weekly could annoy them." Resolution: kept; it stands as written.
- FR-019: If a withdrawal happens after teams are generated, the replacement from the waitlist takes the vacated slot directly in the same team, without regenerating both teams — except when the departing player was that team's only setter, in which case the system reassigns a substitute setter within that same team. Priority: must-have
  > Socrates: Counter-argument considered: "no recalculation could compound into a very unbalanced team over repeated swaps." Resolution: kept; it stands as written — stability of a roster players have already seen deliberately outweighs perfect balance.
- FR-020: System refuses to generate teams only when the rating-difference threshold can't be met, and states by how much it's exceeded. Priority: must-have
  > Socrates: Counter-argument considered: "a hard refusal with no override could push the organizer back to manual splitting anyway." Resolution: kept; it stands as written.

### Attendance & Counters
- FR-021: Organizer can mark attendance for each player after a training. Priority: must-have
  > Socrates: Counter-argument considered: "a manual step the organizer could skip breaks the whole lockout mechanism." Resolution: kept; it stands as written — already captured as a Guardrail.
- FR-022: System updates each main-list player's absence counter from marked attendance; 2 no-shows within the trailing 8 completed trainings blocks the next sign-up, and the counter resets after the player sits out one training. Priority: must-have
  > Socrates: Counter-argument considered: "a group-level window (not per-player participation) could feel arbitrary for a new/returning player." Resolution: kept; it stands as written — deliberate choice from the seed notes.
- FR-023: A late withdrawal (after sign-ups close) counts toward the absence counter the same as a no-show; an early withdrawal (before close) is free. Priority: must-have
  > Socrates: Counter-argument considered: "treats an honest late notice the same as a silent no-show." Resolution: kept; it stands as written — confirmed by the user (a player unsure of availability should join the waitlist, not the main list).
- FR-024: A waitlisted player never accrues an absence counter; their counter starts only once they're promoted to the main list. Priority: must-have
  > Socrates: Direct consequence of the fairness reasoning already established (no guaranteed spot, no counter) — no independent counter-argument to raise. Stands as written.

## Business Logic

Based on sign-up and attendance history, the application decides on its own who has the right to claim a spot, whether a training happens, and how the players split into balanced teams.

The rule consumes: a player's sign-up order relative to the 12-spot main list; the timing of any sign-up or withdrawal relative to the 3-hour close; each player's attendance record over the trailing 8 completed trainings; each player's self-declared primary/secondary position; and an organizer-set rating per player.

The rule outputs: for a sign-up, a main-list or waitlist placement, or a block with a stated reason; for the training as a whole, a confirmed or cancelled status decided automatically at the close time; for team generation, two teams whose sizes differ by at most one and whose rating sums stay within a threshold, each with a real or substitute setter.

The organizer encounters this as a screen showing the confirm/cancel outcome and full roster breakdown instead of counting chat replies, and a one-click team split that keeps working through last-minute withdrawals. A player encounters it as their own placement on sign-up, and, if blocked, the stated reason instead of a silent inability to sign up.

## Non-Functional Requirements

- The sign-up screen is fully usable on a phone browser — players reach it from a link shared on WhatsApp, on their phones, not a desktop.
- A player sees confirmation of their sign-up or withdrawal within roughly a second, so a near-full main list doesn't leave them wondering whether they got the last spot.

## Non-Goals

- **No WhatsApp integration** — the event link is pasted into the group chat manually; the app never reads or writes WhatsApp messages.
- **No automatic rating recalculation after a match** — ratings are set manually by the organizer.
- **No individual stats or match-history** — no per-player statistics or history of results.
- **No payments, fines, or hall-fee settlement** — financial handling stays outside the app.
- **No push/email/SMS notifications** about cancellations or anything else.
- **No organizer override to lift a lockout** — the rule is fully automatic, with no manual unblock.
- **No automatic modification of a player's profile by the system** — a substitute-setter assignment is recorded in that training's history only, never written back as a permanent profile position (to avoid the rule feeding itself over time).
- **No support for multiple training groups, roles beyond organizer/player, or group invitations** — players self-register into the single group.
- **No OAuth login** — email + password only.
- **No mobile app** — phone-usable web only.

## User Stories

### US-01: Player signs up for a training

- **Given** a logged-in player who is not currently blocked, viewing an open training via its public link
- **When** they sign up
- **Then** they land on the main list if fewer than 12 are already signed up, otherwise on the waitlist, and they see which one they're on

#### Acceptance Criteria
- A blocked player attempting to sign up sees the block reason instead of a sign-up option
- Sign-up order is first-come, first-served
- Players see the main list and waitlist rosters, but not the no-response/blocked breakdown that only the organizer sees

### US-02: Sign-ups close and the training is confirmed or cancelled

- **Given** a training 3 hours from its start time
- **When** the sign-up window closes automatically
- **Then** the system marks the training cancelled if fewer than 10 people are on the main list, or confirmed if 10 or more are

#### Acceptance Criteria
- A cancelled training does not count toward any player's 8-training absence window
- The organizer sees the confirm/cancel outcome on an app screen without needing to count responses manually
- No new sign-ups are accepted once the window closes

## Quality cross-check

Ran 2026-09-15 — all elements present, no gaps:

- Access Control: present
- Business Logic: present (one-sentence rule)
- Project artifacts: present
- Timeline-cost acknowledgment: present (5-week MVP, sustained-effort cost accepted)
- Non-Goals: present (10 entries)
- Preserved behavior: n/a (greenfield)
