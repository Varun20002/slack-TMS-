import { WebinarCalendar } from "@/components/shared/webinar-calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <WebinarCalendar events={events} title="Admin Webinar Calendar" description="All scheduled webinars appear here automatically." />

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar Event Actions</CardTitle>
          <CardDescription>Each webinar now generates a Google Calendar event link from start time and duration. Click to open and save in your calendar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {webinars.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(item.webinar_timing).toLocaleString()} • {item.duration_minutes ?? 60} mins
              </p>
              {item.google_calendar_embed_url ? (
                <a href={item.google_calendar_embed_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary underline">
                  Open Google Calendar Event
                </a>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No calendar link available.</p>
              )}
            </div>
          ))}
          {!webinars.length ? <p className="text-sm text-muted-foreground">No webinars scheduled yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
