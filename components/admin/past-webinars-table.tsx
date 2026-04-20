"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateWebinarPostLinkAction } from "@/lib/actions";
import { formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PastWebinarRow = {
  id: string;
  title: string;
  trainerName: string;
  attendees: number;
  rating: number;
  successRate: number;
  postWebinarLink: string | null;
};

const PAGE_SIZE = 10;

export function PastWebinarsTable({ rows }: { rows: PastWebinarRow[] }) {
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [pending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  const onEdit = (row: PastWebinarRow) => {
    setEditingId(row.id);
    setLinkValue(row.postWebinarLink ?? "");
  };

  const onSave = (id: string) => {
    startTransition(async () => {
      const result = await updateWebinarPostLinkAction(id, linkValue);
      if (!result.success) {
        toast.error("Update failed", { description: result.message });
        return;
      }
      toast.success("Post-webinar link updated");
      setEditingId(null);
    });
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Trainer</TableHead>
            <TableHead>Attendees</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Success</TableHead>
            <TableHead>Post-webinar Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.title}</TableCell>
              <TableCell>{row.trainerName}</TableCell>
              <TableCell>{row.attendees}</TableCell>
              <TableCell>{row.rating.toFixed(2)}</TableCell>
              <TableCell>{formatPercent(row.successRate)}</TableCell>
              <TableCell>
                {editingId === row.id ? (
                  <div className="flex min-w-[280px] items-center gap-2">
                    <Input value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder="https://..." />
                    <Button size="sm" onClick={() => onSave(row.id)} disabled={pending}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(null);
                        setLinkValue("");
                      }}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {row.postWebinarLink ? (
                      <a href={row.postWebinarLink} className="text-primary underline" target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">No link</span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onEdit(row)}>
                      Edit
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!paginatedRows.length ? (
            <TableRow>
              <TableCell colSpan={6} className="text-sm text-muted-foreground">
                No past webinars.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

