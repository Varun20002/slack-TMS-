"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createTrainerAction } from "@/lib/actions";
import { trainerSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TrainerFormValues = z.input<typeof trainerSchema>;

const defaults: TrainerFormValues = {
  name: "",
  experience: 0,
  investing_trading_persona: "",
  strengths: "",
  product_categories: "",
  nature_of_business: "",
  phone_number: "",
  email: "",
  languages_spoken: "",
  base_city: "",
  credentials_or_claim_to_fame: "",
  certifications: "",
  social_media_handles: ""
};

export function TrainerForm() {
  const [pending, startTransition] = useTransition();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<TrainerFormValues>({
    defaultValues: defaults
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      setTemporaryPassword("");
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => formData.append(key, String(value ?? "")));
      const file = fileRef.current?.files?.[0];
      if (file) formData.append("profile_image", file);
      const res = await createTrainerAction(formData);
      if (!res.success) {
        toast.error("Trainer not created", { description: res.message });
        return;
      }
      toast.success("Trainer created");
      if (res.temporaryPassword) setTemporaryPassword(res.temporaryPassword);
      reset(defaults);
      if (fileRef.current) fileRef.current.value = "";
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <Field label="Name" error={errors.name?.message}>
        <Input required {...register("name", { required: "Name is required." })} />
      </Field>
      <Field label="Experience (years)" error={errors.experience?.message}>
        <Input required type="number" {...register("experience", { required: "Experience is required." })} />
      </Field>
      <Field label="Persona" error={errors.investing_trading_persona?.message}>
        <Input required {...register("investing_trading_persona", { required: "Persona is required." })} />
      </Field>
      <Field label="Strengths" error={errors.strengths?.message}>
        <Input required {...register("strengths", { required: "Strengths is required." })} />
      </Field>
      <Field label="Product categories (comma separated, max 2)" error={errors.product_categories?.message}>
        <Input required {...register("product_categories", { required: "Product categories are required." })} />
      </Field>
      <Field label="Nature of business" error={errors.nature_of_business?.message}>
        <Input required {...register("nature_of_business", { required: "Nature of business is required." })} />
      </Field>
      <Field label="Phone" error={errors.phone_number?.message}>
        <Input required {...register("phone_number", { required: "Phone is required." })} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input required type="email" {...register("email", { required: "Email is required." })} />
      </Field>
      <Field label="Languages spoken" error={errors.languages_spoken?.message}>
        <Input required {...register("languages_spoken", { required: "Languages are required." })} />
      </Field>
      <Field label="Base city" error={errors.base_city?.message}>
        <Input required {...register("base_city", { required: "Base city is required." })} />
      </Field>
      <Field label="Credentials / claim to fame" error={errors.credentials_or_claim_to_fame?.message} className="md:col-span-2">
        <Textarea required {...register("credentials_or_claim_to_fame", { required: "Credentials are required." })} />
      </Field>
      <Field label="Certifications" error={errors.certifications?.message}>
        <Input required {...register("certifications", { required: "Certifications are required." })} />
      </Field>
      <Field label="Social media handles" error={errors.social_media_handles?.message}>
        <Input required placeholder="@x, @youtube" {...register("social_media_handles", { required: "Social handles are required." })} />
      </Field>
      <Field label="Profile photo">
        <Input required ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" />
      </Field>
      <div className="md:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : "Create Trainer"}
        </Button>
      </div>
      {temporaryPassword ? (
        <div className="rounded-lg border bg-muted/40 p-3 md:col-span-2">
          <p className="text-sm font-medium">Temporary password</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={temporaryPassword} readOnly />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(temporaryPassword);
                  toast.success("Temporary password copied");
                } catch {
                  toast.error("Copy failed", { description: "Please copy the password manually." });
                }
              }}
            >
              Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Share this with trainer for first login only. Trainer will be forced to set a new password immediately after first sign-in.
          </p>
        </div>
      ) : null}
    </form>
  );
}

function Field({
  label,
  error,
  className,
  children
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
