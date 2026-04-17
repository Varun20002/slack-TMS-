"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { removeAvailabilityAction, upsertAvailabilityAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function AvailabilityManager({
  slots
}: {
  slots: Array<{ id: string; day_of_week: number; start_time: string; end_time: string; timezone: string }>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const res = await upsertAvailabilityAction(formData);
            if (!res.success) {
              toast.error("Could not add slot", { description: res.message });
              return;
            }
            toast.success("Availability added");
            event.currentTarget.reset();
          });
        }}
      >
        <div>
          <Label className="mb-1.5 block">Day</Label>
          <Select name="day_of_week" defaultValue="1">
            {days.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Start time</Label>
          <Input name="start_time" type="time" required />
        </div>
        <div>
          <Label className="mb-1.5 block">End time</Label>
          <Input name="end_time" type="time" required />
        </div>
        <div>
          <Label className="mb-1.5 block">Timezone</Label>
          <Input name="timezone" defaultValue="Asia/Kolkata" required />
        </div>
        <div className="md:col-span-4">
          <Button disabled={pending}>{pending ? "Saving..." : "Add Slot"}</Button>
        </div>
      </form>

      <div className="space-y-2">
        {slots.map((slot) => (
          <div key={slot.id} className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm">
              {days[slot.day_of_week]} • {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)} ({slot.timezone})
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  const res = await removeAvailabilityAction(slot.id);
                  if (!res.success) toast.error(res.message);
                  else toast.success("Slot removed");
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        {!slots.length ? <p className="text-sm text-muted-foreground">No slots added yet.</p> : null}
      </div>
    </div>
  );
}
