"use client";

import { useMemo, useState } from "react";

import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WebinarRequestState =
  | "RAISED"
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "REJECTED"
  | "ALT_SUGGESTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type WebinarRequest = {
  id: string;
  topic: string;
  trainer_name: string | null;
  state: WebinarRequestState;
  requested_date: string | null;
  created_at: string;
  updated_at: string;
};

type RequestFilter = "all" | "raised" | "accepted" | "declined" | "suggested_alternative";

const PAGE_SIZE = 10;

export function WebinarRequestStatus({
  requests,
  errorMessage
}: {
  requests: WebinarRequest[];
  errorMessage?: string;
}) {
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [page, setPage] = useState(1);

  const normalized = useMemo(() => dedupeRequests(requests), [requests]);
  const counts = useMemo(() => {
    return {
      all: normalized.length,
      raised: normalized.filter((r) => getRequestStage(r.state) === "raised").length,
      accepted: normalized.filter((r) => getRequestStage(r.state) === "accepted").length,
      declined: normalized.filter((r) => getRequestStage(r.state) === "declined").length,
      suggested_alternative: normalized.filter((r) => getRequestStage(r.state) === "suggested_alternative").length
    };
  }, [normalized]);

  const filtered = useMemo(() => {
    if (filter === "all") return normalized;
    return normalized.filter((request) => getRequestStage(request.state) === filter);
  }, [filter, normalized]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const onFilterChange = (next: RequestFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webinar request status</CardTitle>
        <CardDescription>
          Read-only details from Slack workflow updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        {!requests.length ? (
          <p className="text-sm text-muted-foreground">No Slack webinar requests found yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <FilterButton filterType="all" active={filter === "all"} onClick={() => onFilterChange("all")} label={`All (${counts.all})`} />
                <FilterButton
                  filterType="raised"
                  active={filter === "raised"}
                  onClick={() => onFilterChange("raised")}
                  label={`Raised (${counts.raised})`}
                />
                <FilterButton
                  filterType="accepted"
                  active={filter === "accepted"}
                  onClick={() => onFilterChange("accepted")}
                  label={`Accepted (${counts.accepted})`}
                />
                <FilterButton
                  filterType="declined"
                  active={filter === "declined"}
                  onClick={() => onFilterChange("declined")}
                  label={`Declined (${counts.declined})`}
                />
                <FilterButton
                  filterType="suggested_alternative"
                  active={filter === "suggested_alternative"}
                  onClick={() => onFilterChange("suggested_alternative")}
                  label={`Suggested Alternative (${counts.suggested_alternative})`}
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {!pagedRows.length ? (
                <p className="text-sm text-muted-foreground">No requests found for this filter.</p>
              ) : (
                pagedRows.map((request) => {
                  const stage = getRequestStage(request.state);
                  return (
                    <div key={request.id} className={`rounded-md border p-3 ${getStageCardClass(stage)}`}>
                      <p className="font-medium">{request.topic}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {request.trainer_name ?? "Unassigned"} • Requested {request.requested_date ? formatDate(request.requested_date) : "-"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Last updated: {formatDate(request.updated_at)}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilterButton({
  filterType,
  active,
  label,
  onClick
}: {
  filterType: RequestFilter;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const classes = getFilterButtonClass(filterType, active);
  return (
    <Button type="button" size="sm" variant="outline" className={classes} onClick={onClick}>
      {label}
    </Button>
  );
}

function getRequestStage(state: WebinarRequestState): RequestFilter {
  if (state === "RAISED" || state === "PENDING_APPROVAL") return "raised";
  if (state === "CONFIRMED" || state === "IN_PROGRESS" || state === "COMPLETED") return "accepted";
  if (state === "REJECTED" || state === "CANCELLED") return "declined";
  return "suggested_alternative";
}

function getStageCardClass(stage: RequestFilter) {
  if (stage === "raised") return "bg-blue-500/10";
  if (stage === "accepted") return "bg-emerald-500/10";
  if (stage === "suggested_alternative") return "bg-amber-400/15";
  return "bg-rose-500/10";
}

function getFilterButtonClass(filterType: RequestFilter, active: boolean) {
  if (filterType === "raised") {
    return active ? "border-blue-300 bg-blue-500/15 text-blue-900 hover:bg-blue-500/20" : "border-blue-200/70 bg-blue-500/5 text-blue-900 hover:bg-blue-500/10";
  }
  if (filterType === "accepted") {
    return active
      ? "border-emerald-300 bg-emerald-500/15 text-emerald-900 hover:bg-emerald-500/20"
      : "border-emerald-200/70 bg-emerald-500/5 text-emerald-900 hover:bg-emerald-500/10";
  }
  if (filterType === "declined") {
    return active ? "border-rose-300 bg-rose-500/15 text-rose-900 hover:bg-rose-500/20" : "border-rose-200/70 bg-rose-500/5 text-rose-900 hover:bg-rose-500/10";
  }
  if (filterType === "suggested_alternative") {
    return active ? "border-amber-300 bg-amber-400/20 text-amber-900 hover:bg-amber-400/25" : "border-amber-200/70 bg-amber-400/10 text-amber-900 hover:bg-amber-400/15";
  }
  return active ? "border-slate-300 bg-slate-500/15 text-slate-900 hover:bg-slate-500/20" : "border-slate-200/80 bg-slate-500/5 text-slate-900 hover:bg-slate-500/10";
}

function dedupeRequests(items: WebinarRequest[]) {
  const map = new Map<string, WebinarRequest>();
  for (const item of items) {
    const key = [
      item.topic.trim().toLowerCase(),
      (item.trainer_name ?? "").trim().toLowerCase(),
      item.requested_date ? new Date(item.requested_date).toISOString() : ""
    ].join("|");
    const existing = map.get(key);
    if (!existing || new Date(item.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      map.set(key, item);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}
