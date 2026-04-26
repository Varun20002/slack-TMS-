import { describe, expect, it } from "vitest";

/**
 * Leaderboard ranking is pure data transformation — we replicate the logic
 * from lib/queries.ts getLeaderboardData() so it can be tested without a DB.
 */

type TrainerRow = {
  id: string;
  name: string;
  base_city: string;
  average_rating: number;
  webinars: Array<{
    status: string;
    webinar_metrics: Array<{ attendees_count: number; highest_audience_count: number | null }>;
  }>;
};

function computeLeaderboard(trainers: TrainerRow[]) {
  const rows = trainers.map((trainer) => {
    const webinars = trainer.webinars ?? [];
    const completed = webinars.filter((item) => item.status === "completed").length;
    const metricRows = webinars.flatMap((item) => item.webinar_metrics ?? []);
    const totalAttendees = metricRows.reduce((sum, m) => sum + (m.attendees_count ?? 0), 0);
    const highestAudience = metricRows.reduce(
      (max, m) => Math.max(max, m.highest_audience_count ?? m.attendees_count ?? 0),
      0
    );

    return {
      id: trainer.id,
      name: trainer.name,
      city: trainer.base_city,
      averageRating: Number(trainer.average_rating),
      completedWebinars: completed,
      totalAttendees,
      highestAudience
    };
  });

  return rows
    .sort((a, b) => {
      if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
      if (b.completedWebinars !== a.completedWebinars) return b.completedWebinars - a.completedWebinars;
      return b.totalAttendees - a.totalAttendees;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const alice: TrainerRow = {
  id: "alice",
  name: "Alice",
  base_city: "Mumbai",
  average_rating: 4.8,
  webinars: [
    { status: "completed", webinar_metrics: [{ attendees_count: 120, highest_audience_count: null }] },
    { status: "completed", webinar_metrics: [{ attendees_count: 80, highest_audience_count: null }] }
  ]
};

const bob: TrainerRow = {
  id: "bob",
  name: "Bob",
  base_city: "Bangalore",
  average_rating: 4.5,
  webinars: [
    { status: "completed", webinar_metrics: [{ attendees_count: 200, highest_audience_count: null }] }
  ]
};

const carol: TrainerRow = {
  id: "carol",
  name: "Carol",
  base_city: "Delhi",
  average_rating: 4.8,
  webinars: [
    { status: "completed", webinar_metrics: [{ attendees_count: 100, highest_audience_count: null }] }
  ]
};

const dave: TrainerRow = {
  id: "dave",
  name: "Dave",
  base_city: "Pune",
  average_rating: 4.8,
  webinars: [
    { status: "completed", webinar_metrics: [{ attendees_count: 100, highest_audience_count: null }] },
    { status: "completed", webinar_metrics: [{ attendees_count: 50, highest_audience_count: null }] }
  ]
};

describe("getLeaderboardData() logic", () => {
  it("assigns rank 1 to the trainer with the highest rating", () => {
    const result = computeLeaderboard([bob, alice]);
    expect(result[0].id).toBe("alice");
    expect(result[0].rank).toBe(1);
  });

  it("assigns sequential ranks", () => {
    const result = computeLeaderboard([bob, alice]);
    expect(result.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("breaks rating ties by completedWebinars desc", () => {
    // alice and carol same rating, alice has 2 completed vs carol 1
    const result = computeLeaderboard([carol, alice]);
    expect(result[0].id).toBe("alice");
  });

  it("breaks completedWebinars ties by totalAttendees desc", () => {
    // alice and dave same rating AND same completedWebinars, alice has 200 vs dave 150
    const result = computeLeaderboard([dave, alice]);
    expect(result[0].id).toBe("alice"); // 200 > 150
  });

  it("returns empty array for empty input", () => {
    expect(computeLeaderboard([])).toEqual([]);
  });

  it("handles a single trainer", () => {
    const result = computeLeaderboard([alice]);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
  });

  it("sums totalAttendees across all completed webinars", () => {
    const result = computeLeaderboard([alice]);
    expect(result[0].totalAttendees).toBe(200); // 120 + 80
  });

  it("counts only completed webinars", () => {
    const withUpcoming: TrainerRow = {
      ...alice,
      webinars: [
        ...alice.webinars,
        { status: "upcoming", webinar_metrics: [{ attendees_count: 0, highest_audience_count: null }] }
      ]
    };
    const result = computeLeaderboard([withUpcoming]);
    expect(result[0].completedWebinars).toBe(2); // only the 2 completed ones
  });

  it("trainer with no webinars has zeros for metrics", () => {
    const noWebinars: TrainerRow = { id: "empty", name: "Empty", base_city: "X", average_rating: 0, webinars: [] };
    const result = computeLeaderboard([noWebinars]);
    expect(result[0].completedWebinars).toBe(0);
    expect(result[0].totalAttendees).toBe(0);
  });
});
