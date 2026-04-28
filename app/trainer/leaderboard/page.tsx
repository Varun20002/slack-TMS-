import { LeaderboardRatingChart } from "@/components/leaderboard/leaderboard-rating-chart";
import { SortableLeaderboardTable } from "@/components/leaderboard/sortable-leaderboard-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { getLeaderboardData } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerLeaderboardPage() {
  const leaderboard = await getLeaderboardData();
  const chartData = leaderboard.map((row) => ({ name: row.name, rating: row.averageRating }));

  const profile = await getCurrentProfile();
  let highlightTrainerId: string | undefined;
  if (profile) {
    const supabase = (await createClient()) as any;
    const { data: trainer } = await supabase.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
    highlightTrainerId = trainer?.id;
  }

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
          <SortableLeaderboardTable rows={leaderboard} showCity highlightTrainerId={highlightTrainerId} />
        </CardContent>
      </Card>
    </div>
  );
}
