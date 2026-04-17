import { LeaderboardScoreChart } from "@/components/charts/leaderboard-score-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLeaderboardData } from "@/lib/queries";

export default async function AdminLeaderboardPage() {
  const leaderboard = await getLeaderboardData();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard Analytics</CardTitle>
          <CardDescription>Transparent formula: 50% rating + 30% completed webinars + 20% attendees scale.</CardDescription>
        </CardHeader>
        <CardContent>
          <LeaderboardScoreChart data={leaderboard.slice(0, 10).map((item) => ({ name: item.name, score: item.score }))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ranked Trainers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Total Attendees</TableHead>
                <TableHead>Highest Audience</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.rank}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.city}</TableCell>
                  <TableCell>{item.averageRating.toFixed(2)}</TableCell>
                  <TableCell>{item.completedWebinars}</TableCell>
                  <TableCell>{item.totalAttendees}</TableCell>
                  <TableCell>{item.highestAudience}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
