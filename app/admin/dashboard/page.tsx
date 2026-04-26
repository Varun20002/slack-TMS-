import Link from "next/link";
import { endOfWeek, startOfWeek } from "date-fns";

import { CsvUploadForm } from "@/components/admin/csv-upload-form";
import { StatCard } from "@/components/layout/stat-card";
import { WebinarCalendar } from "@/components/shared/webinar-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminDashboardData, getLeaderboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const [data, leaderboard] = await Promise.all([getAdminDashboardData(), getLeaderboardData()]);

  const completedWithoutCsv = data.webinars.filter(
    (webinar) => webinar.status === "completed" && !data.csvRatedWebinarIds.includes(webinar.id)
  );
  const csvWebinarOptions = completedWithoutCsv.map((webinar) => ({
    id: webinar.id,
    label: `${webinar.title} • ${formatDate(webinar.webinar_timing)}`
  }));

  const trainerById = new Map((data.trainers as any[]).map((trainer) => [trainer.id as string, trainer]));
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const upcomingThisWeek = data.upcomingWebinars
    .filter((webinar) => {
      const t = new Date(webinar.webinar_timing).getTime();
      return t >= weekStart.getTime() && t <= weekEnd.getTime();
    })
    .sort((a, b) => new Date(a.webinar_timing).getTime() - new Date(b.webinar_timing).getTime());

  const topTrainerName = leaderboard[0]?.name ?? "—";

  const events = data.webinars.map((webinar: any) => {
    const start = new Date(webinar.webinar_timing);
    const end = new Date(start.getTime() + (webinar.duration_minutes ?? 60) * 60 * 1000);
    return {
      id: webinar.id,
      title: webinar.title,
      start: start.toISOString(),
      end: end.toISOString(),
      status: (webinar.status ?? "upcoming") as "upcoming" | "completed" | "cancelled",
      trainerName: trainerById.get(webinar.trainer_id)?.name ?? null,
      googleLink: webinar.google_calendar_embed_url ?? null
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Trainers" value={data.stats.totalTrainers} />
        <StatCard label="Upcoming Webinars" value={data.stats.upcomingCount} />
        <StatCard label="Completed Webinars" value={data.stats.completedCount} />
        <StatCard label="Rank #1 Trainer" value={topTrainerName} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Upcoming Webinars This Week</CardTitle>
              <CardDescription>Scheduled webinars between this Monday and Sunday.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="#calendar">View More</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingThisWeek.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Trainer</TableHead>
                    <TableHead className="text-right">Date / Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingThisWeek.map((webinar) => (
                    <TableRow key={webinar.id}>
                      <TableCell>{webinar.title}</TableCell>
                      <TableCell>{trainerById.get(webinar.trainer_id)?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatDate(webinar.webinar_timing)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No webinars scheduled this week.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rating CSV Upload</CardTitle>
            <CardDescription>Select a completed webinar, enter metrics, then upload the survey report.</CardDescription>
          </CardHeader>
          <CardContent>
            <CsvUploadForm webinarOptions={csvWebinarOptions} />
          </CardContent>
        </Card>
      </div>

      <div id="calendar" className="scroll-mt-24">
        <WebinarCalendar
          events={events}
          title="Webinar Calendar"
          description="All scheduled webinars appear here automatically."
          interactiveDateDetails
        />
      </div>
    </div>
  );
}
