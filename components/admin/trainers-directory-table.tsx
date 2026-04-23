"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
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

  const sorted = useMemo(
    () =>
      [...trainers].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true
        })
      ),
    [trainers]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  return (
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
            <TableHead>Temporary Password</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((trainer) => {
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
  );
}
