"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Calendar, Clock, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface UpcomingWebinarCardProps {
  title: string;
  webinarTiming: string;
  targetUserBase?: string | null;
  requirements?: string | null;
  scheduleHref: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  isLive: boolean;
}

function getTimeRemaining(targetIso: string): TimeRemaining {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, isLive: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    isLive: false,
  };
}

export function UpcomingWebinarCard({
  title,
  webinarTiming,
  requirements,
  scheduleHref,
}: UpcomingWebinarCardProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

  useEffect(() => {
    setTimeRemaining(getTimeRemaining(webinarTiming));
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(webinarTiming));
    }, 30_000);
    return () => clearInterval(interval);
  }, [webinarTiming]);

  const webinarDate = new Date(webinarTiming);
  const month = webinarDate.toLocaleDateString(undefined, { month: "short" });
  const day = webinarDate.getDate();
  const weekday = webinarDate.toLocaleDateString(undefined, { weekday: "short" });
  const time = webinarDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const countdownItems = [
    { label: "Days", value: timeRemaining?.days ?? 0 },
    { label: "Hours", value: timeRemaining?.hours ?? 0 },
    { label: "Minutes", value: timeRemaining?.minutes ?? 0 },
  ];

  return (
    <Card className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-background via-background to-primary/5 transition-shadow hover:shadow-md">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <CardContent className="relative space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Upcoming Webinar
            </div>
            <h2 className="text-xl font-bold leading-tight tracking-tight md:text-2xl">
              {title}
            </h2>
          </div>
          <Button asChild className="group h-10 shrink-0 px-5 sm:self-start">
            <Link href={scheduleHref} className="inline-flex items-center whitespace-nowrap">
              <span>View my schedule</span>
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[160px,1fr] md:items-stretch">
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-md md:flex-col md:items-stretch md:justify-center md:text-center">
            <div className="md:space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest opacity-90">
                {month}
              </div>
              <div className="text-4xl font-bold leading-none md:my-1 md:text-5xl">{day}</div>
              <div className="text-xs font-medium uppercase opacity-90">{weekday}</div>
            </div>
            <div className="ml-3 border-l border-primary-foreground/20 pl-3 md:ml-0 md:mt-3 md:border-l-0 md:border-t md:pl-0 md:pt-3">
              <div className="flex items-center gap-1.5 text-sm font-medium md:justify-center">
                <Clock className="h-3.5 w-3.5" />
                <span>{time}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border bg-muted/40 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {timeRemaining?.isLive ? "Happening now" : "Starts in"}
            </div>
            <div className="grid flex-1 grid-cols-3 gap-2">
              {countdownItems.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center justify-center rounded-lg border bg-background p-3 text-center"
                >
                  <div className="text-2xl font-bold tabular-nums text-primary md:text-3xl">
                    {String(item.value).padStart(2, "0")}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Requirements
              </div>
              <p className="text-sm text-foreground">
                {requirements ?? "No requirements listed."}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
