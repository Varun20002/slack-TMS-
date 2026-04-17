"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { uploadRatingsCsvAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CsvUploadForm() {
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const file = fileRef.current?.files?.[0];
        if (!file) {
          toast.error("Please select a CSV file.");
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        startTransition(async () => {
          const res = await uploadRatingsCsvAction(formData);
          if (!res.success) {
            toast.error("Upload failed", { description: res.message });
            return;
          }
          toast.success("Ratings uploaded", { description: res.message });
          if (fileRef.current) fileRef.current.value = "";
        });
      }}
    >
      <Input ref={fileRef} type="file" accept=".csv,text/csv" />
      <p className="text-xs text-muted-foreground">CSV columns: trainer_email, webinar_id (optional), rating</p>
      <Button disabled={pending}>{pending ? "Uploading..." : "Upload CSV"}</Button>
    </form>
  );
}
