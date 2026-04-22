"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { completeTrainerFirstLoginAction } from "@/lib/actions";
import { trainerFirstLoginSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = z.infer<typeof trainerFirstLoginSchema>;

export function TrainerFirstLoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<Values>({
    resolver: zodResolver(trainerFirstLoginSchema),
    defaultValues: { password: "", confirmPassword: "" }
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("password", values.password);
      formData.append("confirmPassword", values.confirmPassword);
      const res = await completeTrainerFirstLoginAction(formData);
      if (!res.success) {
        toast.error("Password update failed", { description: res.message });
        return;
      }
      toast.success("Password updated");
      router.replace(res.redirectTo ?? "/trainer/dashboard");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
        {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword.message}</p> : null}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Updating..." : "Set New Password"}
      </Button>
    </form>
  );
}
