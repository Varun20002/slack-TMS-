import { EmptyState } from "@/components/layout/empty-state";
import { StatCard } from "@/components/layout/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { getTrainerDashboardData } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function TrainerDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const data = await getTrainerDashboardData(profile.id);
  if (!data) return <EmptyState title="Trainer profile not linked" description="Ask admin to map your auth account to a trainer profile." />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average Rating" value={Number(data.stats.averageRating ?? 0).toFixed(2)} />
        <StatCard label="Registrations" value={data.stats.registrations} />
        <StatCard label="Attendees" value={data.stats.attendees} />
        <StatCard label="Highest Audience" value={data.stats.highestAudience} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Webinar</CardTitle>
            <CardDescription>Your nearest scheduled session.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.upcoming[0] ? (
              <div>
                <p className="font-medium">{data.upcoming[0].title}</p>
                <p className="text-sm text-muted-foreground">{formatDate(data.upcoming[0].webinar_timing)}</p>
                <p className="mt-2 text-sm">{data.upcoming[0].requirements ?? "No requirements listed."}</p>
              </div>
            ) : (
              <EmptyState title="No upcoming webinar" description="Your next session will appear here once scheduled by admin." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent Badges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.badges.length ? (
              data.badges.slice(0, 4).map((item) => (
                <div className="rounded-lg border p-3" key={item.id}>
                  <p className="font-medium">{item.badges?.name}</p>
                  <p className="text-sm text-muted-foreground">{item.badges?.description}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No badges awarded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
