import { LogIn, Lock, Mail } from "lucide-react";
import SignInForm from "@/components/auth/SignInForm";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Rendered statically by src/pages/dev/kitchen-sink.astro. Lives in React because Astro-side JSX
// passed as a prop (e.g. `icon={<Lock />}`) is not a React element. Only one full form is rendered:
// SignInForm and SignUpForm share input ids, which would cross-wire labels on this page.
const noop = () => undefined;

export function AuthKitchenSink() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Default: sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Field states</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            id="ks-hint"
            label="With hint"
            type="password"
            value="abc"
            onChange={noop}
            hint="3 more characters needed"
            icon={<Lock className="size-4" />}
          />
          <FormField
            id="ks-error"
            label="With error"
            value="not-an-email"
            onChange={noop}
            error="Enter a valid email address"
            icon={<Mail className="size-4" />}
          />
          <FormField
            id="ks-toggle"
            label="With toggle"
            type="password"
            value="secret"
            onChange={noop}
            icon={<Lock className="size-4" />}
            endContent={<PasswordToggle visible={false} onToggle={noop} />}
          />
          <div className="grid gap-2">
            <Label htmlFor="ks-disabled">Disabled</Label>
            <Input id="ks-disabled" disabled defaultValue="read only" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Error: server</CardTitle>
        </CardHeader>
        <CardContent>
          <ServerError message="Invalid login credentials" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit: default / loading + disabled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SubmitButton pending={false} pendingText="Signing in..." icon={<LogIn className="size-4" />}>
            Sign in
          </SubmitButton>
          <SubmitButton pending={true} pendingText="Signing in..." icon={<LogIn className="size-4" />}>
            Sign in
          </SubmitButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confirm email (live page)</CardTitle>
        </CardHeader>
        <CardContent>
          <iframe title="Confirm email page" src="/auth/confirm-email" className="h-80 w-full rounded-md border" />
        </CardContent>
      </Card>
    </div>
  );
}
