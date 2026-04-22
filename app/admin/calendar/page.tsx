import { WebinarCalendar } from "@/components/shared/webinar-calendar";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCalendarPage() {
  const supabase = (await createClient()) as any;
  let webinars: any[] = [];
  const withDuration = await supabase
    .from("webinars")
    .select("id, title, webinar_timing, duration_minutes, status, google_calendar_embed_url, trainers(name)")
    .order("webinar_timing", { ascending: true });

  if (withDuration.error && (withDuration.error.code === "42703" || withDuration.error.message?.includes("duration_minutes"))) {
    const fallback = await supabase
      .from("webinars")
      .select("id, title, webinar_timing, status, google_calendar_embed_url, trainers(name)")
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
      trainerName: item.trainers?.name ?? null,
      googleLink: item.google_calendar_embed_url
    };
  });

  return (
    <WebinarCalendar
      events={events}
      title="Admin Webinar Calendar"
      description="All scheduled webinars appear here automatically."
      interactiveDateDetails
    />
  );
}
