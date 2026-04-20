"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LeaderboardRow = {
  id: string;
  name: string;
  city: string;
  averageRating: number;
  completedWebinars: number;
  totalAttendees: number;
  highestAudience: number;
  score: number;
};

type SortKey = "averageRating" | "completedWebinars" | "totalAttendees" | "highestAudience" | "score";

const SORT_FIELDS: Array<{ key: SortKey; label: string }> = [
  { key: "averageRating", label: "Rating" },
  { key: "completedWebinars", label: "Completed Webinars" },
  { key: "totalAttendees", label: "Total Attendees" },
  { key: "highestAudience", label: "Highest Audience" },
  { key: "score", label: "Score" }
];

export function SortableLeaderboardTable({
  rows,
  showCity = false,
  showScore = false
}: {
  rows: LeaderboardRow[];
  showCity?: boolean;
  showScore?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("averageRating");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    const directionFactor = direction === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (aValue === bValue) return a.name.localeCompare(b.name);
      return aValue > bValue ? directionFactor : -directionFactor;
    });
  }, [rows, sortKey, direction]);

  const visibleSortFields = SORT_FIELDS.filter((field) => (field.key === "score" ? showScore : true));

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setDirection("desc");
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rank</TableHead>
          <TableHead>Trainer</TableHead>
          {showCity ? <TableHead>City</TableHead> : null}
          {visibleSortFields.map((field) => (
            <TableHead key={field.key}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 h-8 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                onClick={() => onSort(field.key)}
              >
                {field.label}
                {sortKey === field.key ? (
                  direction === "desc" ? <ArrowDown className="ml-1 h-3.5 w-3.5" /> : <ArrowUp className="ml-1 h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="ml-1 h-3.5 w-3.5 opacity-40" />
                )}
              </Button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row, index) => (
          <TableRow key={row.id}>
            <TableCell>{index + 1}</TableCell>
            <TableCell>{row.name}</TableCell>
            {showCity ? <TableCell>{row.city}</TableCell> : null}
            <TableCell>{row.averageRating.toFixed(2)}</TableCell>
            <TableCell>{row.completedWebinars}</TableCell>
            <TableCell>{row.totalAttendees}</TableCell>
            <TableCell>{row.highestAudience}</TableCell>
            {showScore ? <TableCell>{row.score.toFixed(3)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

