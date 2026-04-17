"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createWebinarAction } from "@/lib/actions";
import { webinarSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type WebinarFormValues = z.input<typeof webinarSchema>;

export function WebinarForm({ trainerOptions }: { trainerOptions: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<WebinarFormValues>({
    resolver: zodResolver(webinarSchema),
    defaultValues: {
      trainer_id: "",
      title: "",
      requirements: "",
      target_user_base: "",
      webinar_timing: "",
      duration_minutes: 60,
      pre_webinar_link: "",
      post_webinar_link: "",
      google_calendar_embed_url: "",
      status: "upcoming"
    }
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => formData.append(key, String(value ?? "")));
      const res = await createWebinarAction(formData);
      if (!res.success) {
        toast.error("Webinar creation failed", { description: res.message });
        return;
      }
      toast.success("Webinar scheduled");
      reset();
    });
  });

  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
      <div>
        <Label className="mb-1.5 block">Trainer</Label>
        <Select {...register("trainer_id")}>
          <option value="">Select trainer</option>
          {trainerOptions.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
            </option>
          ))}
        </Select>
        {errors.trainer_id ? <p className="mt-1 text-xs text-destructive">{errors.trainer_id.message}</p> : null}
      </div>
      <div>
        <Label className="mb-1.5 block">Title</Label>
        <Input {...register("title")} />
      </div>
      <div className="md:col-span-2">
        <Label className="mb-1.5 block">Requirements</Label>
        <Textarea {...register("requirements")} />
      </div>
      <div>
        <Label className="mb-1.5 block">Target user base</Label>
        <Input {...register("target_user_base")} />
      </div>
      <div>
        <Label className="mb-1.5 block">Timing (ISO datetime)</Label>
        <Input type="datetime-local" {...register("webinar_timing")} />
      </div>
      <div>
        <Label className="mb-1.5 block">Duration (minutes)</Label>
        <Input type="number" min={15} max={480} {...register("duration_minutes")} />
      </div>
      <div>
        <Label className="mb-1.5 block">Pre-webinar link</Label>
        <Input {...register("pre_webinar_link")} />
      </div>
      <div>
        <Label className="mb-1.5 block">Post-webinar link</Label>
        <Input {...register("post_webinar_link")} />
      </div>
      <div className="flex items-end">
        <p className="text-xs text-muted-foreground">Google Calendar event link will be generated automatically from start time + duration.</p>
      </div>
      <div>
        <Label className="mb-1.5 block">Status</Label>
        <Select {...register("status")}>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Schedule Webinar"}
        </Button>
      </div>
    </form>
  );
}
