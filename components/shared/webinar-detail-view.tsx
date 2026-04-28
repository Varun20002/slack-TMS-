import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, ExternalLink, FileText, Target, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

export type WebinarDetail = {
  id: string;
  title: string;
  webinar_timing: string;
  duration_minutes: number | null;
  status: "upcoming" | "completed" | "cancelled";
  requirements: string | null;
  target_user_base: string | null;
  pre_webinar_link: string | null;
  post_webinar_link: string | null;
  google_calendar_embed_url: string | null;
  trainer?: { id: string; name: string | null } | null;
  metrics?: {
    registrations_count: number | null;
    attendees_count: number | null;
    rating: number | null;
    success_rate: number | null;
  } | null;
};

const STATUS_STYLES: Record<WebinarDetail["status"], string> = {
  upcoming: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/15 text-destructive"
};

export function WebinarDetailView({ webinar, backHref }: { webinar: WebinarDetail; backHref: string }) {
  const start = new Date(webinar.webinar_timing);
  const duration = webinar.duration_minutes ?? 60;
  const end = new Date(start.getTime() + duration * 60 * 1000);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Link>
        </Button>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium capitalize",
            STATUS_STYLES[webinar.status]
          )}
        >
          {webinar.status}
        </span>
      </div>

      <Card className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-background via-background to-primary/5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <CardHeader className="relative">
          <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
            <CalendarDays className="h-3.5 w-3.5" />
            Webinar Details
          </CardDescription>
          <CardTitle className="text-2xl md:text-3xl">{webinar.title}</CardTitle>
        </CardHeader>
        <CardContent className="relative space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow icon={<CalendarDays className="h-4 w-4 text-primary" />} label="Date">
              {formatDate(start)}
            </InfoRow>
            <InfoRow icon={<Clock className="h-4 w-4 text-primary" />} label="Duration">
              {duration} minutes &nbsp;
              <span className="text-muted-foreground">
                ({start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} -{" "}
                {end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })})
              </span>
            </InfoRow>
            {webinar.trainer ? (
              <InfoRow icon={<User className="h-4 w-4 text-primary" />} label="Trainer">
                {webinar.trainer.name ?? "—"}
              </InfoRow>
            ) : null}
            {webinar.target_user_base ? (
              <InfoRow icon={<Target className="h-4 w-4 text-primary" />} label="Target audience">
                {webinar.target_user_base}
              </InfoRow>
            ) : null}
          </div>

          {webinar.requirements ? (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Requirements
              </div>
              <p className="text-sm text-foreground">{webinar.requirements}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {webinar.google_calendar_embed_url ? (
              <Button asChild size="sm">
                <a href={webinar.google_calendar_embed_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Add to Calendar
                </a>
              </Button>
            ) : null}
            {webinar.pre_webinar_link ? (
              <Button asChild size="sm" variant="outline">
                <a href={webinar.pre_webinar_link} target="_blank" rel="noreferrer">
                  Pre-webinar link
                </a>
              </Button>
            ) : null}
            {webinar.post_webinar_link ? (
              <Button asChild size="sm" variant="outline">
                <a href={webinar.post_webinar_link} target="_blank" rel="noreferrer">
                  Post-webinar link
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {webinar.metrics ? (
        <Card>
          <CardHeader>
            <CardTitle>Webinar Metrics</CardTitle>
            <CardDescription>Performance figures for this session.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Registrations" value={webinar.metrics.registrations_count ?? 0} />
              <Metric label="Attendees" value={webinar.metrics.attendees_count ?? 0} />
              <Metric
                label="Rating"
                value={
                  webinar.metrics.rating != null ? Number(webinar.metrics.rating).toFixed(2) : "—"
                }
              />
              <Metric
                label="Success rate"
                value={
                  webinar.metrics.success_rate != null
                    ? `${Math.round(Number(webinar.metrics.success_rate) * 100)}%`
                    : "—"
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background/60 p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
