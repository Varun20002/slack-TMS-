import { CsvUploadForm } from "@/components/admin/csv-upload-form";
import { StatCard } from "@/components/layout/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData();
  const completedWithoutCsv = data.webinars.filter(
    (webinar) => webinar.status === "completed" && !data.csvRatedWebinarIds.includes(webinar.id)
  );
  const csvWebinarOptions = completedWithoutCsv.map((webinar) => ({
    id: webinar.id,
    label: `${webinar.title} • ${formatDate(webinar.webinar_timing)}`
  }));

  const webinarByTrainer = data.trainers.map((trainer) => ({
    name: trainer.name,
    count: data.upcomingWebinars.filter((webinar) => webinar.trainer_id === trainer.id).length
  })).filter((trainer) => trainer.count > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Trainers" value={data.stats.totalTrainers} />
        <StatCard label="Upcoming Webinars" value={data.stats.upcomingCount} />
        <StatCard label="Completed Webinars" value={data.stats.completedCount} />
        <StatCard label="Total Attendees" value={data.stats.totalAttendees} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Load by Trainer</CardTitle>
            <CardDescription>Only trainers with at least one scheduled webinar are shown.</CardDescription>
          </CardHeader>
          <CardContent>
            {webinarByTrainer.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trainer</TableHead>
                    <TableHead className="text-right">Scheduled Webinars</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webinarByTrainer.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No webinars scheduled.</p>
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
    </div>
  );
}
