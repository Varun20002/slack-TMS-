import { PastWebinarsTable } from "@/components/admin/past-webinars-table";
import { UpcomingWebinarsManager } from "@/components/admin/upcoming-webinars-manager";
import { WebinarRequestStatus } from "@/components/admin/webinar-request-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function AdminWebinarsPage() {
  const supabase = (await createClient()) as any;
  const now = new Date().toISOString();

  const [{ data: trainers }, { data: webinars }, { data: metrics }, webinarRequestsResult, submittedAuditRows] = await Promise.all([
    supabase.from("trainers").select("id,name").order("name"),
    supabase.from("webinars").select("*, trainers(name)").order("webinar_timing"),
    supabase.from("webinar_metrics").select("*"),
    supabase
      .from("webinar_requests")
      .select("id,topic,trainer_name,state,requested_date,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("audit_log").select("request_id").eq("action", "submit_slack_webinar_request")
  ]);

  const requestError = webinarRequestsResult.error;
  const requestErrorMessage =
    requestError && (requestError.code === "42P01" || requestError.message?.toLowerCase().includes("webinar_requests"))
      ? "Slack request table is not available in this environment yet."
      : requestError?.message;
  const slackRequestIds = new Set((submittedAuditRows.data ?? []).map((row) => row.request_id).filter(Boolean));
  const requestRows = (webinarRequestsResult.data ?? []).filter((row) => slackRequestIds.has(row.id));

  const upcoming = (webinars ?? []).filter((item) => item.webinar_timing >= now && item.status !== "cancelled");
  const past = (webinars ?? []).filter((item) => item.webinar_timing < now || item.status === "completed");
  const pastRows = past.map((item) => {
    const metric = (metrics ?? []).find((m) => m.webinar_id === item.id);
    return {
      id: item.id,
      title: item.title,
      trainerName: item.trainers?.name ?? "-",
      registrations: metric?.registrations_count ?? 0,
      attendees: metric?.attendees_count ?? 0,
      rating: Number(metric?.rating ?? 0),
      successRate: Number(metric?.success_rate ?? 0),
      postWebinarLink: item.post_webinar_link ?? null,
      googleSyncStatus: item.google_calendar_sync_error ? "error" : item.google_event_id ? "connected" : "pending",
      googleSyncError: item.google_calendar_sync_error ?? null
    };
  });

  return (
    <div className="space-y-6">
      <WebinarRequestStatus
        requests={requestRows}
        errorMessage={requestErrorMessage}
      />

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Webinars</CardTitle>
          <CardDescription>Webinars are created via Slack bot. You can edit or delete them here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <UpcomingWebinarsManager webinars={upcoming} trainerOptions={trainers ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Webinars</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PastWebinarsTable rows={pastRows} />
        </CardContent>
      </Card>
    </div>
  );
}
