import { describe, expect, it } from "vitest";
import { buildGoogleCalendarEventUrl, cn, formatDate, formatPercent } from "@/lib/utils";

describe("cn()", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-2")).toBe("px-2 py-2");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "skip", "keep")).toBe("base keep");
  });

  it("deduplicates / overrides with tailwind-merge", () => {
    // px-2 then px-4 → last one wins
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("formatPercent()", () => {
  it("formats 0.75 as 75%", () => {
    expect(formatPercent(0.75)).toBe("75%");
  });

  it("rounds 0.333 to 33%", () => {
    expect(formatPercent(0.333)).toBe("33%");
  });

  it("handles 0", () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it("handles 1 (100%)", () => {
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatDate()", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatDate("2026-04-29T11:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-04-29T11:00:00.000Z");
    expect(typeof formatDate(d)).toBe("string");
  });

  it("contains the year 2026 for a 2026 date", () => {
    expect(formatDate("2026-04-29T11:00:00.000Z")).toContain("2026");
  });
});

describe("buildGoogleCalendarEventUrl()", () => {
  const base = {
    title: "Options 101",
    start: new Date("2026-04-29T11:00:00.000Z"),
    end: new Date("2026-04-29T12:00:00.000Z")
  };

  it("returns a Google Calendar render URL", () => {
    const url = buildGoogleCalendarEventUrl(base);
    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("TEMPLATE");
  });

  it("includes the event title in the URL", () => {
    const url = buildGoogleCalendarEventUrl(base);
    // URLSearchParams encodes spaces as '+' not '%20'
    expect(url).toContain("Options+101");
  });

  it("includes a valid dates= parameter", () => {
    const url = buildGoogleCalendarEventUrl(base);
    expect(url).toMatch(/dates=\d{8}T\d{6}Z/);
  });

  it("includes the optional description", () => {
    const url = buildGoogleCalendarEventUrl({ ...base, description: "Beginner session" });
    expect(url).toContain("Beginner+session");
  });
});
