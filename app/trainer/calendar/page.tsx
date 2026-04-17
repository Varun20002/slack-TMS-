import { WebinarCalendar } from "@/components/shared/webinar-calendar";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerCalendarPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("id, name").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return null;

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
    <WebinarCalendar
      events={events}
      title="My Webinar Calendar"
      description="Only webinars assigned to you are shown here automatically."
    />
  );
}
