import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function toGoogleUtcDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildGoogleCalendarEventUrl(input: {
  title: string;
  description?: string;
  start: Date;
  end: Date;
}) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    details: input.description ?? "",
    dates: `${toGoogleUtcDate(input.start)}/${toGoogleUtcDate(input.end)}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
