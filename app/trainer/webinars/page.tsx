import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeRemainingBadge } from "@/components/shared/time-remaining-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentProfile } from "@/lib/auth";
import { getTrainerDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function TrainerWebinarsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const data = await getTrainerDashboardData(profile.id);
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Webinars</CardTitle>
          <CardDescription>Session requirements, audience, and prep links.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Target users</TableHead>
                <TableHead>Pre link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.upcoming.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{formatDate(item.webinar_timing)}</TableCell>
                  <TableCell>
                    <TimeRemainingBadge targetIso={item.webinar_timing} />
                  </TableCell>
                  <TableCell>{item.target_user_base ?? "-"}</TableCell>
                  <TableCell>
                    <a href={item.pre_webinar_link ?? "#"} target="_blank" rel="noreferrer" className="text-primary underline">
                      Open
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Webinars</CardTitle>
          <CardDescription>Performance outcomes from completed sessions.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Attendees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.past.map((item) => {
                const metric = Array.isArray(item.webinar_metrics) ? item.webinar_metrics[0] : item.webinar_metrics;
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{Number(metric?.rating ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{metric?.attendees_count ?? 0}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
