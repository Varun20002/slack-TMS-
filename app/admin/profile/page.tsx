import { ProfileForm } from "@/components/layout/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function AdminProfilePage() {
  const profile = await requireRole("admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Profile</CardTitle>
        <CardDescription>Manage your contact details used across the admin workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm defaults={{ full_name: profile.full_name, phone: profile.phone ?? "", email: profile.email }} />
      </CardContent>
    </Card>
  );
}
