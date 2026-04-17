"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { getCurrentProfile, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildGoogleCalendarEventUrl } from "@/lib/utils";
import { availabilitySchema, trainerSchema, webinarSchema } from "@/lib/validation";

export type ActionResponse = { success: boolean; message: string };
type ContactField = "email" | "phone";

export async function loginAction(input: { email: string; password: string; role: "admin" | "trainer" }) {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password
  });

  if (error || !data.user) {
    return { success: false, message: error?.message ?? "Invalid credentials." };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.role !== input.role) {
    await supabase.auth.signOut();
    return { success: false, message: "This account does not have access to this portal." };
  }

  return {
    success: true,
    message: "Authenticated",
    redirectTo: input.role === "admin" ? "/admin/dashboard" : "/trainer/dashboard"
  };
}

export async function logoutAction() {
  const supabase = (await createClient()) as any;
  await supabase.auth.signOut();
}

export async function createTrainerAction(formData: FormData): Promise<ActionResponse> {
  await requireRole("admin");
  const parsed = trainerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid trainer data." };
  }

  const socialRaw = parsed.data.social_media_handles?.trim();
  const social = socialRaw ? ({ handles: socialRaw } as Record<string, string>) : null;
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("trainers").insert({
    ...parsed.data,
    product_categories: parsed.data.product_categories,
    credentials_or_claim_to_fame: parsed.data.credentials_or_claim_to_fame || null,
    certifications: parsed.data.certifications || null,
    social_media_handles: social
  });

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/trainers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/webinars");
  return { success: true, message: "Trainer created successfully." };
}

export async function updateTrainerAction(id: string, formData: FormData): Promise<ActionResponse> {
  await requireRole("admin");
  const parsed = trainerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid trainer data." };
  }

  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("trainers")
    .update({
      ...parsed.data,
      product_categories: parsed.data.product_categories,
      credentials_or_claim_to_fame: parsed.data.credentials_or_claim_to_fame || null,
      certifications: parsed.data.certifications || null,
      social_media_handles: parsed.data.social_media_handles ? { handles: parsed.data.social_media_handles } : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };
  revalidatePath("/admin/trainers");
  return { success: true, message: "Trainer updated." };
}

export async function createWebinarAction(formData: FormData): Promise<ActionResponse> {
  await requireRole("admin");
  const parsed = webinarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid webinar data." };

  const supabase = (await createClient()) as any;
  const start = new Date(parsed.data.webinar_timing);
  if (Number.isNaN(start.getTime())) {
    return { success: false, message: "Invalid webinar start date/time." };
  }
  const end = new Date(start.getTime() + parsed.data.duration_minutes * 60 * 1000);
  const generatedCalendarUrl = buildGoogleCalendarEventUrl({
    title: parsed.data.title,
    description: parsed.data.requirements || parsed.data.target_user_base || "",
    start,
    end
  });

  const insertPayloadWithDuration = {
    ...parsed.data,
    webinar_timing: start.toISOString(),
    requirements: parsed.data.requirements || null,
    target_user_base: parsed.data.target_user_base || null,
    pre_webinar_link: parsed.data.pre_webinar_link || null,
    post_webinar_link: parsed.data.post_webinar_link || null,
    google_calendar_embed_url: parsed.data.google_calendar_embed_url || generatedCalendarUrl
  };

  let webinar: { id: string } | null = null;
  let error: { message?: string; code?: string } | null = null;

  const insertWithDuration = await supabase.from("webinars").insert(insertPayloadWithDuration).select("id").single();
  webinar = insertWithDuration.data;
  error = insertWithDuration.error;

  if (error && (error.code === "42703" || error.message?.includes("duration_minutes"))) {
    const legacyPayload = { ...insertPayloadWithDuration };
    delete (legacyPayload as Record<string, unknown>).duration_minutes;
    const legacyInsert = await supabase.from("webinars").insert(legacyPayload).select("id").single();
    webinar = legacyInsert.data;
    error = legacyInsert.error;
  }

  if (error || !webinar) {
    const rawMessage = error?.message ?? "Failed to create webinar.";
    if (/stack depth limit exceeded/i.test(rawMessage)) {
      return {
        success: false,
        message:
          "Database policy recursion detected. Run the RLS function patch from `supabase/schema.sql` (current_user_role/current_trainer_id as SECURITY DEFINER), then retry."
      };
    }
    return { success: false, message: rawMessage };
  }

  const { error: metricsError } = await supabase.from("webinar_metrics").insert({
    webinar_id: webinar.id,
    registrations_count: 0,
    attendees_count: 0,
    first_time_future_traders_count: 0,
    rating: null,
    highest_audience_count: null,
    success_rate: null
  });

  if (metricsError) return { success: false, message: metricsError.message };

  revalidatePath("/admin/webinars");
  revalidatePath("/admin/dashboard");
  revalidatePath("/trainer/dashboard");
  revalidatePath("/trainer/webinars");
  return { success: true, message: "Webinar scheduled." };
}

