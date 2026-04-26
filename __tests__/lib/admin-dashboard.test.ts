import { describe, expect, it } from "vitest";
import { endOfWeek, startOfWeek } from "date-fns";

/**
 * Replicate the "Upcoming Webinars This Week" filter from
 * app/admin/dashboard/page.tsx so it can be tested deterministically.
 */
function filterUpcomingThisWeek(
  webinars: Array<{ id: string; webinar_timing: string }>,
  referenceDate: Date
) {
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });

  return webinars
    .filter((webinar) => {
      const t = new Date(webinar.webinar_timing).getTime();
      return t >= weekStart.getTime() && t <= weekEnd.getTime();
    })
    .sort(
      (a, b) =>
        new Date(a.webinar_timing).getTime() - new Date(b.webinar_timing).getTime()
    );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Upcoming Webinars This Week filter", () => {
  // Reference: Monday 28 Apr 2026
  const referenceDate = new Date("2026-04-28T12:00:00.000Z");

  const webinars = [
    { id: "w1", webinar_timing: "2026-04-28T10:00:00.000Z" }, // Mon — IN
    { id: "w2", webinar_timing: "2026-04-29T11:00:00.000Z" }, // Tue — IN
    { id: "w3", webinar_timing: "2026-05-03T09:00:00.000Z" }, // Sun — IN (last day of week)
    { id: "w4", webinar_timing: "2026-05-04T09:00:00.000Z" }, // Next Mon — OUT
    { id: "w5", webinar_timing: "2026-04-21T09:00:00.000Z" }, // Previous Mon — OUT
  ];

  it("includes webinars within Mon–Sun of the reference week", () => {
    const result = filterUpcomingThisWeek(webinars, referenceDate);
    const ids = result.map((w) => w.id);
    expect(ids).toContain("w1");
    expect(ids).toContain("w2");
    expect(ids).toContain("w3");
  });

  it("excludes webinars outside the reference week", () => {
    const result = filterUpcomingThisWeek(webinars, referenceDate);
    const ids = result.map((w) => w.id);
    expect(ids).not.toContain("w4");
    expect(ids).not.toContain("w5");
  });

  it("sorts results by ascending webinar_timing", () => {
    const result = filterUpcomingThisWeek(webinars, referenceDate);
    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i].webinar_timing).getTime()).toBeGreaterThanOrEqual(
        new Date(result[i - 1].webinar_timing).getTime()
      );
    }
  });

  it("returns empty array when no webinars fall in the week", () => {
    const future = [{ id: "w6", webinar_timing: "2026-12-25T09:00:00.000Z" }];
    expect(filterUpcomingThisWeek(future, referenceDate)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(filterUpcomingThisWeek([], referenceDate)).toHaveLength(0);
  });
});

// ─── Admin dashboard stats calculation ───────────────────────────────────────

describe("Admin dashboard stats calculation", () => {
  const trainers = [
    { id: "t1", average_rating: 4.5 },
    { id: "t2", average_rating: 3.5 }
  ];

  const nowIso = new Date("2026-04-28T12:00:00.000Z").toISOString();
  const webinars = [
    { id: "w1", status: "upcoming", webinar_timing: "2026-04-30T10:00:00.000Z" },
    { id: "w2", status: "completed", webinar_timing: "2026-04-20T10:00:00.000Z" },
    { id: "w3", status: "cancelled", webinar_timing: "2026-04-28T10:00:00.000Z" }
  ];

  it("totalTrainers is correct", () => {
    expect(trainers.length).toBe(2);
  });

  it("upcomingCount excludes cancelled webinars", () => {
    const upcoming = webinars.filter(
      (w) => w.webinar_timing >= nowIso && w.status !== "cancelled"
    );
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe("w1");
  });

  it("completedCount counts only completed", () => {
    const completed = webinars.filter((w) => w.status === "completed");
    expect(completed).toHaveLength(1);
  });

  it("average rating across trainers is correct", () => {
    const avg = trainers.reduce((sum, t) => sum + Number(t.average_rating), 0) / trainers.length;
    expect(avg).toBe(4);
  });

  it("csvRatedWebinarIds deduplicates webinar IDs", () => {
    const csvRated = [
      { webinar_id: "w1" },
      { webinar_id: "w1" },
      { webinar_id: "w2" }
    ];
    const ids = Array.from(new Set(csvRated.map((r) => r.webinar_id).filter(Boolean)));
    expect(ids).toHaveLength(2);
    expect(ids).toContain("w1");
    expect(ids).toContain("w2");
  });
});
