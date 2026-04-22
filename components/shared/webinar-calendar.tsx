"use client";

import { addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
  description,
  interactiveDateDetails = false
}: {
  events: WebinarCalendarEvent[];
  title: string;
  description: string;
  interactiveDateDetails?: boolean;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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
                role={interactiveDateDetails ? "button" : undefined}
                tabIndex={interactiveDateDetails ? 0 : undefined}
                onClick={interactiveDateDetails ? () => setSelectedDate(day) : undefined}
                onKeyDown={
                  interactiveDateDetails
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDate(day);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "min-h-28 rounded-lg border p-2",
                  interactiveDateDetails ? "cursor-pointer hover:border-primary/50 hover:bg-muted/20" : "",
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
      {interactiveDateDetails && selectedDate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          onClick={() => setSelectedDate(null)}
        >
          <Card className="max-h-[80vh] w-full max-w-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{format(selectedDate, "EEEE, d MMMM yyyy")}</CardTitle>
                <CardDescription>All webinars scheduled for this date.</CardDescription>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedDate(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto">
              {events
                .filter((event) => isSameDay(new Date(event.start), selectedDate))
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                .map((event) => {
                  const start = new Date(event.start);
                  const end = new Date(event.end);
                  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
                  return (
                    <div key={event.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{event.title}</p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                            event.status === "cancelled"
                              ? "bg-destructive/15 text-destructive"
                              : event.status === "completed"
                                ? "bg-muted text-foreground"
                                : "bg-primary/15 text-primary"
                          )}
                        >
                          {event.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {format(start, "p")} - {format(end, "p")} ({durationMinutes} min)
                      </p>
                      {event.trainerName ? <p className="text-sm text-muted-foreground">Trainer: {event.trainerName}</p> : null}
                      {event.googleLink ? (
                        <a href={event.googleLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary underline">
                          Open Google Calendar Link
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              {!events.some((event) => isSameDay(new Date(event.start), selectedDate)) ? (
                <p className="text-sm text-muted-foreground">No webinars on this date.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
