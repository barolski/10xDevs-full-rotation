import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/i18n";

interface PasswordToggleProps {
  lang: Lang;
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ lang, visible, onToggle }: PasswordToggleProps) {
  const labels = t(lang).auth.passwordToggle;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2"
      aria-label={visible ? labels.hide : labels.show}
    >
      {visible ? <EyeOff /> : <Eye />}
    </Button>
  );
}
