import { LeaderboardScoreChart } from "@/components/charts/leaderboard-score-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLeaderboardData } from "@/lib/queries";

export default async function TrainerLeaderboardPage() {
  const leaderboard = await getLeaderboardData();
  const chartData = leaderboard.slice(0, 8).map((row) => ({ name: row.name, score: row.score }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard Score Trend</CardTitle>
          <CardDescription>Ranking formula: 50% avg rating + 30% webinars completed + 20% attendees scale.</CardDescription>
        </CardHeader>
        <CardContent>
          <LeaderboardScoreChart data={chartData} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trainer Rankings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Trainer</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Completed Webinars</TableHead>
                <TableHead>Total Attendees</TableHead>
                <TableHead>Highest Audience</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.rank}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.averageRating.toFixed(2)}</TableCell>
                  <TableCell>{row.completedWebinars}</TableCell>
                  <TableCell>{row.totalAttendees}</TableCell>
                  <TableCell>{row.highestAudience}</TableCell>
                  <TableCell>{row.score.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
