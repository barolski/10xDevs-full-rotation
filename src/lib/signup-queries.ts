import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { PROFILE_COLUMNS, type Profile } from "@/lib/profiles";
import { RATING_DEFAULT } from "@/lib/ratings";
import type { SignupEntry } from "@/lib/signups";
import { rosterStatus, type RosterPoolEntry, type RosterStatus } from "@/lib/roster-status";
import { isUuid } from "@/lib/trainings";

// Server-only (reads secrets through createClient): keep it out of src/lib/signups.ts and
// src/lib/profiles.ts, which the islands bundle for the browser.

export interface RosterLoad {
  entries: SignupEntry[];
  // True when the lookup itself failed (no client, DB/network error), as opposed to "nobody signed up".
  failed: boolean;
}

// PostgREST embeds the nickname because signups.user_id references profiles.user_id.
const ROSTER_COLUMNS = "id, user_id, position, profiles!inner(nickname)";

interface RosterRow {
  id: string;
  user_id: string;
  position: number;
  profiles: { nickname: string };
}

export async function loadRoster(trainingId: string, headers: Headers, cookies: AstroCookies): Promise<RosterLoad> {
  const supabase = createClient(headers, cookies);
  if (!supabase) return { entries: [], failed: true };

  const { data, error } = await supabase
    .from("signups")
    .select(ROSTER_COLUMNS)
    .eq("training_id", trainingId)
    .eq("status", "active")
    .order("position")
    .overrideTypes<RosterRow[], { merge: false }>();

  if (error) return { entries: [], failed: true };

  const entries = data.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    position: row.position,
    nickname: row.profiles.nickname,
  }));
  return { entries, failed: false };
}

export interface TrainingRatingsLoad {
  // Keyed by user_id; a player with no row is absent and treated as RATING_DEFAULT by callers.
  ratings: Map<string, number>;
  failed: boolean;
}

// Loads a training's ratings, first guaranteeing a default-5 row for every main-list player, so a
// player who was on the main list of a played training always has a rating row (organizer's choice
// 2026-09-30). ON CONFLICT DO NOTHING (ignoreDuplicates) touches no existing row and needs only the
// INSERT grant, so it's safe under concurrent organizers and never overwrites a real rating. Only
// ever called from the organizer training page (ORGANIZER_ROUTES-gated) for a ratable training
// (canRateTraining); the page passes its current main-list user_ids. `numeric` can arrive as a
// string over PostgREST, so Number() normalises it.
export async function loadOrSeedTrainingRatings(
  trainingId: string,
  mainUserIds: string[],
  headers: Headers,
  cookies: AstroCookies,
): Promise<TrainingRatingsLoad> {
  if (!isUuid(trainingId)) return { ratings: new Map(), failed: false };
  const supabase = createClient(headers, cookies);
  if (!supabase) return { ratings: new Map(), failed: true };

  if (mainUserIds.length > 0) {
    const { error: seedError } = await supabase.from("training_ratings").upsert(
      mainUserIds.map((userId) => ({ training_id: trainingId, user_id: userId, rating: RATING_DEFAULT })),
      { onConflict: "training_id,user_id", ignoreDuplicates: true },
    );
    if (seedError) return { ratings: new Map(), failed: true };
  }

  const { data, error } = await supabase
    .from("training_ratings")
    .select("user_id, rating")
    .eq("training_id", trainingId)
    .overrideTypes<{ user_id: string; rating: number | string }[], { merge: false }>();

  if (error) return { ratings: new Map(), failed: true };
  return { ratings: new Map(data.map((row) => [row.user_id, Number(row.rating)])), failed: false };
}

// The player's own no-show lockout status for a training (S-07, FR-010), via the block_info RPC
// (which reads auth.uid()). Fail-OPEN: on any error treat the player as not blocked — the sign-up
// trigger is still the hard gate, so a transient read failure must not strand a legitimate player.
export interface BlockInfo {
  blocked: boolean;
  absences: number;
}

