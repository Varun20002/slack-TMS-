import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { getTrainerDashboardData } from "@/lib/queries";

export default async function TrainerAchievementsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const data = await getTrainerDashboardData(profile.id);
  if (!data) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Badges</CardTitle>
          <CardDescription>Recognition received based on webinar performance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.badges.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <p className="font-medium">{item.badges?.name}</p>
              <p className="text-sm text-muted-foreground">{item.badges?.description}</p>
            </div>
          ))}
          {!data.badges.length ? <p className="text-sm text-muted-foreground">No badges yet.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Incentives</CardTitle>
          <CardDescription>Reward history for delivery quality and outcomes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.incentives.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.amount_or_reward}</p>
              <p className="text-xs text-muted-foreground">{item.description ?? ""}</p>
            </div>
          ))}
          {!data.incentives.length ? <p className="text-sm text-muted-foreground">No incentives awarded yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