export async function uploadRatingsCsvAction(formData: FormData): Promise<ActionResponse> {
  const profile = await requireRole("admin");
  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, message: "Please upload a CSV file." };

  const text = await file.text();
  const parsed = Papa.parse<{ trainer_email: string; webinar_id?: string; rating: string }>(text, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    return { success: false, message: `CSV parsing failed: ${parsed.errors[0]?.message}` };
  }

  const rows = parsed.data.filter((row) => row.trainer_email && row.rating);
  if (!rows.length) return { success: false, message: "CSV has no valid rows." };

  const supabase = (await createClient()) as any;
  const { data: batch, error: batchError } = await supabase
    .from("rating_upload_batches")
    .insert({
      uploaded_by: profile.id,
      file_name: file.name
    })
    .select("id")
    .single();

  if (batchError || !batch) return { success: false, message: batchError?.message ?? "Unable to save upload batch." };

  const trainerEmails = rows.map((row) => row.trainer_email.toLowerCase());
  const { data: trainers, error: trainerFetchError } = await supabase.from("trainers").select("id,email").in("email", trainerEmails);
  if (trainerFetchError) return { success: false, message: trainerFetchError.message };

  const trainerMap = new Map((trainers ?? []).map((trainer) => [trainer.email.toLowerCase(), trainer.id]));
  const ratingInserts = rows
    .map((row) => ({
      trainer_id: trainerMap.get(row.trainer_email.toLowerCase()) ?? "",
      webinar_id: row.webinar_id || null,
      upload_batch_id: batch.id,
      rating: Number(row.rating),
      source: "csv"
    }))
    .filter((row) => row.trainer_id && !Number.isNaN(row.rating));

  if (!ratingInserts.length) {
    return { success: false, message: "No rows matched existing trainers. Use trainer_email from trainers table." };
  }

  const { error: ratingError } = await supabase.from("trainer_ratings").insert(ratingInserts);
  if (ratingError) return { success: false, message: ratingError.message };

  for (const trainerId of new Set(ratingInserts.map((item) => item.trainer_id))) {
    const { data: ratings } = await supabase.from("trainer_ratings").select("rating").eq("trainer_id", trainerId);
    const average = ratings && ratings.length ? ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length : 0;
    await supabase.from("trainers").update({ average_rating: Number(average.toFixed(2)) }).eq("id", trainerId);
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/trainers");
  revalidatePath("/admin/webinars");
  revalidatePath("/trainer/dashboard");
  revalidatePath("/trainer/leaderboard");
  return { success: true, message: `Uploaded ${ratingInserts.length} ratings.` };
}

export async function upsertAvailabilityAction(formData: FormData): Promise<ActionResponse> {
  const profile = await requireRole("trainer");
  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid availability slot." };

  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("id").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return { success: false, message: "No trainer record linked to this account." };

  const { data: overlaps } = await supabase
    .from("trainer_availability")
    .select("*")
    .eq("trainer_id", trainer.id)
    .eq("day_of_week", parsed.data.day_of_week)
    .lt("start_time", parsed.data.end_time)
    .gt("end_time", parsed.data.start_time);

  if (overlaps && overlaps.length) {
    return { success: false, message: "This slot overlaps with an existing availability slot." };
  }

  const { error } = await supabase.from("trainer_availability").insert({
    trainer_id: trainer.id,
    ...parsed.data
  });
  if (error) return { success: false, message: error.message };

  revalidatePath("/trainer/availability");
  return { success: true, message: "Availability slot added." };
}

