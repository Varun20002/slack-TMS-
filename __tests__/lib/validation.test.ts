import { describe, expect, it } from "vitest";
import { availabilitySchema, loginSchema, trainerFirstLoginSchema, trainerSchema, webinarSchema } from "@/lib/validation";

// ─── loginSchema ──────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  const valid = { email: "admin@tms.com", password: "pass1", role: "admin" };

  it("passes with valid admin credentials", () => {
    expect(loginSchema.safeParse(valid).success).toBe(true);
  });

  it("passes with trainer role", () => {
    expect(loginSchema.safeParse({ ...valid, role: "trainer" }).success).toBe(true);
  });

  it("fails with missing email", () => {
    expect(loginSchema.safeParse({ ...valid, email: "" }).success).toBe(false);
  });

  it("fails with invalid email format", () => {
    expect(loginSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("fails when password is too short (< 4 chars)", () => {
    expect(loginSchema.safeParse({ ...valid, password: "abc" }).success).toBe(false);
  });

  it("fails with unknown role", () => {
    expect(loginSchema.safeParse({ ...valid, role: "superuser" }).success).toBe(false);
  });

  it("trims whitespace from email before validation", () => {
    expect(loginSchema.safeParse({ ...valid, email: "  admin@tms.com  " }).success).toBe(true);
  });
});

// ─── trainerFirstLoginSchema ───────────────────────────────────────────────────

describe("trainerFirstLoginSchema", () => {
  const valid = { password: "StrongPass1", confirmPassword: "StrongPass1" };

  it("passes when passwords match and are ≥ 8 chars", () => {
    expect(trainerFirstLoginSchema.safeParse(valid).success).toBe(true);
  });

  it("fails when passwords do not match", () => {
    const result = trainerFirstLoginSchema.safeParse({ ...valid, confirmPassword: "Different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("confirmPassword");
    }
  });

  it("fails when password is shorter than 8 chars", () => {
    expect(trainerFirstLoginSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
  });
});

// ─── trainerSchema ─────────────────────────────────────────────────────────────

describe("trainerSchema", () => {
  const valid = {
    name: "Aman Verma",
    experience: "6",
    investing_trading_persona: "Swing Trader",
    strengths: "Options strategy",
    nature_of_business: "Full-time trader",
    phone_number: "91234567",
    email: "aman@tms.com",
    languages_spoken: "English, Hindi",
    base_city: "Mumbai",
    credentials_or_claim_to_fame: "10 years of options trading experience",
    social_media_handles: "@amanverma"
  };

  it("passes with all required fields", () => {
    expect(trainerSchema.safeParse(valid).success).toBe(true);
  });

  it("product_categories is optional (omitted)", () => {
    const { ...withoutCats } = valid;
    expect(trainerSchema.safeParse(withoutCats).success).toBe(true);
  });

  it("product_categories defaults to empty array when empty string", () => {
    const result = trainerSchema.safeParse({ ...valid, product_categories: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.product_categories).toEqual([]);
  });

  it("product_categories parses comma-separated string to array", () => {
    const result = trainerSchema.safeParse({ ...valid, product_categories: "Equity, F&O" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.product_categories).toEqual(["Equity", "F&O"]);
  });

  it("product_categories rejects more than 2 values", () => {
    const result = trainerSchema.safeParse({ ...valid, product_categories: "A,B,C" });
    expect(result.success).toBe(false);
  });

  it("certifications is optional (omitted)", () => {
    const { ...withoutCerts } = valid;
    expect(trainerSchema.safeParse(withoutCerts).success).toBe(true);
  });

  it("certifications defaults to empty string", () => {
    const result = trainerSchema.safeParse({ ...valid, certifications: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.certifications).toBe("");
  });

  it("fails when name is too short", () => {
    expect(trainerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });

  it("fails with invalid email", () => {
    expect(trainerSchema.safeParse({ ...valid, email: "bad-email" }).success).toBe(false);
  });

  it("fails when experience exceeds 50", () => {
    expect(trainerSchema.safeParse({ ...valid, experience: "51" }).success).toBe(false);
  });

  it("fails when phone_number is too short", () => {
    expect(trainerSchema.safeParse({ ...valid, phone_number: "12345" }).success).toBe(false);
  });

  it("bio (credentials_or_claim_to_fame) must be ≥ 2 chars", () => {
    expect(trainerSchema.safeParse({ ...valid, credentials_or_claim_to_fame: "X" }).success).toBe(false);
  });
});

// ─── webinarSchema ─────────────────────────────────────────────────────────────

describe("webinarSchema", () => {
  const valid = {
    trainer_id: "uuid-123",
    title: "Options Risk Framework",
    webinar_timing: "2026-04-29T11:00",
    duration_minutes: "60",
    status: "upcoming"
  };

  it("passes with required fields only", () => {
    expect(webinarSchema.safeParse(valid).success).toBe(true);
  });

  it("passes with all optional fields filled", () => {
    const full = {
      ...valid,
      requirements: "Basic options knowledge",
      target_user_base: "Retail traders",
      pre_webinar_link: "https://zoom.us/j/123",
      post_webinar_link: "https://zoom.us/j/456",
      google_calendar_embed_url: ""
    };
    expect(webinarSchema.safeParse(full).success).toBe(true);
  });

  it("fails when title is too short", () => {
    expect(webinarSchema.safeParse({ ...valid, title: "AB" }).success).toBe(false);
  });

  it("fails when trainer_id is empty", () => {
    expect(webinarSchema.safeParse({ ...valid, trainer_id: "" }).success).toBe(false);
  });

  it("fails when duration_minutes < 15", () => {
    expect(webinarSchema.safeParse({ ...valid, duration_minutes: "10" }).success).toBe(false);
  });

  it("fails when duration_minutes > 480", () => {
    expect(webinarSchema.safeParse({ ...valid, duration_minutes: "481" }).success).toBe(false);
  });

  it("fails with an invalid status value", () => {
    expect(webinarSchema.safeParse({ ...valid, status: "draft" }).success).toBe(false);
  });

  it("fails when pre_webinar_link is not a URL (non-empty)", () => {
    expect(webinarSchema.safeParse({ ...valid, pre_webinar_link: "not-a-url" }).success).toBe(false);
  });

  it("allows empty string for pre_webinar_link", () => {
    expect(webinarSchema.safeParse({ ...valid, pre_webinar_link: "" }).success).toBe(true);
  });
});

// ─── availabilitySchema ────────────────────────────────────────────────────────

describe("availabilitySchema", () => {
  const valid = {
    day_of_week: "2",
    start_time: "09:00",
    end_time: "17:00",
    timezone: "Asia/Kolkata"
  };

  it("passes with valid input", () => {
    expect(availabilitySchema.safeParse(valid).success).toBe(true);
  });

  it("coerces day_of_week string to number", () => {
    const result = availabilitySchema.safeParse(valid);
    if (result.success) expect(typeof result.data.day_of_week).toBe("number");
  });

  it("fails when day_of_week < 0", () => {
    expect(availabilitySchema.safeParse({ ...valid, day_of_week: "-1" }).success).toBe(false);
  });

  it("fails when day_of_week > 6", () => {
    expect(availabilitySchema.safeParse({ ...valid, day_of_week: "7" }).success).toBe(false);
  });

  it("fails when timezone is too short", () => {
    expect(availabilitySchema.safeParse({ ...valid, timezone: "U" }).success).toBe(false);
  });
});
