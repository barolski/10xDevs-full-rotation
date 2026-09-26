import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  icon: ReactNode;
  endContent?: ReactNode;
  // Renders a Textarea (icon pinned to the first line) instead of an Input; `type` is ignored.
  multiline?: boolean;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
  multiline = false,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const controlProps = {
    id,
    name: name ?? id,
    value,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: cn("pl-9", endContent && "pr-10"),
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          className={cn(
            "text-muted-foreground pointer-events-none absolute left-3 size-4",
            multiline ? "top-2.5" : "top-1/2 -translate-y-1/2",
          )}
        >
          {icon}
        </span>
        {multiline ? (
          <Textarea
            {...controlProps}
            rows={3}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        ) : (
          <Input
            {...controlProps}
            type={type}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        )}
        {endContent}
      </div>
      {error ? (
        <p id={errorId} className="text-destructive flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
