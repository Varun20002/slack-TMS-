"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendContactOtpAction, updateProfileFieldAction, verifyContactOtpAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldKey = "full_name" | "phone" | "email";

export function ProfileForm({ defaults }: { defaults: { full_name: string; phone: string; email: string } }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(defaults);
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSentFor, setOtpSentFor] = useState<"phone" | "email" | null>(null);

  const fields: Array<{ key: FieldKey; label: string; type?: "text" | "email" }> = [
    { key: "full_name", label: "Full name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email", type: "email" }
  ];

  function startEdit(field: FieldKey) {
    setEditingField(field);
    setDraft(values[field]);
  }

  function cancelEdit() {
    setEditingField(null);
    setDraft("");
    setOtpCode("");
    setOtpSentFor(null);
  }

  function saveField(field: FieldKey) {
    startTransition(async () => {
      const res = await updateProfileFieldAction(field, draft);
      if (!res.success) {
        toast.error("Update failed", { description: res.message });
        return;
      }

      setValues((prev) => ({ ...prev, [field]: draft }));
      setEditingField(null);
      setDraft("");
      setOtpCode("");
      setOtpSentFor(null);
      toast.success("Field updated");
    });
  }

  function sendOtp(field: "phone" | "email") {
    startTransition(async () => {
      const res = await sendContactOtpAction(field, draft);
      if (!res.success) {
        toast.error("OTP send failed", { description: res.message });
        return;
      }
      setOtpSentFor(field);
      toast.success(res.message);
    });
  }

  function verifyOtpAndSave(field: "phone" | "email") {
    startTransition(async () => {
      const res = await verifyContactOtpAction(field, draft, otpCode);
      if (!res.success) {
        toast.error("OTP verification failed", { description: res.message });
        return;
      }
      setValues((prev) => ({ ...prev, [field]: draft }));
      setEditingField(null);
      setDraft("");
      setOtpCode("");
      setOtpSentFor(null);
      toast.success(res.message);
    });
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const isEditing = editingField === field.key;
        return (
          <div key={field.key} className="rounded-xl border border-border/60 p-3">
            <Label className="mb-2 block text-sm text-muted-foreground">{field.label}</Label>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <Input
                  type={field.type ?? "text"}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="h-10 bg-background"
                />
              ) : (
                <div className="flex h-10 flex-1 items-center rounded-lg bg-transparent px-1 text-sm">{values[field.key] || "-"}</div>
              )}

              {isEditing ? (
                <>
                  {field.key === "full_name" ? (
                    <Button size="sm" onClick={() => saveField(field.key)} disabled={pending}>
                      <Check className="mr-1 h-4 w-4" />
                      Save
                    </Button>
                  ) : otpSentFor === field.key && (field.key === "email" || field.key === "phone") ? (
                    <>
                      <Input
                        value={otpCode}
                        onChange={(event) => setOtpCode(event.target.value)}
                        placeholder="Enter OTP"
                        className="h-10 w-28 bg-background"
                      />
                      <Button size="sm" onClick={() => verifyOtpAndSave(field.key as "email" | "phone")} disabled={pending}>
                        <Check className="mr-1 h-4 w-4" />
                        Verify
                      </Button>
                    </>
                  ) : field.key === "email" || field.key === "phone" ? (
                    <Button size="sm" onClick={() => sendOtp(field.key as "email" | "phone")} disabled={pending}>
                      Send OTP
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={pending}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => startEdit(field.key)} aria-label={`Edit ${field.label}`}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
