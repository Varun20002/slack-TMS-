import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { StatCard } from "@/components/layout/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { getTrainerDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function TrainerDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const data = await getTrainerDashboardData(profile.id);
  if (!data) return <EmptyState title="Trainer profile not linked" description="Ask admin to map your auth account to a trainer profile." />;

  const nextWebinar = data.upcoming[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average Rating" value={data.stats.averageRating ? Number(data.stats.averageRating).toFixed(2) : "—"} />
        <StatCard label="Total Registrations" value={data.stats.registrations} />
        <StatCard label="Total Attendees" value={data.stats.attendees} />
        <StatCard label="Rank" value={data.stats.rank ? `#${data.stats.rank}` : "—"} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Upcoming Webinar</CardTitle>
            <CardDescription>Your nearest scheduled session.</CardDescription>
          </div>
          <Button asChild>
            <Link href="/trainer/availability">
              <CalendarClock className="mr-2 h-4 w-4" />
              View My Schedule
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {nextWebinar ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold">{nextWebinar.title}</p>
              <p className="text-sm text-muted-foreground">{formatDate(nextWebinar.webinar_timing)}</p>
              {nextWebinar.target_user_base ? (
                <p className="text-sm">
                  <span className="font-medium">Target users:</span> {nextWebinar.target_user_base}
                </p>
              ) : null}
              <p className="text-sm">
                <span className="font-medium">Requirements:</span>{" "}
                {nextWebinar.requirements ?? "No requirements listed."}
              </p>
            </div>
          ) : (
            <EmptyState title="No upcoming webinar" description="Your next session will appear here once scheduled by admin." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
