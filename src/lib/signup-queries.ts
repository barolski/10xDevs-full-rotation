import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { PROFILE_COLUMNS, type Profile } from "@/lib/profiles";
import type { SignupEntry } from "@/lib/signups";

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

export interface ProfileLoad {
  profile: Profile | null;
  failed: boolean;
}

export async function loadProfile(userId: string, headers: Headers, cookies: AstroCookies): Promise<ProfileLoad> {
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