export async function removeAvailabilityAction(id: string): Promise<ActionResponse> {
  await requireRole("trainer");
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("trainer_availability").delete().eq("id", id);
  if (error) return { success: false, message: error.message };
  revalidatePath("/trainer/availability");
  return { success: true, message: "Availability removed." };
}

export async function updateProfileAction(formData: FormData): Promise<ActionResponse> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, message: "Not signed in." };

  const full_name = String(formData.get("full_name") ?? profile.full_name);
  const phone = String(formData.get("phone") ?? profile.phone ?? "");
  const email = String(formData.get("email") ?? profile.email);

  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name, phone, email, updated_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (error) return { success: false, message: error.message };

  if (profile.role === "trainer") {
    await supabase
      .from("trainers")
      .update({ name: full_name, phone_number: phone, email, updated_at: new Date().toISOString() })
      .eq("profile_id", profile.id);
  }

  revalidatePath("/admin/profile");
  revalidatePath("/trainer/profile");
  return { success: true, message: "Profile updated." };
}

export async function updateProfileFieldAction(field: "full_name" | "phone" | "email", value: string): Promise<ActionResponse> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, message: "Not signed in." };

  const trimmed = value.trim();
  if (!trimmed) return { success: false, message: "Value cannot be empty." };
  if (field !== "full_name") {
    return { success: false, message: "Use OTP verification for email and phone updates." };
  }

  const supabase = (await createClient()) as any;
  const profileUpdate: Record<string, string> = {
    [field]: trimmed,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", profile.id);
  if (error) return { success: false, message: error.message };

  if (profile.role === "trainer") {
    const trainerUpdate: Record<string, string> = {
      updated_at: new Date().toISOString(),
      name: trimmed
    };
    await supabase.from("trainers").update(trainerUpdate).eq("profile_id", profile.id);
  }

  revalidatePath("/admin/profile");
  revalidatePath("/trainer/profile");
  return { success: true, message: "Profile field updated." };
}

export async function sendContactOtpAction(field: ContactField, value: string): Promise<ActionResponse> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, message: "Not signed in." };

  const trimmed = value.trim();
  if (!trimmed) return { success: false, message: "Value cannot be empty." };
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { success: false, message: "Enter a valid email address." };
  }

  const supabase = (await createClient()) as any;

  if (field === "email") {
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) return { success: false, message: error.message };
    return { success: true, message: "Email OTP sent. Check your inbox." };
  }

  const { error } = await supabase.auth.updateUser({ phone: trimmed });
  if (error) return { success: false, message: error.message };
  return { success: true, message: "Phone OTP sent. Check your SMS." };
}

export async function verifyContactOtpAction(field: ContactField, value: string, token: string): Promise<ActionResponse> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, message: "Not signed in." };

  const trimmed = value.trim();
  const otp = token.trim();
  if (!trimmed || !otp) return { success: false, message: "Value and OTP are required." };

  const supabase = (await createClient()) as any;

  if (field === "email") {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: trimmed,
      token: otp,
      type: "email_change"
    });
    if (verifyError) return { success: false, message: verifyError.message };

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ email: trimmed, updated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (profileError) return { success: false, message: profileError.message };

    if (profile.role === "trainer") {
      await supabase.from("trainers").update({ email: trimmed, updated_at: new Date().toISOString() }).eq("profile_id", profile.id);
    }

    revalidatePath("/admin/profile");
    revalidatePath("/trainer/profile");
    return { success: true, message: "Email updated successfully." };
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    phone: trimmed,
    token: otp,
    type: "phone_change"
  });
  if (verifyError) return { success: false, message: verifyError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ phone: trimmed, updated_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (profileError) return { success: false, message: profileError.message };

  if (profile.role === "trainer") {
    await supabase.from("trainers").update({ phone_number: trimmed, updated_at: new Date().toISOString() }).eq("profile_id", profile.id);
  }

  revalidatePath("/admin/profile");
  revalidatePath("/trainer/profile");
  return { success: true, message: "Phone number updated successfully." };
}
