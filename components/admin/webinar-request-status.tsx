import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

export function WebinarRequestStatus({
  requests,
  errorMessage
}: {
  requests: WebinarRequest[];
  errorMessage?: string;
}) {
  const raised = dedupeRequests(requests.filter((r) => r.state === "RAISED" || r.state === "PENDING_APPROVAL"));
  const accepted = dedupeRequests(requests.filter((r) => r.state === "CONFIRMED" || r.state === "IN_PROGRESS"));
  const declined = dedupeRequests(requests.filter((r) => r.state === "REJECTED" || r.state === "CANCELLED"));
  const suggestedAlternative = dedupeRequests(requests.filter((r) => r.state === "ALT_SUGGESTED"));

  const stageSections = [
    { title: "Raised", items: raised },
    { title: "Accepted", items: accepted },
    { title: "Declined", items: declined },
    { title: "Suggested Alternative", items: suggestedAlternative }
  ] as const;

  function countBadge(items: WebinarRequest[]) {
    return <Badge className="ml-2">{items.length}</Badge>;
  }

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
          <div className="grid gap-4 xl:grid-cols-2">
            {stageSections.map((section) => (
              <div key={section.title} className="rounded-lg border">
                <div
                  className={`flex items-center justify-between border-b px-3 py-2 ${
                    section.title === "Raised"
                      ? "bg-blue-500/10 text-blue-900 dark:text-blue-200"
                      : section.title === "Accepted"
                        ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                        : section.title === "Suggested Alternative"
                          ? "bg-amber-400/15 text-amber-900 dark:text-amber-200"
                          : "bg-rose-500/10 text-rose-900 dark:text-rose-200"
                  }`}
                >
                  <p className="text-sm font-semibold">{section.title}</p>
                  {countBadge(section.items)}
                </div>
                <div className="max-h-[340px] space-y-2 overflow-auto p-3">
                  {!section.items.length ? (
                    <p className="text-sm text-muted-foreground">No requests.</p>
                  ) : (
                    section.items.map((request) => (
                      <div key={request.id} className="rounded-md border p-2">
                        <p className="font-medium">{request.topic}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.trainer_name ?? "Unassigned"} • Requested {request.requested_date ? formatDate(request.requested_date) : "-"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Last updated: {formatDate(request.updated_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
