import { describe, expect, it } from "vitest";
import {
  compactTitle,
  cumulativeAverage,
  filterSurveyRowsByTitle,
  findSurveyHeaderIndex,
  normalizeCell,
  parseRating,
  parseSurveyRows,
  sanitizeFileName
} from "@/lib/csv-helpers";

// ─── normalizeCell ─────────────────────────────────────────────────────────────

describe("normalizeCell()", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeCell("  Session Overall  ")).toBe("session overall");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeCell("session  overall")).toBe("session overall");
  });

  it("handles null", () => {
    expect(normalizeCell(null)).toBe("");
  });

  it("handles undefined", () => {
    expect(normalizeCell(undefined)).toBe("");
  });

  it("handles numbers", () => {
    expect(normalizeCell(42)).toBe("42");
  });
});

// ─── compactTitle ──────────────────────────────────────────────────────────────

describe("compactTitle()", () => {
  it("strips non-alphanumeric chars and lowercases", () => {
    expect(compactTitle("Options Risk Framework!")).toBe("optionsriskframework");
  });

  it("handles null", () => {
    expect(compactTitle(null)).toBe("");
  });

  it("collapses spaces before stripping", () => {
    expect(compactTitle("Hello World")).toBe("helloworld");
  });
});

// ─── parseRating ──────────────────────────────────────────────────────────────

describe("parseRating()", () => {
  it("parses valid rating 1–5", () => {
    expect(parseRating("4")).toBe(4);
    expect(parseRating("1")).toBe(1);
    expect(parseRating("5")).toBe(5);
  });

  it("parses floating point within range", () => {
    expect(parseRating("4.5")).toBe(4.5);
  });

  it("returns null for 0", () => {
    expect(parseRating("0")).toBeNull();
  });

  it("returns null for value > 5", () => {
    expect(parseRating("6")).toBeNull();
  });

  it("returns null for non-numeric", () => {
    expect(parseRating("good")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRating("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseRating(null)).toBeNull();
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseRating("  3  ")).toBe(3);
  });
});

// ─── findSurveyHeaderIndex ────────────────────────────────────────────────────

describe("findSurveyHeaderIndex()", () => {
  const surveyHeader = ["#", "Meeting/Webinar ID", "Topic", "How did you like the session overall?", "Extra"];
  const nonHeader = ["Name", "Email", "Rating"];

  it("finds the correct header row", () => {
    const grid = [nonHeader, surveyHeader, ["1", "abc-123", "Options 101", "4", ""]];
    expect(findSurveyHeaderIndex(grid)).toBe(1);
  });

  it("returns -1 when no survey header exists", () => {
    expect(findSurveyHeaderIndex([nonHeader])).toBe(-1);
  });

  it("returns -1 for an empty grid", () => {
    expect(findSurveyHeaderIndex([])).toBe(-1);
  });

  it("matches case-insensitively", () => {
    const upper = ["#", "MEETING/WEBINAR ID", "TOPIC", "SESSION OVERALL", "EXTRA"];
    expect(findSurveyHeaderIndex([upper])).toBe(0);
  });
});

// ─── parseSurveyRows ──────────────────────────────────────────────────────────

describe("parseSurveyRows()", () => {
  const topicIdx = 0;
  const sessionIdx = 1;

  it("parses valid rows", () => {
    const rows = [
      ["Options 101", "4"],
      ["Options 101", "5"],
      ["Options 101", "3"]
    ];
    const result = parseSurveyRows(rows, topicIdx, sessionIdx);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ topic: "Options 101", session: 4 });
  });

  it("skips rows where session rating is out of range", () => {
    const rows = [
      ["Webinar A", "0"],
      ["Webinar B", "4"],
      ["Webinar C", "6"]
    ];
    const result = parseSurveyRows(rows, topicIdx, sessionIdx);
    expect(result).toHaveLength(1);
    expect(result[0].session).toBe(4);
  });

  it("skips completely empty rows", () => {
    const rows = [["", ""], ["Options 101", "4"], ["", ""]];
    const result = parseSurveyRows(rows, topicIdx, sessionIdx);
    expect(result).toHaveLength(1);
  });

  it("skips rows with empty topic", () => {
    const rows = [["", "4"]];
    const result = parseSurveyRows(rows, topicIdx, sessionIdx);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseSurveyRows([], topicIdx, sessionIdx)).toEqual([]);
  });
});

// ─── filterSurveyRowsByTitle ──────────────────────────────────────────────────

describe("filterSurveyRowsByTitle()", () => {
  const rows = [
    { topic: "Options Risk Framework", session: 4 },
    { topic: "Futures Basics", session: 3 },
    { topic: "Options Risk", session: 5 }
  ];

  it("returns rows matching the webinar title substring", () => {
    const result = filterSurveyRowsByTitle(rows, "Options Risk Framework");
    expect(result).toHaveLength(2); // exact + partial match
    expect(result.every((r) => r.topic.toLowerCase().includes("options risk"))).toBe(true);
  });

  it("falls back to all rows when nothing matches", () => {
    const result = filterSurveyRowsByTitle(rows, "Completely Different Webinar");
    expect(result).toHaveLength(3);
  });

  it("matching is case-insensitive via compactTitle", () => {
    const result = filterSurveyRowsByTitle(rows, "OPTIONS RISK FRAMEWORK");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── cumulativeAverage ────────────────────────────────────────────────────────

describe("cumulativeAverage()", () => {
  it("calculates correct average for [5, 4, 5, 4, 4]", () => {
    expect(cumulativeAverage([5, 4, 5, 4, 4])).toBeCloseTo(4.4);
  });

  it("after adding [4, 4, 4, 4], all 9 values average to ~4.22", () => {
    const allRatings = [5, 4, 5, 4, 4, 4, 4, 4, 4];
    expect(cumulativeAverage(allRatings)).toBeCloseTo(4.22, 1);
  });

  it("returns 0 for empty array", () => {
    expect(cumulativeAverage([])).toBe(0);
  });

  it("returns the only value for a single-element array", () => {
    expect(cumulativeAverage([4])).toBe(4);
  });

  it("averages correctly for all 5s", () => {
    expect(cumulativeAverage([5, 5, 5])).toBe(5);
  });
});

// ─── sanitizeFileName ─────────────────────────────────────────────────────────

describe("sanitizeFileName()", () => {
  it("lowercases the filename", () => {
    expect(sanitizeFileName("Profile.PNG")).toBe("profile.png");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFileName("my file name.jpg")).toBe("my-file-name.jpg");
  });

  it("replaces special characters with hyphens", () => {
    expect(sanitizeFileName("file@name!.jpg")).toBe("file-name-.jpg");
  });

  it("keeps dots, hyphens, and underscores", () => {
    expect(sanitizeFileName("file-name_v2.jpg")).toBe("file-name_v2.jpg");
  });

  it("handles empty string", () => {
    expect(sanitizeFileName("")).toBe("");
  });
});
