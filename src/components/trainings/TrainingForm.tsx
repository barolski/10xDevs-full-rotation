import React, { useEffect, useState } from "react";
import { CalendarClock, MapPin, StickyNote, Type, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import {
  SIGNUP_CLOSE_HOURS,
  trainingErrorMessage,
  validateTrainingInput,
  type TrainingField,
  type TrainingInput,
} from "@/lib/trainings";

interface Props {
  action: string;
  initial?: TrainingInput;
  serverError?: string | null;
  submitLabel: string;
  pendingText: string;
}

const EMPTY: TrainingInput = { title: "", startsAtLocal: "", location: "", note: "" };

export default function TrainingForm({ action, initial = EMPTY, serverError, submitLabel, pendingText }: Props) {
  const [values, setValues] = useState<TrainingInput>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<TrainingField, string>>>({});

  function update(field: keyof TrainingInput, errorKey: TrainingField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[errorKey]) setErrors((prev) => ({ ...prev, [errorKey]: undefined }));
  }

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
    const result = validateTrainingInput(values, new Date());
    if (!result.ok) {
      e.preventDefault();
      const messages: Partial<Record<TrainingField, string>> = {};
      for (const [field, code] of Object.entries(result.errors)) {
        messages[field as TrainingField] = trainingErrorMessage(code) ?? undefined;
      }
      setErrors(messages);
      // Focus after React commits aria-invalid + the error text, so screen readers announce both.
      const firstInvalid = Object.keys(result.errors)[0];
      const form = e.currentTarget;
      setTimeout(() => {
        (form.elements.namedItem(firstInvalid) as HTMLInputElement | null)?.focus();
      }, 0);
      return;
    }
    // Native POST continues; inputs stay enabled so their values are submitted.
    setSubmitting(true);
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="title"
        label="Title"
        value={values.title}
        onChange={(v) => {
          update("title", "title", v);
        }}
        placeholder="e.g. Intermediate group"
        error={errors.title}
        icon={<Type className="size-4" />}
      />

      <FormField
        id="starts_at"
        label="Start"
        type="datetime-local"
        value={values.startsAtLocal}
        onChange={(v) => {
          update("startsAtLocal", "starts_at", v);
        }}
        error={errors.starts_at}
        hint={`Time in Poland (Europe/Warsaw). Sign-ups close ${SIGNUP_CLOSE_HOURS} hours before.`}
        icon={<CalendarClock className="size-4" />}
      />

      <FormField
        id="location"
        label="Location"
        value={values.location}
        onChange={(v) => {
          update("location", "location", v);
        }}
        placeholder="e.g. School sports hall, ul. Sportowa 1"
        error={errors.location}
        icon={<MapPin className="size-4" />}
      />

      <FormField
        id="note"
        label="Note (optional)"
        value={values.note}
        onChange={(v) => {
          update("note", "note", v);
        }}
        placeholder="e.g. Entrance from the pitch side"
        error={errors.note}
        icon={<StickyNote className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText={pendingText} icon={<Save className="size-4" />}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
