import React, { useEffect, useState } from "react";
import { CircleAlert, Save, User } from "lucide-react";
import { FormField } from "@/components/form/FormField";
import { ServerError } from "@/components/form/ServerError";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  NICKNAME_MAX,
  PLAYER_POSITIONS,
  POSITION_LABELS,
  profileErrorMessage,
  validateNickname,
  validatePositions,
  type PlayerPosition,
} from "@/lib/profiles";

interface Props {
  initialNickname: string;
  initialPrimary?: PlayerPosition | null;
  initialSecondary?: PlayerPosition | null;
  serverError?: string | null;
}

export default function ProfileForm({
  initialNickname,
  initialPrimary = null,
  initialSecondary = null,
  serverError,
}: Props) {
  const [nickname, setNickname] = useState(initialNickname);
  const [primary, setPrimary] = useState<string>(initialPrimary ?? "");
  const [secondary, setSecondary] = useState<string>(initialSecondary ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [positionError, setPositionError] = useState<string | undefined>(undefined);

  // Back from the next page can restore this one from bfcache with the button still pending.
  useEffect(() => {
    function resetOnRestore(e: PageTransitionEvent) {
      if (e.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", resetOnRestore);
    return () => {
      window.removeEventListener("pageshow", resetOnRestore);
    };
  }, []);

  function focusField(form: HTMLFormElement, name: string) {
    // Focus after React commits aria-invalid + the error text, so screen readers announce both.
    setTimeout(() => {
      (form.elements.namedItem(name) as HTMLElement | null)?.focus();
    }, 0);
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const nick = validateNickname(nickname);
    if (!nick.ok) {
      e.preventDefault();
      setError(profileErrorMessage(nick.code) ?? undefined);
      focusField(form, "nickname");
      return;
    }
    const positions = validatePositions({ primary, secondary });
    if (!positions.ok) {
      e.preventDefault();
      setPositionError(profileErrorMessage(positions.code) ?? undefined);
      focusField(form, positions.code === "invalid_position" ? "primary_position" : "secondary_position");
      return;
    }
    // Native POST continues; inputs stay enabled so their values are submitted.
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/profile" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <ServerError message={serverError} />
      <FormField
        id="nickname"
        label="Name"
        value={nickname}
        onChange={(value) => {
          setNickname(value);
          if (error) setError(undefined);
        }}
        placeholder="How the group knows you"
        error={error}
        hint={`Shown on the sign-up lists. At most ${NICKNAME_MAX} characters.`}
        icon={<User className="size-4" />}
      />

      <div className="grid gap-2">
        <Label htmlFor="primary_position">Primary position</Label>
        <Select
          id="primary_position"
          name="primary_position"
          value={primary}
          onChange={(e) => {
            const next = e.target.value;
            setPrimary(next);
            // A secondary equal to the new primary is no longer valid; drop it.
            if (next && next === secondary) setSecondary("");
            if (positionError) setPositionError(undefined);
          }}
        >
          <option value="">No position</option>
          {PLAYER_POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {POSITION_LABELS[pos]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="secondary_position">Secondary position</Label>
        <Select
          id="secondary_position"
          name="secondary_position"
          value={secondary}
          aria-invalid={positionError ? true : undefined}
          aria-describedby={positionError ? "positions-error" : undefined}
          onChange={(e) => {
            setSecondary(e.target.value);
            if (positionError) setPositionError(undefined);
          }}
        >
          <option value="">No position</option>
          {PLAYER_POSITIONS.filter((pos) => pos !== primary).map((pos) => (
            <option key={pos} value={pos}>
              {POSITION_LABELS[pos]}
            </option>
          ))}
        </Select>
        {positionError ? (
          <p id="positions-error" className="text-destructive flex items-center gap-1 text-xs">
            <CircleAlert className="size-3" />
            {positionError}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">Optional. Pick a primary position first.</p>
        )}
      </div>

      <SubmitButton pending={submitting} pendingText="Saving…" icon={<Save />}>
        Save
      </SubmitButton>
    </form>
  );
}
