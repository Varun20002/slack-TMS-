import { LoginForm } from "@/components/auth/login-form";

export default function TrainerLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoginForm role="trainer" />
    </main>
  );
}
