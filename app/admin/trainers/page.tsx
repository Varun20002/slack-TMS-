import { TrainerDetailsViewer } from "@/components/admin/trainer-details-viewer";
import { TrainerForm } from "@/components/admin/trainer-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function AdminTrainersPage() {
  const supabase = (await createClient()) as any;
  const { data: trainers } = await supabase
    .from("trainers")
    .select("*, profiles(must_change_password)")
    .order("created_at", { ascending: false });

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
                <TableHead>Temporary Password</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(trainers ?? []).map((trainer) => {
                const hasProfileLink = Boolean(trainer.profile_id);
                const mustChangePassword = Boolean(trainer.profiles?.must_change_password);

                return (
                  <TableRow key={trainer.id}>
                    <TableCell>{trainer.name}</TableCell>
                    <TableCell>{trainer.email}</TableCell>
                    <TableCell>{trainer.investing_trading_persona}</TableCell>
                    <TableCell>{trainer.product_categories.join(", ")}</TableCell>
                    <TableCell>{trainer.base_city}</TableCell>
                    <TableCell>{Number(trainer.average_rating).toFixed(2)}</TableCell>
                    <TableCell>{mustChangePassword ? trainer.temporary_password ?? "-" : "-"}</TableCell>
                    <TableCell>
                      {!hasProfileLink ? (
                        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Auth Not Linked</Badge>
                      ) : mustChangePassword ? (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending Password Reset</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Activated</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TrainerDetailsViewer trainers={trainers ?? []} />
    </div>
  );
}
