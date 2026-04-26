"use client";

import { Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTrainerAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TrainerDirectoryRow = {
  id: string;
  profile_id: string | null;
  name: string;
  email: string;
  investing_trading_persona: string;
  product_categories: string[];
  base_city: string;
  average_rating: number;
  temporary_password: string | null;
  profiles?: { must_change_password?: boolean } | null;
};

const PAGE_SIZE = 10;

export function TrainersDirectoryTable({ trainers }: { trainers: TrainerDirectoryRow[] }) {
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sorted = useMemo(
    () =>
      [...trainers].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
      ),
    [trainers]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  const confirmingTrainer = sorted.find((t) => t.id === confirmId) ?? null;

  function handleDelete(trainer: TrainerDirectoryRow) {
    startTransition(async () => {
      const res = await deleteTrainerAction(trainer.id, trainer.profile_id);
      if (res.success) {
        toast.success(`${trainer.name} deleted.`);
      } else {
        toast.error("Delete failed", { description: res.message });
      }
      setConfirmId(null);
    });
  }

  return (
    <>
      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Persona</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((trainer) => (
              <TableRow key={trainer.id}>
                <TableCell>{trainer.name}</TableCell>
                <TableCell>{trainer.email}</TableCell>
                <TableCell>{trainer.investing_trading_persona}</TableCell>
                <TableCell>{trainer.product_categories.join(", ")}</TableCell>
                <TableCell>{trainer.base_city}</TableCell>
                <TableCell>{Number(trainer.average_rating).toFixed(2)}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    aria-label={`Delete ${trainer.name}`}
                    onClick={() => setConfirmId(trainer.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
              Previous
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmId && confirmingTrainer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <TriangleAlert className="h-5 w-5 text-destructive" />
              </span>
              <div>
                <p className="font-semibold">Delete trainer?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{confirmingTrainer.name}</span>{" "}
                  ({confirmingTrainer.email}) will be permanently removed along with their ratings,
                  availability, and login account. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => handleDelete(confirmingTrainer)}
              >
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
