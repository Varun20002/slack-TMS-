"use client";

import Link from "next/link";
import { BarChart3, CalendarClock, LayoutDashboard, Medal, Settings2, Users, Video } from "lucide-react";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const adminNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/trainers", label: "Trainers", icon: Users },
  { href: "/admin/webinars", label: "Webinars", icon: Video },
  { href: "/admin/leaderboard", label: "Leaderboard", icon: BarChart3 },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarClock },
  { href: "/admin/profile", label: "Profile", icon: Settings2 }
];

const trainerNav: NavItem[] = [
  { href: "/trainer/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainer/webinars", label: "Webinars", icon: Video },
  { href: "/trainer/calendar", label: "Calendar", icon: CalendarClock },
  { href: "/trainer/availability", label: "Availability", icon: CalendarClock },
  { href: "/trainer/achievements", label: "Achievements", icon: Medal },
  { href: "/trainer/leaderboard", label: "Leaderboard", icon: BarChart3 },
  { href: "/trainer/profile", label: "Profile", icon: Settings2 }
];

export function AppShell({
  children,
  role,
  title
}: {
  children: React.ReactNode;
  role: "admin" | "trainer";
  title: string;
}) {
  const pathname = usePathname();
  const nav = role === "admin" ? adminNav : trainerNav;

  return (
    <div className="min-h-screen">
      <aside className="hidden border-r border-border/60 bg-card/60 p-4 backdrop-blur lg:fixed lg:left-0 lg:top-0 lg:block lg:h-screen lg:w-[260px] lg:overflow-y-auto">
        <div className="mb-8 space-y-2">
          <p className="text-xl font-semibold">TrainerOS</p>
          <Badge className="capitalize">{role}</Badge>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-h-screen flex-col lg:ml-[260px] lg:w-[calc(100%-260px)]">
        <header className="fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur lg:left-[260px]">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="w-full flex-1 space-y-6 p-4 pt-20 md:p-6 md:pt-20">{children}</main>
      </div>
    </div>
  );
}
