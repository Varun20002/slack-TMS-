import { LeaderboardRatingChart } from "@/components/leaderboard/leaderboard-rating-chart";
import { SortableLeaderboardTable } from "@/components/leaderboard/sortable-leaderboard-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLeaderboardData } from "@/lib/queries";

export default async function AdminLeaderboardPage() {
  const leaderboard = await getLeaderboardData();
  const chartData = leaderboard.map((row) => ({ name: row.name, rating: row.averageRating }));

  return (
    <div className="space-y-6">
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
          <SortableLeaderboardTable rows={leaderboard} showCity />
        </CardContent>
      </Card>
    </div>
  );
}
