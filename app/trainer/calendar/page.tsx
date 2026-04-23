import { WebinarCalendar } from "@/components/shared/webinar-calendar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerCalendarPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("id, name").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return null;
  const admin = createAdminClient() as any;
  const { data: calendarConnection } = await admin
    .from("trainer_google_connections")
    .select("google_email, last_error")
    .eq("trainer_id", trainer.id)
    .maybeSingle();
  const isConnected = Boolean(calendarConnection);

  let webinars: any[] = [];
  const withDuration = await supabase
    .from("webinars")
    .select("id, title, webinar_timing, duration_minutes, status, google_calendar_embed_url")
    .eq("trainer_id", trainer.id)
    .order("webinar_timing", { ascending: true });

  if (withDuration.error && (withDuration.error.code === "42703" || withDuration.error.message?.includes("duration_minutes"))) {
    const fallback = await supabase
      .from("webinars")
      .select("id, title, webinar_timing, status, google_calendar_embed_url")
      .eq("trainer_id", trainer.id)
      .order("webinar_timing", { ascending: true });
    webinars = fallback.data ?? [];
  } else {
    webinars = withDuration.data ?? [];
  }

  const events = webinars.map((item) => {
    const start = new Date(item.webinar_timing);
    const end = new Date(start.getTime() + (item.duration_minutes ?? 60) * 60 * 1000);
    return {
      id: item.id,
      title: item.title,
      start: start.toISOString(),
      end: end.toISOString(),
      status: item.status ?? "upcoming",
      trainerName: trainer.name,
      googleLink: item.google_calendar_embed_url
    };
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Connect once to keep your assigned webinars synced automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Status:{" "}
            <span className={isConnected ? "font-medium text-emerald-600" : "font-medium text-amber-600"}>
              {isConnected ? "Connected" : "Not connected"}
            </span>
          </p>
          {calendarConnection?.google_email ? <p className="text-sm text-muted-foreground">Connected account: {calendarConnection.google_email}</p> : null}
          {calendarConnection?.last_error ? <p className="text-sm text-destructive">Last sync issue: {calendarConnection.last_error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/api/google/calendar/connect">{isConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <WebinarCalendar events={events} title="My Webinar Calendar" description="Only webinars assigned to you are shown here automatically." />
    </div>
  );
}
