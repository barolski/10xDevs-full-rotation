import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/i18n";
import { attendanceErrorMessage, type AttendanceStatus } from "@/lib/attendance";

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  lang: Lang;
  trainingId: string;
  userId: string;
  // The player's current mark, or null when unmarked.
  initialStatus?: AttendanceStatus | null;
  // Names the control for screen readers (the row shows the nickname visually).
  playerLabel?: string;
  // Dev/kitchen-sink only: force a transient save state that can't be produced statically.
  seedStatus?: SaveState;
  seedMessage?: string;
  // Called after a successful save with the new mark and the player's rating as the server now holds
  // it (null once absent), so a parent can keep the rating cell in step without a reload.
  onSaved?: (status: AttendanceStatus, rating: number | null) => void;
}

// Per-player present/absent toggle for the organizer attendance UI (S-07). POSTs to the attendance
// route on change; mirrors TrainingRatingInput's fetch + status pattern.
export default function AttendanceToggle({
  lang,
  trainingId,
  userId,
  initialStatus = null,
  playerLabel,
  seedStatus = "idle",
  seedMessage,
  onSaved,
}: Props) {
  const d = t(lang).organizer.attendance;
  const [status, setStatus] = useState<AttendanceStatus | null>(initialStatus);
  const [save, setSave] = useState<SaveState>(seedStatus);
  const [message, setMessage] = useState<string | null>(seedMessage ?? null);

  async function mark(next: AttendanceStatus) {
    if (next === status) return;
    setSave("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api/organizer/trainings/${trainingId}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, status: next }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const code = data && typeof data === "object" ? (data as Record<string, unknown>).error : null;
        setSave("error");
        setMessage(attendanceErrorMessage(typeof code === "string" ? code : null, lang));
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      const rating = data && typeof data === "object" ? (data as Record<string, unknown>).rating : null;
      setStatus(next);
      setSave("saved");
      onSaved?.(next, typeof rating === "number" ? rating : null);
    } catch {
      setSave("error");
      setMessage(attendanceErrorMessage("save_failed", lang));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div
          className="flex gap-0.5 rounded-md border p-0.5"
          role="group"
          aria-label={playerLabel ? d.group(playerLabel) : d.groupFallback}
        >
          <Button
            type="button"
            size="sm"
            variant={status === "present" ? "default" : "ghost"}
            className="h-7 px-2"
            aria-pressed={status === "present"}
            onClick={() => void mark("present")}
          >
            {d.present}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === "absent" ? "destructive" : "ghost"}
            className="h-7 px-2"
            aria-pressed={status === "absent"}
            onClick={() => void mark("absent")}
          >
            {d.absent}
          </Button>
        </div>

        <span className="flex w-4 justify-center" aria-hidden={save === "idle"}>
          {save === "saving" && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
          {save === "saved" && <Check className="text-success size-4" />}
        </span>
      </div>

      {save === "error" && message && (
        <span role="alert" className="text-destructive max-w-52 text-right text-xs">
          {message}
        </span>
      )}
    </div>
  );
}
