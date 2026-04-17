"use client";

import { addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

type WebinarCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  status: "upcoming" | "completed" | "cancelled";
  trainerName?: string | null;
  googleLink?: string | null;
};

export function WebinarCalendar({
  events,
  title,
  description
}: {
  events: WebinarCalendarEvent[];
  title: string;
  description: string;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const items: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      items.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return items;
  }, [currentMonth]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-32 text-center text-sm font-medium">{format(currentMonth, "MMMM yyyy")}</p>
          <Button size="sm" variant="outline" onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div key={label} className="px-2 py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const dayEvents = events.filter((event) => isSameDay(new Date(event.start), day));
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-28 rounded-lg border p-2",
                  isSameMonth(day, currentMonth) ? "bg-card" : "bg-muted/30 text-muted-foreground"
                )}
              >
                <p className="mb-2 text-xs font-semibold">{format(day, "d")}</p>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <a
                      key={event.id}
                      href={event.googleLink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "block rounded-md px-2 py-1 text-[11px] leading-tight",
                        event.status === "cancelled"
                          ? "bg-destructive/15 text-destructive"
                          : event.status === "completed"
                            ? "bg-muted text-foreground"
                            : "bg-primary/15 text-primary"
                      )}
                    >
                      <p className="truncate font-medium">{event.title}</p>
                      <p className="truncate opacity-80">{formatDate(event.start)}</p>
                      {event.trainerName ? <p className="truncate opacity-80">{event.trainerName}</p> : null}
                    </a>
                  ))}
                  {dayEvents.length > 3 ? <p className="text-[11px] text-muted-foreground">+{dayEvents.length - 3} more</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
