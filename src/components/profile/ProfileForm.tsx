import React, { useEffect, useState } from "react";
import { Save, User } from "lucide-react";
import { FormField } from "@/components/form/FormField";
import { ServerError } from "@/components/form/ServerError";
import { SubmitButton } from "@/components/form/SubmitButton";
import { NICKNAME_MAX, profileErrorMessage, validateNickname } from "@/lib/profiles";

interface Props {
  initialNickname: string;
  serverError?: string | null;
}

export default function ProfileForm({ initialNickname, serverError }: Props) {
  const [nickname, setNickname] = useState(initialNickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

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

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = validateNickname(nickname);
    if (!result.ok) {
      e.preventDefault();
      setError(profileErrorMessage(result.code) ?? undefined);
      // Focus after React commits aria-invalid + the error text, so screen readers announce both.
      const form = e.currentTarget;
      setTimeout(() => {
        (form.elements.namedItem("nickname") as HTMLInputElement | null)?.focus();
      }, 0);
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
      <SubmitButton pending={submitting} pendingText="Saving…" icon={<Save />}>
        Save
      </SubmitButton>
    </form>
  );
}
