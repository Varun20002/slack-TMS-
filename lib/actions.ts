"use server";

import { randomBytes } from "crypto";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";

import { getCurrentProfile, requireRole } from "@/lib/auth";
import {
  createGoogleCalendarEvent,
  decryptRefreshToken,
  deleteGoogleCalendarEvent,
  refreshGoogleAccessToken,
  updateGoogleCalendarEvent
} from "@/lib/google-calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slackApi } from "@/lib/slack";
import { buildGoogleCalendarEventUrl, formatDate } from "@/lib/utils";
import { availabilitySchema, trainerFirstLoginSchema, trainerSchema, webinarSchema } from "@/lib/validation";

export type ActionResponse = { success: boolean; message: string; temporaryPassword?: string; redirectTo?: string };
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

async function getTrainerCalendarConnection(trainerId: string) {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("trainer_google_connections")
    .select("encrypted_refresh_token, calendar_id")
    .eq("trainer_id", trainerId)
    .maybeSingle();
  return data as { encrypted_refresh_token: string; calendar_id: string | null } | null;
}

async function withTrainerGoogleAccessToken<T>(
  trainerId: string,
  fn: (params: { accessToken: string; calendarId: string }) => Promise<T>
) {
  const admin = createAdminClient() as any;
  const connection = await getTrainerCalendarConnection(trainerId);
  if (!connection?.encrypted_refresh_token) {
    return { ok: false as const, reason: "not_connected" };
  }

  try {
    const refreshToken = decryptRefreshToken(connection.encrypted_refresh_token);
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const result = await fn({ accessToken, calendarId: connection.calendar_id || "primary" });
    await admin
      .from("trainer_google_connections")
      .update({ last_error: null, updated_at: new Date().toISOString() })
      .eq("trainer_id", trainerId);
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google calendar sync failed.";
    await admin
      .from("trainer_google_connections")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("trainer_id", trainerId);
    return { ok: false as const, reason: "sync_failed", message };
  }
}

