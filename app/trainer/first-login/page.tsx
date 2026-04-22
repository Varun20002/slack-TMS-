import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainerFirstLoginForm } from "@/components/auth/trainer-first-login-form";
import { requireRole } from "@/lib/auth";

export default async function TrainerFirstLoginPage() {
  await requireRole("trainer");

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Set your new password</CardTitle>
          <CardDescription>
            You signed in using temporary credentials. Set a new password to continue to your trainer workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrainerFirstLoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
