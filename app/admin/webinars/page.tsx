import { WebinarForm } from "@/components/admin/webinar-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPercent } from "@/lib/utils";

export default async function AdminWebinarsPage() {
  const supabase = (await createClient()) as any;
  const now = new Date().toISOString();

  const [{ data: trainers }, { data: webinars }, { data: metrics }] = await Promise.all([
    supabase.from("trainers").select("id,name").order("name"),
    supabase.from("webinars").select("*, trainers(name)").order("webinar_timing"),
    supabase.from("webinar_metrics").select("*")
  ]);

  const upcoming = (webinars ?? []).filter((item) => item.webinar_timing >= now && item.status !== "cancelled");
  const past = (webinars ?? []).filter((item) => item.webinar_timing < now || item.status === "completed");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Webinar</CardTitle>
          <CardDescription>Assign trainer, timing, links, and Google calendar embed details.</CardDescription>
        </CardHeader>
        <CardContent>
          <WebinarForm trainerOptions={trainers ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Webinars</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.map((item) => (
            <div className="rounded-lg border p-3" key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{item.title}</p>
                <Badge className="capitalize">{item.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{item.trainers?.name ?? "Unassigned"} • {formatDate(item.webinar_timing)}</p>
              <p className="text-xs text-muted-foreground">Duration: {item.duration_minutes ?? 60} minutes</p>
              <p className="mt-1 text-sm">{item.target_user_base ?? "No target audience defined yet."}</p>
              {item.google_calendar_embed_url ? (
                <a className="mt-2 inline-block text-xs text-primary underline" href={item.google_calendar_embed_url} target="_blank" rel="noreferrer">
                  Add event to Google Calendar
                </a>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Webinars with Metrics</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Trainer</TableHead>
                <TableHead>Attendees</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Success</TableHead>
                <TableHead>Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((item) => {
                const metric = (metrics ?? []).find((m) => m.webinar_id === item.id);
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.trainers?.name ?? "-"}</TableCell>
                    <TableCell>{metric?.attendees_count ?? 0}</TableCell>
                    <TableCell>{Number(metric?.rating ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{formatPercent(metric?.success_rate ?? 0)}</TableCell>
                    <TableCell>
                      <div className="flex gap-3 text-xs">
                        <a href={item.pre_webinar_link ?? "#"} className="text-primary underline" target="_blank" rel="noreferrer">
                          pre
                        </a>
                        <a href={item.post_webinar_link ?? "#"} className="text-primary underline" target="_blank" rel="noreferrer">
                          post
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
