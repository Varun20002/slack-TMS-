import { TrainerDetailsViewer } from "@/components/admin/trainer-details-viewer";
import { TrainerForm } from "@/components/admin/trainer-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function AdminTrainersPage() {
  const supabase = (await createClient()) as any;
  const { data: trainers } = await supabase.from("trainers").select("*").order("created_at", { ascending: false });

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(trainers ?? []).map((trainer) => (
                <TableRow key={trainer.id}>
                  <TableCell>{trainer.name}</TableCell>
                  <TableCell>{trainer.email}</TableCell>
                  <TableCell>{trainer.investing_trading_persona}</TableCell>
                  <TableCell>{trainer.product_categories.join(", ")}</TableCell>
                  <TableCell>{trainer.base_city}</TableCell>
                  <TableCell>{Number(trainer.average_rating).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TrainerDetailsViewer trainers={trainers ?? []} />
    </div>
  );
}
