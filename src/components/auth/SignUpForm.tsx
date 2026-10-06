import React, { useEffect, useState } from "react";
import { FormField } from "@/components/form/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/form/SubmitButton";
import { ServerError } from "@/components/form/ServerError";
import { t, type Lang } from "@/i18n";
import { authErrorMessage } from "@/lib/auth-errors";

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  lang: Lang;
  // The error *code* from the redirect (e.g. "user_already_exists"); shown as a message in `lang`.
  serverError?: string | null;
  next?: string | null;
}

export default function SignUpForm({ lang, serverError, next: nextPath }: Props) {
  const d = t(lang).auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = d.validation.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = d.validation.emailInvalid;
    }

    if (!password) {
      next.password = d.validation.passwordRequired;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = d.validation.passwordTooShort(MIN_PASSWORD_LENGTH);
    }

    if (!confirmPassword) {
      next.confirmPassword = d.validation.confirmRequired;
    } else if (password !== confirmPassword) {
      next.confirmPassword = d.validation.passwordsDiffer;
    }

    setErrors(next);
    return next;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
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
    const firstInvalid = Object.keys(validate())[0];
    if (firstInvalid) {
      e.preventDefault();
      // Focus after React commits aria-invalid + the error text, so screen readers announce both.
      const form = e.currentTarget;
      setTimeout(() => {
        (form.elements.namedItem(firstInvalid) as HTMLInputElement | null)?.focus();
      }, 0);
      return;
    }
    // Native POST continues; inputs stay enabled so their values are submitted.
    setSubmitting(true);
  }

  const remaining = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && remaining > 0 ? d.validation.passwordMoreNeeded(remaining) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {nextPath && <input type="hidden" name="next" value={nextPath} />}
      <FormField
        id="email"
        type="email"
        label={d.fields.email}
        inlineLabel
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        error={errors.email}
      />

      <FormField
        id="password"
        label={d.fields.password}
        inlineLabel
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        error={errors.password}
        hint={passwordHint}
        endContent={
          <PasswordToggle
            lang={lang}
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={d.fields.confirmPassword}
        inlineLabel
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        error={errors.confirmPassword}
        endContent={
          <PasswordToggle
            lang={lang}
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={authErrorMessage(serverError, lang)} />

      <div className="pt-2">
        <SubmitButton pending={submitting} pendingText={d.signUp.pending}>
          {d.signUp.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
