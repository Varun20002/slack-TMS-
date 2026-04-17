import { ProfileForm } from "@/components/layout/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function TrainerProfilePage() {
  const profile = await requireRole("trainer");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trainer Profile</CardTitle>
        <CardDescription>You can edit phone and display email here. Auth email updates should be handled in Supabase Auth settings if required.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm defaults={{ full_name: profile.full_name, phone: profile.phone ?? "", email: profile.email }} />
      </CardContent>
    </Card>
  );
}
