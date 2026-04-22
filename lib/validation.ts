import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "trainer"])
});

export const trainerFirstLoginSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Please confirm your password.")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const trainerSchema = z.object({
  name: z.string().min(2),
  experience: z.coerce.number().min(0).max(50),
  investing_trading_persona: z.string().min(2),
  strengths: z.string().min(2),
  product_categories: z
    .string()
    .transform((raw) => raw.split(",").map((value) => value.trim()).filter(Boolean))
    .refine((items) => items.length > 0 && items.length <= 2, "Provide 1 to 2 product categories."),
  nature_of_business: z.string().min(2),
  phone_number: z.string().min(8),
  email: z.string().email(),
  languages_spoken: z.string().min(2),
  base_city: z.string().min(2),
  credentials_or_claim_to_fame: z.string().min(2, "Credentials / claim to fame is required."),
  certifications: z.string().min(2, "Certifications are required."),
  social_media_handles: z.string().min(2, "Social media handles are required.")
});

export const webinarSchema = z.object({
  trainer_id: z.string().min(1, "Please select a trainer."),
  title: z.string().min(3),
  requirements: z.string().optional(),
  target_user_base: z.string().optional(),
  webinar_timing: z.string().min(10),
  duration_minutes: z.coerce.number().min(15).max(480),
  pre_webinar_link: z.string().url().optional().or(z.literal("")),
  post_webinar_link: z.string().url().optional().or(z.literal("")),
  google_calendar_embed_url: z.string().url().optional().or(z.literal("")),
  status: z.enum(["upcoming", "completed", "cancelled"])
});

export const availabilitySchema = z.object({
  day_of_week: z.coerce.number().min(0).max(6),
  start_time: z.string().min(4),
  end_time: z.string().min(4),
  timezone: z.string().min(2)
});
