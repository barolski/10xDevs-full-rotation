import { useState } from "react";
import { Loader2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { teamsErrorMessage } from "@/lib/teams";

type Status = "idle" | "generating" | "error";

interface Props {
  trainingId: string;
  // Drives the confirm-before-overwrite prompt and the button label (Generate vs Regenerate).
  hasExistingTeams: boolean;
  // Dev/kitchen-sink only: force a transient status that can't be produced statically.
  seedStatus?: Status;
  seedMessage?: string;
}

// POSTs to the teams route and, on success, reloads so the server-rendered team display reflects
// the new split (the teams themselves are rendered server-side, not in this island). A refusal
// (FR-020) comes back as 409 with the exceedance and is shown inline.
export default function GenerateTeamsButton({ trainingId, hasExistingTeams, seedStatus = "idle", seedMessage }: Props) {
  const [status, setStatus] = useState<Status>(seedStatus);
  const [message, setMessage] = useState<string | null>(seedMessage ?? null);

  async function generate() {
    if (hasExistingTeams && !window.confirm("Regenerate teams? This replaces the current split.")) return;
    setStatus("generating");
    setMessage(null);
    try {
      const res = await fetch(`/api/organizer/trainings/${trainingId}/teams`, { method: "POST" });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const code = record && typeof record.error === "string" ? record.error : null;
        setStatus("error");
        setMessage(teamsErrorMessage(code));
        return;
      }
      window.location.reload();
    } catch {
      setStatus("error");
      setMessage(teamsErrorMessage("save_failed"));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={hasExistingTeams ? "outline" : "default"}
        size="sm"
        disabled={status === "generating"}
        onClick={() => void generate()}
      >
        {status === "generating" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Shuffle className="size-4" aria-hidden="true" />
        )}
        {hasExistingTeams ? "Regenerate" : "Generate teams"}
      </Button>

      {status === "error" && message && (
        <span role="alert" className="text-destructive max-w-64 text-right text-xs">
          {message}
        </span>
      )}
    </div>
  );
}