export async function loadBlockInfo(trainingId: string, headers: Headers, cookies: AstroCookies): Promise<BlockInfo> {
  if (!isUuid(trainingId)) return { blocked: false, absences: 0 };
  const supabase = createClient(headers, cookies);
  if (!supabase) return { blocked: false, absences: 0 };

  // block_info is a S-07 RPC the generated types don't know about, so treat the result as unknown
  // and narrow by hand (same shape as middleware.ts reads is_organizer()). A set-returning function
  // comes back as an array of rows.
  const result = await supabase.rpc("block_info", { p_training: trainingId });
  if (result.error) return { blocked: false, absences: 0 };
  const data: unknown = result.data;
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { blocked: false, absences: 0 };
  const rec = row as Record<string, unknown>;
  return { blocked: rec.blocked === true, absences: typeof rec.absences === "number" ? rec.absences : 0 };
}

export interface ProfileLoad {
  profile: Profile | null;
  failed: boolean;
}

// The failed-vs-absent copy, kept beside the loaders like unavailableTraining() in training-queries.ts,
// so a temporary failure never reads as "gone" and the two stories cannot drift between views.
export const ROSTER_UNAVAILABLE = "Could not load who's signed up. Please try again in a moment.";

export function unavailableProfile(failed: boolean) {
  return failed
    ? { status: 503, message: "Could not load your profile. Please try again in a moment." }
    : { status: 404, message: "Your profile is missing. Sign out and back in, then try again." };
}

// Takes `string | undefined` and guards like loadTraining: an empty id would reach PostgREST as
// `user_id=eq.` and come back as 22P02, i.e. a database error rather than "no such profile".
export async function loadProfile(
  userId: string | undefined,
  headers: Headers,
  cookies: AstroCookies,
): Promise<ProfileLoad> {
  if (!isUuid(userId)) return { profile: null, failed: false };
  const supabase = createClient(headers, cookies);
  if (!supabase) return { profile: null, failed: true };

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle()
    .overrideTypes<Profile, { merge: false }>();

  if (error) return { profile: null, failed: true };
  return { profile: data, failed: false };
}

export interface RosterStatusLoad {
  status: RosterStatus | null;
  // True when either read (the profile pool, the blocked set) failed. Partial buckets would misstate
  // who is blocked, so one failure fails the whole roster rather than rendering some lists.
  failed: boolean;
}

// The group is the whole profiles table: there is no membership table, and the PRD has exactly one
// group that players self-register into (Non-Goals: no multiple groups, no invitations). So every
// profile counts as a group member for the no-response bucket. The limit is a backstop against that
// assumption outliving the single-group model, not a page size — the group is ~20 accounts.
const ROSTER_POOL_LIMIT = 500;

// The organizer's full roster for one training (S-08, FR-011): every profile, the active sign-ups
// and the blocked set, composed by rosterStatus(). Organizer-only: the training_blocked_players RPC
// raises 42501 for anyone else, which lands here as a failed load, never as "nobody is blocked".
// `entries` is the caller's already-loaded active sign-ups (like loadOrSeedTrainingRatings taking
// mainUserIds): one sign-up read per request, so the header count and these buckets cannot disagree.
export async function loadRosterStatus(
  trainingId: string,
  entries: SignupEntry[],
  headers: Headers,
  cookies: AstroCookies,
): Promise<RosterStatusLoad> {
  if (!isUuid(trainingId)) return { status: null, failed: false };
  const supabase = createClient(headers, cookies);
  if (!supabase) return { status: null, failed: true };

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, nickname")
    .order("nickname")
    .limit(ROSTER_POOL_LIMIT)
    .overrideTypes<RosterPoolEntry[], { merge: false }>();
  if (profilesError) return { status: null, failed: true };

  // The RPC returns setof uuid, which PostgREST sends as a bare array of strings. The generated types
  // don't know the function, so the shape is checked by hand rather than trusted.
  // Same narrowing as loadBlockInfo: the generated types don't know this RPC, so its result is unknown.
  const result = await supabase.rpc("training_blocked_players", { p_training: trainingId });
  if (result.error) return { status: null, failed: true };

  const blocked: unknown = result.data;
  if (!Array.isArray(blocked) || blocked.some((id) => typeof id !== "string")) {
    return { status: null, failed: true };
  }

  return {
    status: rosterStatus(entries, profiles, new Set(blocked as string[])),
    failed: false,
  };
}
