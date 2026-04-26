"use client";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { loginAction } from "@/lib/actions";
import { loginSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.infer<typeof loginSchema>;

export function LoginForm({ role }: { role: "admin" | "trainer" }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors }
  } = useForm<FormValues>({
    defaultValues: { role }
  });

  const onSubmit = handleSubmit(async (values) => {
    clearErrors();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password" || field === "role") {
          setError(field, { type: "manual", message: issue.message });
        }
      }
      toast.error("Check your credentials", { description: "Enter a valid email and password (minimum 4 characters)." });
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await loginAction(parsed.data);

      if (!result.success) {
        toast.error("Login failed", { description: result.message });
        return;
      }
      toast.success("Login successful");
      router.replace((result as { redirectTo?: string }).redirectTo ?? "/");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error during login.";
      toast.error("Login failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  });

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  function handleTogglePassword() {
    if (showPassword) {
      setShowPassword(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
      return;
    }

    setShowPassword(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowPassword(false);
      hideTimerRef.current = null;
    }, 5000);
  }

  return (
    <Card className="w-full max-w-md border-border/70 bg-card/95 shadow-lg">
      <CardHeader>
        <CardTitle>{role === "admin" ? "Admin Login" : "Trainer Login"}</CardTitle>
        <CardDescription>
          {role === "admin" ? "Use your admin account to manage trainers and webinars." : "Use your trainer account to access your workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <input type="hidden" value={role} {...register("role")} />
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              autoComplete="email"
              {...register("email", {
                onChange: () => clearErrors("email")
              })}
              placeholder="name@company.com"
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                {...register("password", {
                  onChange: () => clearErrors("password")
                })}
                placeholder="Enter password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={handleTogglePassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            {!errors.password ? <p className="text-xs text-muted-foreground">Password must be at least 4 characters.</p> : null}
            {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
