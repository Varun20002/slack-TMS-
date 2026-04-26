/**
 * Pure helpers for survey-CSV parsing.
 * Kept separate from lib/actions.ts so they can be unit-tested without mocking Supabase.
 */

/** Lower-case trim — matches all column names during CSV parsing */
export function normalizeCell(value: unknown): string {
  return (value ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Strip every non-alphanumeric character for fuzzy title matching.
 * e.g. "Options Risk Framework!" → "optionsriskframework"
 */
export function compactTitle(value: string | null | undefined): string {
  return normalizeCell(value).replace(/[^a-z0-9]/g, "");
}

/**
 * Parse a cell value as a 1-5 star rating.
 * Returns null for anything outside that range or not numeric.
 */
export function parseRating(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Detect which row of a parsed CSV grid is the survey header row.
 * Looks for a row whose first cell is "#" and that contains both
 * "meeting/webinar id" and "session overall" columns.
 */
export function findSurveyHeaderIndex(grid: unknown[][]): number {
  return grid.findIndex((row) => {
    const headers = (row as unknown[]).map((cell) => normalizeCell(cell));
    return (
      headers[0] === "#" &&
      headers.some((cell) => cell.includes("meeting/webinar id")) &&
      headers.some((cell) => cell.includes("session overall"))
    );
  });
}

/**
 * Given a survey-data grid (already sliced past the header row) and the indices
 * of the "topic" and "session overall" columns, return the parsed rows.
 */
export function parseSurveyRows(
  dataRows: unknown[][],
  topicIndex: number,
  sessionIndex: number
): Array<{ topic: string; session: number }> {
  return dataRows
    .filter((row) => (row as unknown[]).some((cell) => String(cell ?? "").trim()))
    .map((row) => ({
      topic: String((row as unknown[])[topicIndex] ?? "").trim(),
      session: parseRating((row as unknown[])[sessionIndex])
    }))
    .filter((row): row is { topic: string; session: number } => Boolean(row.topic && row.session !== null));
}

/**
 * Match survey rows to a chosen webinar title using the compact-key approach.
 * Falls back to the full survey if no row fuzzy-matches the title.
 */
export function filterSurveyRowsByTitle(
  rows: Array<{ topic: string; session: number }>,
  webinarTitle: string
): Array<{ topic: string; session: number }> {
  const selectedKey = compactTitle(webinarTitle);
  const matched = rows.filter((row) => {
    const topicKey = compactTitle(row.topic);
    return topicKey.includes(selectedKey) || selectedKey.includes(topicKey);
  });
  return matched.length ? matched : rows;
}

/**
 * Compute a running (cumulative) average from an array of 1-5 ratings.
 * Returns 0 when the array is empty.
 */
export function cumulativeAverage(ratings: number[]): number {
  if (!ratings.length) return 0;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/** Sanitise a filename by replacing every non-alphanumeric char with "-". */
export function sanitizeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
}
