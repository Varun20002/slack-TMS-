import { SortableLeaderboardTable } from "@/components/leaderboard/sortable-leaderboard-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLeaderboardData } from "@/lib/queries";

export default async function TrainerLeaderboardPage() {
  const leaderboard = await getLeaderboardData();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trainer Rankings</CardTitle>
          <CardDescription>Default ranking is by rating. Click arrows on metrics to re-rank.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SortableLeaderboardTable rows={leaderboard} />
        </CardContent>
      </Card>
    </div>
  );
}
