import { WebinarVolumeChart } from "@/components/charts/webinar-volume-chart";
import { CsvUploadForm } from "@/components/admin/csv-upload-form";
import { EmptyState } from "@/components/layout/empty-state";
import { StatCard } from "@/components/layout/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardData } from "@/lib/queries";
import { formatDate, formatPercent } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData();

  const webinarByTrainer = data.trainers.map((trainer) => ({
    name: trainer.name,
    count: data.upcomingWebinars.filter((webinar) => webinar.trainer_id === trainer.id).length
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Trainers" value={data.stats.totalTrainers} />
        <StatCard label="Upcoming Webinars" value={data.stats.upcomingCount} />
        <StatCard label="Avg Trainer Rating" value={data.stats.averageRating.toFixed(2)} />
        <StatCard label="Total Attendees" value={data.stats.totalAttendees} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Load by Trainer</CardTitle>
            <CardDescription>Quick planning lens for trainer assignment capacity.</CardDescription>
          </CardHeader>
          <CardContent>{webinarByTrainer.length ? <WebinarVolumeChart data={webinarByTrainer} /> : <EmptyState title="No webinar data" description="Create webinars to populate this chart." />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rating CSV Upload</CardTitle>
            <CardDescription>Bulk import trainer ratings from your operations sheet.</CardDescription>
          </CardHeader>
          <CardContent>
            <CsvUploadForm />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Past Webinar Metrics</CardTitle>
          <CardDescription>Registrations → attendees → first-time traders conversion summary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.pastWebinars.length === 0 ? (
            <EmptyState title="No completed webinars yet" description="Completed or past webinars will appear here with success metrics." />
          ) : (
            data.pastWebinars.slice(0, 8).map((webinar) => {
              const metric = data.metrics.find((item) => item.webinar_id === webinar.id);
              const success = metric?.success_rate ?? 0;
              return (
                <div key={webinar.id} className="rounded-lg border p-3">
                  <p className="font-medium">{webinar.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(webinar.webinar_timing)}</p>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                    <p>Attendees: {metric?.attendees_count ?? 0}</p>
                    <p>Rating: {(metric?.rating ?? 0).toFixed(2)}</p>
                    <p>Success Rate: {formatPercent(success ?? 0)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs">
                    <a className="text-primary underline" href={webinar.pre_webinar_link ?? "#"} target="_blank" rel="noreferrer">
                      Pre-webinar link
                    </a>
                    <a className="text-primary underline" href={webinar.post_webinar_link ?? "#"} target="_blank" rel="noreferrer">
                      Post-webinar link
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
