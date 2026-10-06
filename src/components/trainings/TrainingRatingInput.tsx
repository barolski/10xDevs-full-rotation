import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { t, type Lang } from "@/i18n";
import { RATING_DEFAULT, RATING_MAX, RATING_MIN, RATING_STEP, ratingErrorMessage, validateRating } from "@/lib/ratings";

type Status = "idle" | "saving" | "saved" | "error";

interface Props {
  lang: Lang;
  trainingId: string;
  userId: string;
  // The player's current rating. The organizer page guarantees a default-5 row for every main-list
  // player, so on the real page this is always a number; null only appears in the kitchen sink.
  initialRating?: number | null;
  // Names the control for screen readers (the row shows the nickname visually).
  playerLabel?: string;
  // Dev/kitchen-sink only: force a transient status that can't be produced statically.
  seedStatus?: Status;
  seedMessage?: string;
  // An absent player is not rated: the input stays visible but cannot be edited.
  disabled?: boolean;
}

export default function TrainingRatingInput({
  lang,
  trainingId,
  userId,
  initialRating = null,
  playerLabel,
  seedStatus = "idle",
  seedMessage,
  disabled = false,
}: Props) {
  const d = t(lang).organizer.ratings;
  // A disabled (absent) input shows an empty placeholder, never a number that is not saved anywhere.
  const [value, setValue] = useState<string>(disabled ? "" : String(initialRating ?? RATING_DEFAULT));
  const [savedRating, setSavedRating] = useState<number | null>(initialRating);
  const [status, setStatus] = useState<Status>(seedStatus);
  const [message, setMessage] = useState<string | null>(seedMessage ?? null);

  // Save on edit (blur / Enter). There is no clear action: every played main-list player keeps a
  // rating row, so a rating is always adjusted, never removed.
  async function commit() {
    // Nothing changed since the last save: don't churn the DB or flash "saved".
    if (savedRating !== null && Number(value) === savedRating) return;
    const result = validateRating(value);
    if (!result.ok) {
      setStatus("error");
      setMessage(ratingErrorMessage(result.code, lang));
      return;
    }
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api/organizer/trainings/${trainingId}/ratings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, rating: result.value }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const code = data && typeof data === "object" ? (data as Record<string, unknown>).error : null;
        setStatus("error");
        setMessage(ratingErrorMessage(typeof code === "string" ? code : null, lang));
        return;
      }
      setSavedRating(result.value);
      setStatus("saved");
    } catch {
      setStatus("error");
      setMessage(ratingErrorMessage("save_failed", lang));
    }
  }

  return (
    // Column so an error message sits BELOW the control instead of widening the table row.
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={RATING_MIN}
          max={RATING_MAX}
          step={RATING_STEP}
          value={value}
          disabled={disabled}
          placeholder="—"
          aria-label={playerLabel ? d.label(playerLabel) : d.labelFallback}
          aria-invalid={status === "error" ? true : undefined}
          className="h-8 w-20 text-sm"
          onChange={(e) => {
            setValue(e.target.value);
            if (status !== "idle") setStatus("idle");
            if (message) setMessage(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />

        <span className="flex w-4 justify-center" aria-hidden={status === "idle"}>
          {status === "saving" && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
          {status === "saved" && <Check className="text-success size-4" />}
        </span>
      </div>

      {status === "error" && message && (
        <span role="alert" className="text-destructive max-w-52 text-right text-xs">
          {message}
        </span>
      )}
    </div>
  );
}
