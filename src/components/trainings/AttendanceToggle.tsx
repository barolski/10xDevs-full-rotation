import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attendanceErrorMessage, type AttendanceStatus } from "@/lib/attendance";

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  trainingId: string;
  userId: string;
  // The player's current mark, or null when unmarked.
  initialStatus?: AttendanceStatus | null;
  // Names the control for screen readers (the row shows the nickname visually).
  playerLabel?: string;
  // Dev/kitchen-sink only: force a transient save state that can't be produced statically.
  seedStatus?: SaveState;
  seedMessage?: string;
}

// Per-player present/absent toggle for the organizer attendance UI (S-07). POSTs to the attendance
// route on change; mirrors TrainingRatingInput's fetch + status pattern.
export default function AttendanceToggle({
  trainingId,
  userId,
  initialStatus = null,
  playerLabel,
  seedStatus = "idle",
  seedMessage,
}: Props) {
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
        setMessage(attendanceErrorMessage(typeof code === "string" ? code : null));
        return;
      }
      setStatus(next);
      setSave("saved");
    } catch {
      setSave("error");
      setMessage(attendanceErrorMessage("save_failed"));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div
          className="flex gap-0.5 rounded-md border p-0.5"
          role="group"
          aria-label={playerLabel ? `Attendance for ${playerLabel}` : "Attendance"}
        >
          <Button
            type="button"
            size="sm"
            variant={status === "present" ? "default" : "ghost"}
            className="h-7 px-2"
            aria-pressed={status === "present"}
            onClick={() => void mark("present")}
          >
            Present
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === "absent" ? "destructive" : "ghost"}
            className="h-7 px-2"
            aria-pressed={status === "absent"}
            onClick={() => void mark("absent")}
          >
            Absent
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
