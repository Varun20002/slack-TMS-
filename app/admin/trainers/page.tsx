import { TrainersDirectoryTable } from "@/components/admin/trainers-directory-table";
import { TrainerDetailsViewer } from "@/components/admin/trainer-details-viewer";
import { TrainerForm } from "@/components/admin/trainer-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function AdminTrainersPage() {
  const supabase = (await createClient()) as any;
  const { data: trainers } = await supabase
    .from("trainers")
    .select("*, profiles(must_change_password)")
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trainer Onboarding</CardTitle>
          <CardDescription>Create trainer records with full metadata for scheduling and ranking workflows.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrainerForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trainers Directory</CardTitle>
          <CardDescription>Current trainer roster with core profile details.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <TrainersDirectoryTable trainers={trainers ?? []} />
        </CardContent>
      </Card>

      <TrainerDetailsViewer trainers={trainers ?? []} />
    </div>
  );
}
