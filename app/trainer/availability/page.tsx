import { AvailabilityManager } from "@/components/trainer/availability-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerAvailabilityPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
  const { data: slots } = trainer
    ? await supabase.from("trainer_availability").select("*").eq("trainer_id", trainer.id).order("day_of_week")
    : { data: [] };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Availability Calendar</CardTitle>
        <CardDescription>Add weekly slots. Overlapping slots are blocked automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <AvailabilityManager slots={slots ?? []} />
      </CardContent>
    </Card>
  );
}
