"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteWebinarAction, updateWebinarAction } from "@/lib/actions";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeRemainingBadge } from "@/components/shared/time-remaining-badge";

type TrainerOption = { id: string; name: string };

type UpcomingWebinar = {
  id: string;
  title: string;
  trainer_id: string;
  webinar_timing: string;
  duration_minutes: number | null;
  target_user_base: string | null;
  requirements: string | null;
  pre_webinar_link: string | null;
  post_webinar_link: string | null;
  google_event_id: string | null;
  google_calendar_sync_error: string | null;
  status: "upcoming" | "completed" | "cancelled";
  trainers?: { name: string } | null;
};

export function UpcomingWebinarsManager({ webinars, trainerOptions }: { webinars: UpcomingWebinar[]; trainerOptions: TrainerOption[] }) {
  const router = useRouter();
  const [items, setItems] = useState<UpcomingWebinar[]>(webinars);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(webinars);
  }, [webinars]);

  const onDelete = (id: string) => {
    if (!window.confirm("Delete this webinar? This action cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteWebinarAction(id);
      if (!res.success) {
        toast.error("Delete failed", { description: res.message });
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) setEditingId(null);
      router.refresh();
      toast.success("Webinar deleted");
    });
  };

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isEditing = editingId === item.id;
        return (
          <div className="rounded-lg border p-3" key={item.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{item.title}</p>
              {item.status === "upcoming" ? <TimeRemainingBadge targetIso={item.webinar_timing} /> : <Badge className="capitalize">{item.status}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.trainers?.name ?? "Unassigned"} • {formatDate(item.webinar_timing)}
            </p>
            <p className="text-xs text-muted-foreground">Duration: {item.duration_minutes ?? 60} minutes</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Google Sync:</span>
              {item.google_calendar_sync_error ? (
                <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Error</Badge>
              ) : item.google_event_id ? (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Connected</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending / Not Connected</Badge>
              )}
            </div>
            {item.google_calendar_sync_error ? <p className="mt-1 text-xs text-destructive">{item.google_calendar_sync_error}</p> : null}
            <p className="mt-1 text-sm">{item.target_user_base ?? "No target audience defined yet."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(isEditing ? null : item.id)}>
                {isEditing ? "Close Edit" : "Edit"}
              </Button>
              <Button type="button" variant="outline" size="sm" className="text-destructive" disabled={pending} onClick={() => onDelete(item.id)}>
                Delete
              </Button>
            </div>

            {isEditing ? (
              <EditForm
                webinar={item}
                trainerOptions={trainerOptions}
                pending={pending}
                onSaved={() => setEditingId(null)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function toInputDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditForm({
  webinar,
  trainerOptions,
  pending,
  onSaved
}: {
  webinar: UpcomingWebinar;
  trainerOptions: TrainerOption[];
  pending: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [working, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      const res = await updateWebinarAction(formData);
      if (!res.success) {
        toast.error("Update failed", { description: res.message });
        return;
      }
      toast.success("Webinar updated");
      router.refresh();
      onSaved();
    });
  };

  return (
    <form action={onSubmit} className="mt-4 grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
      <input type="hidden" name="id" value={webinar.id} />
      <div>
        <Label className="mb-1.5 block">Title</Label>
        <Input name="title" defaultValue={webinar.title} />
      </div>
      <div>
        <Label className="mb-1.5 block">Trainer</Label>
        <Select name="trainer_id" defaultValue={webinar.trainer_id}>
          {trainerOptions.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Timing</Label>
        <Input type="datetime-local" name="webinar_timing" defaultValue={toInputDateTime(webinar.webinar_timing)} />
      </div>
      <div>
        <Label className="mb-1.5 block">Duration (minutes)</Label>
        <Input type="number" min={15} max={480} name="duration_minutes" defaultValue={webinar.duration_minutes ?? 60} />
      </div>
      <div className="md:col-span-2">
        <Label className="mb-1.5 block">Requirements</Label>
        <Textarea name="requirements" defaultValue={webinar.requirements ?? ""} />
      </div>
      <div>
        <Label className="mb-1.5 block">Target user base</Label>
        <Input name="target_user_base" defaultValue={webinar.target_user_base ?? ""} />
      </div>
      <div>
        <Label className="mb-1.5 block">Status</Label>
        <Select name="status" defaultValue={webinar.status}>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Pre-webinar link</Label>
        <Input name="pre_webinar_link" defaultValue={webinar.pre_webinar_link ?? ""} />
      </div>
      <div>
        <Label className="mb-1.5 block">Post-webinar link</Label>
        <Input name="post_webinar_link" defaultValue={webinar.post_webinar_link ?? ""} />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={working || pending}>
          {working ? "Saving..." : "Save Webinar Changes"}
        </Button>
      </div>
    </form>
  );
}
