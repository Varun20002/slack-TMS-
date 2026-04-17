import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("trainer");
  return (
    <AppShell role="trainer" title="Trainer Workspace">
      {children}
    </AppShell>
  );
}
