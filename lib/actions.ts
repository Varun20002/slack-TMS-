"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { getCurrentProfile, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slackApi } from "@/lib/slack";
import { buildGoogleCalendarEventUrl } from "@/lib/utils";
import { availabilitySchema, trainerSchema, webinarSchema } from "@/lib/validation";

export type ActionResponse = { success: boolean; message: string };
type ContactField = "email" | "phone";
const TRAINER_PROFILE_BUCKET = "trainer-profile-images";

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
}

function getOpsChannelId() {
  return process.env.OPS_CHANNEL_ID || null;
}

async function sendOpsWebinarUpdate(message: string) {
  const channel = getOpsChannelId();
  if (!channel) return;
  try {
    await slackApi("/chat.postMessage", { channel, text: message });
  } catch (error) {
    console.error("Failed to send Ops Slack update", error);
  }
}

async function uploadTrainerProfileImage(supabaseAdmin: any, file: File, trainerKey: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Profile photo must be an image file.");
  }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Profile photo must be 5MB or smaller.");
  }

  await supabaseAdmin.storage.createBucket(TRAINER_PROFILE_BUCKET, {
    public: true,
    fileSizeLimit: maxBytes,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"]
  });

  const path = `${trainerKey}/${Date.now()}-${sanitizeFileName(file.name || "profile.png")}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(TRAINER_PROFILE_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/png"
  });
  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }
  const { data } = supabaseAdmin.storage.from(TRAINER_PROFILE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

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
  const supabase = createAdminClient() as any;
  const profileImageFile = formData.get("profile_image");
  let profileImageUrl: string | null = null;

  try {
    if (profileImageFile instanceof File && profileImageFile.size > 0) {
      profileImageUrl = await uploadTrainerProfileImage(supabase, profileImageFile, parsed.data.email);
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Unable to upload profile photo." };
  }

  const { error } = await supabase.from("trainers").insert({
    ...parsed.data,
    product_categories: parsed.data.product_categories,
    credentials_or_claim_to_fame: parsed.data.credentials_or_claim_to_fame || null,
    certifications: parsed.data.certifications || null,
    social_media_handles: social,
    profile_image_url: profileImageUrl
  });

  if (error) {
    if (error.message?.includes("profile_image_url")) {
      return {
        success: false,
        message:
          "Missing `profile_image_url` column in trainers table. Run: ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS profile_image_url text;"
      };
    }
    return { success: false, message: error.message };
  }

  revalidatePath("/admin/trainers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/webinars");
  revalidatePath("/trainer/profile");
  return { success: true, message: "Trainer created successfully." };
}

export async function updateTrainerAction(id: string, formData: FormData): Promise<ActionResponse> {
  await requireRole("admin");
  const parsed = trainerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid trainer data." };
  }

  const supabase = createAdminClient() as any;
  const profileImageFile = formData.get("profile_image");
  let profileImageUrl: string | null | undefined = undefined;

  try {
    if (profileImageFile instanceof File && profileImageFile.size > 0) {
      profileImageUrl = await uploadTrainerProfileImage(supabase, profileImageFile, parsed.data.email);
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Unable to upload profile photo." };
  }

  const { error } = await supabase
    .from("trainers")
    .update({
      ...parsed.data,
      product_categories: parsed.data.product_categories,
      credentials_or_claim_to_fame: parsed.data.credentials_or_claim_to_fame || null,
      certifications: parsed.data.certifications || null,
      social_media_handles: parsed.data.social_media_handles ? { handles: parsed.data.social_media_handles } : null,
      ...(profileImageUrl !== undefined ? { profile_image_url: profileImageUrl } : {}),
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    if (error.message?.includes("profile_image_url")) {
      return {
        success: false,
        message:
          "Missing `profile_image_url` column in trainers table. Run: ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS profile_image_url text;"
      };
    }
    return { success: false, message: error.message };
  }
  revalidatePath("/admin/trainers");
  revalidatePath("/trainer/profile");
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

export async function updateWebinarAction(formData: FormData): Promise<ActionResponse> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "Missing webinar id." };

  const parsed = webinarSchema.safeParse({
    trainer_id: String(formData.get("trainer_id") ?? ""),
    title: String(formData.get("title") ?? ""),
    requirements: String(formData.get("requirements") ?? ""),
    target_user_base: String(formData.get("target_user_base") ?? ""),
    webinar_timing: String(formData.get("webinar_timing") ?? ""),
    duration_minutes: String(formData.get("duration_minutes") ?? "60"),
    pre_webinar_link: String(formData.get("pre_webinar_link") ?? ""),
    post_webinar_link: String(formData.get("post_webinar_link") ?? ""),
    google_calendar_embed_url: "",
    status: String(formData.get("status") ?? "upcoming")
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid webinar data." };
  }

  const supabase = (await createClient()) as any;
  const { data: oldWebinar } = await supabase.from("webinars").select("id,title,webinar_timing,duration_minutes").eq("id", id).maybeSingle();
  if (!oldWebinar) return { success: false, message: "Webinar not found." };

  const start = new Date(parsed.data.webinar_timing);
  if (Number.isNaN(start.getTime())) return { success: false, message: "Invalid webinar date/time." };
  const end = new Date(start.getTime() + parsed.data.duration_minutes * 60 * 1000);
  const generatedCalendarUrl = buildGoogleCalendarEventUrl({
    title: parsed.data.title,
    description: parsed.data.requirements || parsed.data.target_user_base || "",
    start,
    end
  });

  const { error } = await supabase
    .from("webinars")
    .update({
      ...parsed.data,
      webinar_timing: start.toISOString(),
      requirements: parsed.data.requirements || null,
      target_user_base: parsed.data.target_user_base || null,
      pre_webinar_link: parsed.data.pre_webinar_link || null,
      post_webinar_link: parsed.data.post_webinar_link || null,
      google_calendar_embed_url: parsed.data.google_calendar_embed_url || generatedCalendarUrl,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) return { success: false, message: error.message };

  const oldDate = new Date(oldWebinar.webinar_timing);
  const newDate = start;
  let changeType = "updated";
  if (parsed.data.status === "cancelled") changeType = "cancelled";
  else if (newDate.getTime() < oldDate.getTime()) changeType = "preponed";
  else if (newDate.getTime() > oldDate.getTime()) changeType = "postponed";

  await sendOpsWebinarUpdate(
    `Webinar ${changeType}: ${oldWebinar.title}\nOld: ${oldDate.toUTCString()} (${oldWebinar.duration_minutes ?? 60} min)\nNew: ${newDate.toUTCString()} (${parsed.data.duration_minutes} min)`
  );

  revalidatePath("/admin/webinars");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/trainer/webinars");
  revalidatePath("/trainer/calendar");
  revalidatePath("/trainer/dashboard");
  return { success: true, message: "Webinar updated." };
}

export async function deleteWebinarAction(id: string): Promise<ActionResponse> {
  await requireRole("admin");
  if (!id) return { success: false, message: "Missing webinar id." };

  const supabase = (await createClient()) as any;
  const { data: webinar } = await supabase.from("webinars").select("id,title,webinar_timing,duration_minutes").eq("id", id).maybeSingle();
  if (!webinar) return { success: false, message: "Webinar not found." };

  const { error } = await supabase.from("webinars").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  await sendOpsWebinarUpdate(
    `Webinar cancelled: ${webinar.title}\nScheduled: ${new Date(webinar.webinar_timing).toUTCString()} (${webinar.duration_minutes ?? 60} min)`
  );

  revalidatePath("/admin/webinars");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/trainer/webinars");
  revalidatePath("/trainer/calendar");
  revalidatePath("/trainer/dashboard");
  return { success: true, message: "Webinar deleted." };
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
