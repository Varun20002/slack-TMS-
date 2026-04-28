import { AvailabilityManager } from "@/components/trainer/availability-manager";
import { WebinarCalendar } from "@/components/shared/webinar-calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerAvailabilityPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("id, name").eq("profile_id", profile.id).maybeSingle();
  const { data: slots } = trainer
    ? await supabase.from("trainer_availability").select("*").eq("trainer_id", trainer.id).order("day_of_week")
    : { data: [] };

  let webinars: any[] = [];
  if (trainer) {
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
      trainerName: trainer?.name ?? null,
      googleLink: item.google_calendar_embed_url
    };
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Availability</CardTitle>
          <CardDescription>Add weekly slots when you can host webinars. Overlapping slots are blocked automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityManager slots={slots ?? []} />
        </CardContent>
      </Card>
      <WebinarCalendar
        events={events}
        title="My Webinar Calendar"
        description="Webinars assigned to you appear here automatically."
        detailHrefBase="/trainer/webinars"
      />
    </div>
  );
}