function buildWebinarCalendarDescription(input: {
  requirements?: string | null;
  targetUserBase?: string | null;
  preWebinarLink?: string | null;
  postWebinarLink?: string | null;
}) {
  return [
    input.requirements ? `Requirements: ${input.requirements}` : null,
    input.targetUserBase ? `Target user base: ${input.targetUserBase}` : null,
    input.preWebinarLink ? `Pre-webinar link: ${input.preWebinarLink}` : null,
    input.postWebinarLink ? `Post-webinar link: ${input.postWebinarLink}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

async function createGoogleEventForWebinar(webinar: {
  id: string;
  trainer_id: string;
  title: string;
  webinar_timing: string;
  duration_minutes: number;
  requirements?: string | null;
  target_user_base?: string | null;
  pre_webinar_link?: string | null;
  post_webinar_link?: string | null;
}) {
  const sync = await withTrainerGoogleAccessToken(webinar.trainer_id, async ({ accessToken, calendarId }) => {
    const start = new Date(webinar.webinar_timing);
    const end = new Date(start.getTime() + Number(webinar.duration_minutes || 60) * 60 * 1000);
    return createGoogleCalendarEvent(accessToken, {
      calendarId,
      title: webinar.title,
      description: buildWebinarCalendarDescription({
        requirements: webinar.requirements,
        targetUserBase: webinar.target_user_base,
        preWebinarLink: webinar.pre_webinar_link,
        postWebinarLink: webinar.post_webinar_link
      }),
      startIso: start.toISOString(),
      endIso: end.toISOString()
    });
  });

  const admin = createAdminClient() as any;
  if (!sync.ok) {
    await admin
      .from("webinars")
      .update({
        google_calendar_sync_error: sync.reason === "not_connected" ? "Trainer has not connected Google Calendar." : sync.message
      })
      .eq("id", webinar.id);
    return { ok: false as const };
  }

  await admin
    .from("webinars")
    .update({
      google_event_id: sync.result,
      google_calendar_sync_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", webinar.id);
  return { ok: true as const };
}

async function deleteGoogleEventForWebinar(webinar: { trainer_id: string; google_event_id?: string | null }) {
  if (!webinar.google_event_id) return;
  await withTrainerGoogleAccessToken(webinar.trainer_id, async ({ accessToken, calendarId }) => {
    await deleteGoogleCalendarEvent(accessToken, { calendarId, eventId: webinar.google_event_id as string });
  });
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

  let profile: { role: "admin" | "trainer"; must_change_password?: boolean } | null = null;
  const profileWithFlag = await supabase.from("profiles").select("role, must_change_password").eq("id", data.user.id).maybeSingle();
  if (profileWithFlag.error) {
    const fallback = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (fallback.data) profile = { ...fallback.data, must_change_password: false };
  } else {
    profile = profileWithFlag.data;
  }
  if (!profile || profile.role !== input.role) {
    await supabase.auth.signOut();
    return { success: false, message: "This account does not have access to this portal." };
  }

  if (input.role === "trainer" && profile.must_change_password) {
    return {
      success: true,
      message: "Temporary password accepted. Please set a new password.",
      redirectTo: "/trainer/first-login"
    };
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

  const social = { handles: parsed.data.social_media_handles.trim() } as Record<string, string>;
  const supabase = createAdminClient() as any;
  const profileImageFile = formData.get("profile_image");
  let profileImageUrl: string | null = null;

  if (!(profileImageFile instanceof File) || profileImageFile.size === 0) {
    return { success: false, message: "Profile photo is required." };
  }

  try {
    profileImageUrl = await uploadTrainerProfileImage(supabase, profileImageFile, parsed.data.email);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Unable to upload profile photo." };
  }

  const generatedPassword = randomBytes(8).toString("hex");
  const authResult = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.name,
      role: "trainer"
    }
  });

  if (authResult.error || !authResult.data.user?.id) {
    return { success: false, message: authResult.error?.message ?? "Failed to create trainer auth account." };
  }

  const profileId = authResult.data.user.id;
  const { error: profileError } = await supabase.from("profiles").insert({
    id: profileId,
    role: "trainer",
    full_name: parsed.data.name,
    phone: parsed.data.phone_number,
    email: parsed.data.email,
    must_change_password: true
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(profileId);
    return { success: false, message: profileError.message };
  }

  const { data: trainer, error: trainerError } = await supabase
    .from("trainers")
    .insert({
      profile_id: profileId,
      ...parsed.data,
      product_categories: parsed.data.product_categories,
      social_media_handles: social,
      profile_image_url: profileImageUrl,
      temporary_password: generatedPassword
    })
    .select("id")
    .single();

  if (trainerError || !trainer?.id) {
    await supabase.from("profiles").delete().eq("id", profileId);
    await supabase.auth.admin.deleteUser(profileId);
    if (trainerError?.message?.includes("profile_image_url")) {
      return {
        success: false,
        message:
          "Missing `profile_image_url` column in trainers table. Run: ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS profile_image_url text;"
      };
    }
    return { success: false, message: trainerError?.message ?? "Failed to create trainer record." };
  }

  revalidatePath("/admin/trainers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/webinars");
  revalidatePath("/trainer/profile");
  return {
    success: true,
    message: "Trainer created successfully. Share temporary password with the trainer.",
    temporaryPassword: generatedPassword
  };
}

export async function completeTrainerFirstLoginAction(formData: FormData): Promise<ActionResponse> {
  const profile = await requireRole("trainer");
  const parsed = trainerFirstLoginSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? "")
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid password update request." };
  }

  if (!profile.must_change_password) {
    return { success: true, message: "Password already updated.", redirectTo: "/trainer/dashboard" };
  }

  const supabase = createAdminClient() as any;
  const passwordUpdate = await supabase.auth.admin.updateUserById(profile.id, {
    password: parsed.data.password,
    email_confirm: true
  });
  if (passwordUpdate.error) {
    return { success: false, message: passwordUpdate.error.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (profileError) return { success: false, message: profileError.message };

  await supabase
    .from("trainers")
    .update({ temporary_password: null, updated_at: new Date().toISOString() })
    .eq("profile_id", profile.id);

  revalidatePath("/admin/trainers");
  return {
    success: true,
    message: "Password set successfully. You can now use the trainer portal.",
    redirectTo: "/trainer/dashboard"
  };
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
      social_media_handles: { handles: parsed.data.social_media_handles.trim() },
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

  await createGoogleEventForWebinar({
    id: webinar.id,
    trainer_id: parsed.data.trainer_id,
    title: parsed.data.title,
    webinar_timing: start.toISOString(),
    duration_minutes: parsed.data.duration_minutes,
    requirements: parsed.data.requirements || null,
    target_user_base: parsed.data.target_user_base || null,
    pre_webinar_link: parsed.data.pre_webinar_link || null,
    post_webinar_link: parsed.data.post_webinar_link || null
  });

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
  const oldWithDuration = await supabase
    .from("webinars")
    .select("id,title,trainer_id,webinar_timing,duration_minutes,requirements,target_user_base,pre_webinar_link,post_webinar_link,status,google_event_id")
    .eq("id", id)
    .maybeSingle();
  let oldWebinar = oldWithDuration.data as any;
  let oldWebinarError = oldWithDuration.error as any;

  if (oldWebinarError && (oldWebinarError.code === "42703" || oldWebinarError.message?.includes("duration_minutes"))) {
    const oldLegacy = await supabase
      .from("webinars")
      .select("id,title,trainer_id,webinar_timing,requirements,target_user_base,pre_webinar_link,post_webinar_link,status,google_event_id")
      .eq("id", id)
      .maybeSingle();
    oldWebinar = oldLegacy.data ? { ...oldLegacy.data, duration_minutes: null } : null;
    oldWebinarError = oldLegacy.error;
  }

  if (oldWebinarError) return { success: false, message: oldWebinarError.message ?? "Failed to fetch webinar." };
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

  const updatePayloadWithDuration = {
    ...parsed.data,
    webinar_timing: start.toISOString(),
    requirements: parsed.data.requirements || null,
    target_user_base: parsed.data.target_user_base || null,
    pre_webinar_link: parsed.data.pre_webinar_link || null,
    post_webinar_link: parsed.data.post_webinar_link || null,
    google_calendar_embed_url: parsed.data.google_calendar_embed_url || generatedCalendarUrl,
    updated_at: new Date().toISOString()
  };

  let updateError: any = null;
  const updateWithDuration = await supabase.from("webinars").update(updatePayloadWithDuration).eq("id", id);
  updateError = updateWithDuration.error;

  if (updateError && (updateError.code === "42703" || updateError.message?.includes("duration_minutes"))) {
    const legacyPayload = { ...updatePayloadWithDuration } as Record<string, unknown>;
    delete legacyPayload.duration_minutes;
    const legacyUpdate = await supabase.from("webinars").update(legacyPayload).eq("id", id);
    updateError = legacyUpdate.error;
  }
  if (updateError) return { success: false, message: updateError.message };

  const webinarStatus = parsed.data.status;
  if (webinarStatus !== "upcoming") {
    const admin = createAdminClient() as any;
    await deleteGoogleEventForWebinar({
      trainer_id: oldWebinar.trainer_id,
      google_event_id: oldWebinar.google_event_id ?? null
    });
    await admin.from("webinars").update({ google_event_id: null, google_calendar_sync_error: null, updated_at: new Date().toISOString() }).eq("id", id);
  } else if (oldWebinar.trainer_id !== parsed.data.trainer_id) {
    await deleteGoogleEventForWebinar({
      trainer_id: oldWebinar.trainer_id,
      google_event_id: oldWebinar.google_event_id ?? null
    });
    await createGoogleEventForWebinar({
      id,
      trainer_id: parsed.data.trainer_id,
      title: parsed.data.title,
      webinar_timing: start.toISOString(),
      duration_minutes: parsed.data.duration_minutes,
      requirements: parsed.data.requirements || null,
      target_user_base: parsed.data.target_user_base || null,
      pre_webinar_link: parsed.data.pre_webinar_link || null,
      post_webinar_link: parsed.data.post_webinar_link || null
    });
  } else if (oldWebinar.google_event_id) {
    const sync = await withTrainerGoogleAccessToken(parsed.data.trainer_id, async ({ accessToken, calendarId }) => {
      await updateGoogleCalendarEvent(accessToken, {
        calendarId,
        eventId: oldWebinar.google_event_id as string,
        title: parsed.data.title,
        description: buildWebinarCalendarDescription({
          requirements: parsed.data.requirements || null,
          targetUserBase: parsed.data.target_user_base || null,
          preWebinarLink: parsed.data.pre_webinar_link || null,
          postWebinarLink: parsed.data.post_webinar_link || null
        }),
        startIso: start.toISOString(),
        endIso: end.toISOString()
      });
    });
    if (!sync.ok) {
      const admin = createAdminClient() as any;
      await admin
        .from("webinars")
        .update({ google_calendar_sync_error: sync.reason === "not_connected" ? "Trainer has not connected Google Calendar." : sync.message })
        .eq("id", id);
    } else {
      const admin = createAdminClient() as any;
      await admin.from("webinars").update({ google_calendar_sync_error: null, updated_at: new Date().toISOString() }).eq("id", id);
    }
  } else {
    await createGoogleEventForWebinar({
      id,
      trainer_id: parsed.data.trainer_id,
      title: parsed.data.title,
      webinar_timing: start.toISOString(),
      duration_minutes: parsed.data.duration_minutes,
      requirements: parsed.data.requirements || null,
      target_user_base: parsed.data.target_user_base || null,
      pre_webinar_link: parsed.data.pre_webinar_link || null,
      post_webinar_link: parsed.data.post_webinar_link || null
    });
  }

  const oldDate = new Date(oldWebinar.webinar_timing);
  const newDate = start;
  const normalize = (value: unknown) => (value ?? "").toString().trim();

  const changedFields: string[] = [];
  if (normalize(oldWebinar.title) !== normalize(parsed.data.title)) changedFields.push("title");
  if (normalize(oldWebinar.trainer_id) !== normalize(parsed.data.trainer_id)) changedFields.push("trainer");
  if (oldDate.getTime() !== newDate.getTime()) changedFields.push("timing");
  if (Number(oldWebinar.duration_minutes ?? 60) !== Number(parsed.data.duration_minutes)) changedFields.push("duration");
  if (normalize(oldWebinar.requirements) !== normalize(parsed.data.requirements)) changedFields.push("requirements");
  if (normalize(oldWebinar.target_user_base) !== normalize(parsed.data.target_user_base)) changedFields.push("target user base");
  if (normalize(oldWebinar.pre_webinar_link) !== normalize(parsed.data.pre_webinar_link)) changedFields.push("pre-webinar link");
  if (normalize(oldWebinar.post_webinar_link) !== normalize(parsed.data.post_webinar_link)) changedFields.push("post-webinar link");
  if (normalize(oldWebinar.status) !== normalize(parsed.data.status)) changedFields.push("status");

  const heading =
    changedFields.length === 1 && changedFields[0] === "timing"
      ? newDate.getTime() < oldDate.getTime()
        ? "Webinar preponed"
        : "Webinar postponed"
      : changedFields.length === 1 && changedFields[0] === "title"
        ? "Webinar title updated"
        : "Webinar updated";

  await sendOpsWebinarUpdate([
    `${heading}: ${oldWebinar.title}`,
    `Changed: ${changedFields.length ? changedFields.join(", ") : "none"}`,
    `Old time: ${formatDate(oldDate)} (${oldWebinar.duration_minutes ?? 60} min)`,
    `New time: ${formatDate(newDate)} (${parsed.data.duration_minutes} min)`,
    changedFields.includes("title") ? `New title: ${parsed.data.title}` : null
  ].filter(Boolean).join("\n"));

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
  const withDuration = await supabase
    .from("webinars")
    .select("id,title,trainer_id,webinar_timing,duration_minutes,google_event_id")
    .eq("id", id)
    .maybeSingle();
  let webinar = withDuration.data as any;
  let webinarError = withDuration.error as any;

  if (webinarError && (webinarError.code === "42703" || webinarError.message?.includes("duration_minutes"))) {
    const legacyWebinar = await supabase.from("webinars").select("id,title,webinar_timing").eq("id", id).maybeSingle();
    webinar = legacyWebinar.data ? { ...legacyWebinar.data, trainer_id: null, google_event_id: null, duration_minutes: null } : null;
    webinarError = legacyWebinar.error;
  }

  if (webinarError) return { success: false, message: webinarError.message };
  if (!webinar) return { success: false, message: "Webinar not found or already deleted." };

  if (webinar.trainer_id && webinar.google_event_id) {
    await deleteGoogleEventForWebinar({
      trainer_id: webinar.trainer_id,
      google_event_id: webinar.google_event_id
    });
  }

  const { error: deleteError } = await supabase.from("webinars").delete().eq("id", id);
  if (deleteError) return { success: false, message: deleteError.message };

  await sendOpsWebinarUpdate(
    `Webinar cancelled: ${webinar.title}\nScheduled: ${formatDate(webinar.webinar_timing)} (${webinar.duration_minutes ?? 60} min)`
  );

  revalidatePath("/admin/webinars");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/trainer/webinars");
  revalidatePath("/trainer/calendar");
  revalidatePath("/trainer/dashboard");
  return { success: true, message: "Webinar deleted." };
}

export async function updateWebinarPostLinkAction(id: string, postWebinarLink: string): Promise<ActionResponse> {
  await requireRole("admin");
  if (!id) return { success: false, message: "Missing webinar id." };

  const value = postWebinarLink.trim();
  if (!value) return { success: false, message: "Post-webinar link cannot be empty." };

  let normalized: string;
  try {
    normalized = new URL(value).toString();
  } catch {
    return { success: false, message: "Enter a valid URL (https://...)." };
  }

  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("webinars")
    .update({ post_webinar_link: normalized, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/webinars");
  revalidatePath("/trainer/webinars");
  return { success: true, message: "Post-webinar link updated." };
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
