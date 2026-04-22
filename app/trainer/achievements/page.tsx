import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerAchievementsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return null;

  const [{ data: webinars }, { data: ratings }, availabilityRows] = await Promise.all([
    supabase.from("webinars").select("status, webinar_metrics(attendees_count, highest_audience_count)").eq("trainer_id", trainer.id),
    supabase.from("trainer_ratings").select("rating, source").eq("trainer_id", trainer.id),
    supabase.from("trainer_availability").select("id", { count: "exact", head: true }).eq("trainer_id", trainer.id)
  ]);

  const completedWebinars = (webinars ?? []).filter((item: any) => item.status === "completed").length;
  const metricRows = (webinars ?? [])
    .flatMap((item: any) => (Array.isArray(item.webinar_metrics) ? item.webinar_metrics : item.webinar_metrics ? [item.webinar_metrics] : []))
    .filter(Boolean);
  const totalAttendees = metricRows.reduce((sum: number, item: any) => sum + Number(item.attendees_count ?? 0), 0);
  const highestAttendees = metricRows.reduce(
    (max: number, item: any) => Math.max(max, Number(item.highest_audience_count ?? item.attendees_count ?? 0)),
    0
  );
  const totalLikes = (ratings ?? []).filter((item: any) => item.source === "csv" && Number(item.rating) === 4).length;

  const hasCheckedProfile = new Date(profile.updated_at).getTime() > new Date(profile.created_at).getTime();
  const hasUpdatedAvailability = Number(availabilityRows.count ?? 0) > 0;

  const achievements = [
    metricAchievement("complete_webinars", "Complete webinars", completedWebinars, [1, 5, 20, 50, 100]),
    metricAchievement("total_attendees", "Total attendees", totalAttendees, [100, 500, 1000, 2000, 5000]),
    metricAchievement("highest_attendees", "Highest attendees", highestAttendees, [100, 150, 200, 300, 500]),
    metricAchievement("total_likes", "Total likes", totalLikes, [50, 250, 500, 1000, 2000]),
    oneTimeAchievement("checkout_profile", "Checkout profile section", hasCheckedProfile),
    oneTimeAchievement("update_availability", "Update availability timings", hasUpdatedAvailability)
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Achievements</CardTitle>
          <CardDescription>Earn levels from Bronze to Diamond as you progress.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {achievements.map((achievement) => (
            <div key={achievement.title} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{achievement.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Level {achievement.level} • {LEVELS[Math.max(achievement.level - 1, 0)]}
                  </p>
                </div>
                <ShieldBadge level={achievement.level} assetKey={achievement.assetKey} />
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${achievement.progressPercent}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {achievement.isOneTime
                  ? achievement.level === 5
                    ? "Completed"
                    : "Pending"
                  : `Current: ${achievement.currentValue} • Next target: ${achievement.nextTarget}`}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const LEVELS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const;

function metricAchievement(
  assetKey: string,
  title: string,
  value: number,
  thresholds: [number, number, number, number, number]
) {
  const level = thresholds.reduce((acc, threshold, index) => (value >= threshold ? index + 1 : acc), 0);
  const nextTarget = thresholds[Math.min(level, thresholds.length - 1)];
  const progressPercent = Math.max(0, Math.min(100, Math.round((value / thresholds[thresholds.length - 1]) * 100)));
  return {
    assetKey,
    title,
    level,
    currentValue: value,
    nextTarget,
    progressPercent,
    isOneTime: false
  };
}

function oneTimeAchievement(assetKey: string, title: string, earned: boolean) {
  return {
    assetKey,
    title,
    level: earned ? 5 : 0,
    currentValue: earned ? 1 : 0,
    nextTarget: 1,
    progressPercent: earned ? 100 : 0,
    isOneTime: true
  };
}

function ShieldBadge({ level, assetKey }: { level: number; assetKey: string }) {
  const shownLevel = Math.max(1, Math.min(5, level || 1));
  const src = `/achievement-badges/${assetKey}_level${shownLevel}.png`;
  const locked = level <= 0;

  return (
    <div className="relative h-20 w-20" title={`Level ${shownLevel}`}>
      <Image
        src={src}
        alt={`${assetKey} level ${shownLevel}`}
        width={80}
        height={80}
        className={`h-20 w-20 object-contain drop-shadow-md ${locked ? "grayscale opacity-75" : ""}`}
        unoptimized
      />
    </div>
  );
}
