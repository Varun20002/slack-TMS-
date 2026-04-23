"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { uploadRatingsCsvAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type WebinarOption = {
  id: string;
  label: string;
};

export function CsvUploadForm({ webinarOptions }: { webinarOptions: WebinarOption[] }) {
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedWebinarId, setSelectedWebinarId] = useState("");
  const [registrationsCount, setRegistrationsCount] = useState("");
  const [attendeesCount, setAttendeesCount] = useState("");
  const selectedWebinar = useMemo(
    () => webinarOptions.find((option) => option.id === selectedWebinarId) ?? null,
    [webinarOptions, selectedWebinarId]
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selectedWebinarId) {
          toast.error("Select a completed webinar first.");
          return;
        }
        const registrations = Number(registrationsCount);
        const attendees = Number(attendeesCount);
        if (!Number.isFinite(registrations) || registrations <= 0) {
          toast.error("Enter a valid registrations count.");
          return;
        }
        if (!Number.isFinite(attendees) || attendees < 0) {
          toast.error("Enter a valid attendees count.");
          return;
        }
        if (attendees > registrations) {
          toast.error("Attendees cannot exceed registrations.");
          return;
        }
        const file = fileRef.current?.files?.[0];
        if (!file) {
          toast.error("Please select a CSV file.");
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("webinar_id", selectedWebinarId);
        formData.append("registrations_count", String(registrations));
        formData.append("attendees_count", String(attendees));
        startTransition(async () => {
          const res = await uploadRatingsCsvAction(formData);
          if (!res.success) {
            toast.error("Upload failed", { description: res.message });
            return;
          }
          toast.success("Ratings uploaded", { description: res.message });
          if (fileRef.current) fileRef.current.value = "";
          setSelectedWebinarId("");
          setRegistrationsCount("");
          setAttendeesCount("");
        });
      }}
    >
      <div className="space-y-2">
        <Label>Completed Webinar</Label>
        <Select value={selectedWebinarId} onChange={(event) => setSelectedWebinarId(event.target.value)}>
          <option value="">Select webinar</option>
          {webinarOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {selectedWebinar ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">Webinar Metrics Input</p>
            <p className="text-xs text-muted-foreground">{selectedWebinar.label}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrations_count">Registrations</Label>
                <Input
                  id="registrations_count"
                  type="number"
                  min={1}
                  value={registrationsCount}
                  onChange={(event) => setRegistrationsCount(event.target.value)}
                  placeholder="e.g. 500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendees_count">Attendees</Label>
                <Input
                  id="attendees_count"
                  type="number"
                  min={0}
                  value={attendeesCount}
                  onChange={(event) => setAttendeesCount(event.target.value)}
                  placeholder="e.g. 320"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Input ref={fileRef} type="file" accept=".csv,text/csv" />
      <p className="text-xs text-muted-foreground">
        Upload survey CSV report. We auto-calculate Session, Speaker, and Coverage averages, then update Attendance Conversion from attendees/registrations.
      </p>
      <Button disabled={pending || !selectedWebinarId}>{pending ? "Uploading..." : "Upload CSV"}</Button>
    </form>
  );
}
