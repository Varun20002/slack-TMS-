import { LeaderboardRatingChart } from "@/components/leaderboard/leaderboard-rating-chart";
import { SortableLeaderboardTable } from "@/components/leaderboard/sortable-leaderboard-table";
import { EmptyState } from "@/components/layout/empty-state";
import { StatCard } from "@/components/layout/stat-card";
import { UpcomingWebinarCard } from "@/components/trainer/upcoming-webinar-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { getTrainerDashboardData } from "@/lib/queries";

export default async function TrainerDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const data = await getTrainerDashboardData(profile.id);
  if (!data) return <EmptyState title="Trainer profile not linked" description="Ask admin to map your auth account to a trainer profile." />;

  const nextWebinar = data.upcoming[0];
  const chartData = data.leaderboard.map((row) => ({ name: row.name, rating: row.averageRating }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average Rating" value={data.stats.averageRating ? Number(data.stats.averageRating).toFixed(2) : "—"} />
        <StatCard label="Total Registrations" value={data.stats.registrations} />
        <StatCard label="Total Attendees" value={data.stats.attendees} />
        <StatCard label="Rank" value={data.stats.rank ? `#${data.stats.rank}` : "—"} />
      </div>

      {nextWebinar ? (
        <UpcomingWebinarCard
          title={nextWebinar.title}
          webinarTiming={nextWebinar.webinar_timing}
          targetUserBase={nextWebinar.target_user_base}
          requirements={nextWebinar.requirements}
          scheduleHref="/trainer/availability"
        />
      ) : (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No upcoming webinar"
              description="Your next session will appear here once scheduled by admin."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Average Rating per Trainer</CardTitle>
          <CardDescription>Cumulative rating across all uploaded surveys, sorted highest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length ? (
            <LeaderboardRatingChart data={chartData} />
          ) : (
            <p className="text-sm text-muted-foreground">No ratings to display yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranked Trainers</CardTitle>
          <CardDescription>Default ranking is by rating. Click arrows on metrics to re-rank.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SortableLeaderboardTable rows={data.leaderboard} showCity highlightTrainerId={data.trainer.id} />
        </CardContent>
      </Card>
    </div>
  );
}

