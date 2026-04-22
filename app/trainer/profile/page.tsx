import Image from "next/image";
import { User } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerProfilePage() {
  const profile = await requireRole("trainer");
  const supabase = (await createClient()) as any;
  if (new Date(profile.updated_at).getTime() === new Date(profile.created_at).getTime()) {
    await supabase.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", profile.id);
  }
  const { data: trainer } = await supabase.from("trainers").select("*").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return null;
  const admin = createAdminClient() as any;
  const { data: calendarConnection } = await admin
    .from("trainer_google_connections")
    .select("google_email, updated_at, last_error")
    .eq("trainer_id", trainer.id)
    .maybeSingle();
  const isConnected = Boolean(calendarConnection);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar Sync</CardTitle>
          <CardDescription>Connect once so webinars assigned by admin appear automatically in your calendar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Status:{" "}
            <span className={isConnected ? "font-medium text-emerald-600" : "font-medium text-amber-600"}>
              {isConnected ? "Connected" : "Not connected"}
            </span>
          </p>
          {calendarConnection?.google_email ? (
            <p className="text-sm text-muted-foreground">Connected account: {calendarConnection.google_email}</p>
          ) : null}
          {calendarConnection?.last_error ? (
            <p className="text-sm text-destructive">Last sync issue: {calendarConnection.last_error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/api/google/calendar/connect">{isConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}</Link>
            </Button>
            {isConnected ? (
              <form action={disconnectGoogleCalendarAction}>
                <Button type="submit" variant="outline">
                  Disconnect
                </Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>All onboarding fields associated with your trainer record.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium">Profile Photo</p>
            {trainer.profile_image_url ? (
              <Image
                src={trainer.profile_image_url}
                alt={`${profile.full_name} profile`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-full border object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-muted/30">
                <User className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Detail label="Name" value={trainer.name} />
            <Detail label="Experience (years)" value={trainer.experience} />
            <Detail label="Investing / Trading Persona" value={trainer.investing_trading_persona} />
            <Detail label="Strengths" value={trainer.strengths} />
            <Detail label="Product Categories" value={trainer.product_categories?.join(", ")} />
            <Detail label="Nature of Business" value={trainer.nature_of_business} />
            <Detail label="Phone Number" value={trainer.phone_number} />
            <Detail label="Email" value={trainer.email} />
            <Detail label="Languages Spoken" value={trainer.languages_spoken} />
            <Detail label="Base City" value={trainer.base_city} />
            <Detail label="Credentials / Claim to Fame" value={trainer.credentials_or_claim_to_fame} className="md:col-span-2" />
            <Detail label="Certifications" value={trainer.certifications} />
            <Detail
              label="Social Media Handles"
              value={
                trainer.social_media_handles && Object.keys(trainer.social_media_handles).length
                  ? JSON.stringify(trainer.social_media_handles)
                  : null
              }
            />
            <Detail label="Average Rating" value={Number(trainer.average_rating ?? 0).toFixed(2)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function disconnectGoogleCalendarAction() {
  "use server";
  const profile = await requireRole("trainer");
  const admin = createAdminClient() as any;
  const { data: trainer } = await admin.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
  if (trainer) {
    await admin.from("trainer_google_connections").delete().eq("trainer_id", trainer.id);
  }
  redirect("/trainer/profile?calendar=disconnected");
}

function Detail({
  label,
  value,
  className
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 rounded-lg border bg-muted/20 px-3 py-2 text-sm">{value && String(value).trim() ? value : "-"}</p>
    </div>
  );
}
