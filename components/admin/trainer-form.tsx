"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
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
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<TrainerFormValues>({
    resolver: zodResolver(trainerSchema),
    defaultValues: defaults
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => formData.append(key, String(value ?? "")));
      const res = await createTrainerAction(formData);
      if (!res.success) {
        toast.error("Trainer not created", { description: res.message });
        return;
      }
      toast.success("Trainer created");
      reset(defaults);
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} />
      </Field>
      <Field label="Experience (years)" error={errors.experience?.message}>
        <Input type="number" {...register("experience")} />
      </Field>
      <Field label="Persona" error={errors.investing_trading_persona?.message}>
        <Input {...register("investing_trading_persona")} />
      </Field>
      <Field label="Strengths" error={errors.strengths?.message}>
        <Input {...register("strengths")} />
      </Field>
      <Field label="Product categories (comma separated, max 2)" error={errors.product_categories?.message}>
        <Input {...register("product_categories")} />
      </Field>
      <Field label="Nature of business" error={errors.nature_of_business?.message}>
        <Input {...register("nature_of_business")} />
      </Field>
      <Field label="Phone" error={errors.phone_number?.message}>
        <Input {...register("phone_number")} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} />
      </Field>
      <Field label="Languages spoken" error={errors.languages_spoken?.message}>
        <Input {...register("languages_spoken")} />
      </Field>
      <Field label="Base city" error={errors.base_city?.message}>
        <Input {...register("base_city")} />
      </Field>
      <Field label="Credentials / claim to fame" error={errors.credentials_or_claim_to_fame?.message} className="md:col-span-2">
        <Textarea {...register("credentials_or_claim_to_fame")} />
      </Field>
      <Field label="Certifications" error={errors.certifications?.message}>
        <Input {...register("certifications")} />
      </Field>
      <Field label="Social media handles" error={errors.social_media_handles?.message}>
        <Input placeholder="@x, @youtube" {...register("social_media_handles")} />
      </Field>
      <div className="md:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : "Create Trainer"}
        </Button>
      </div>
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
