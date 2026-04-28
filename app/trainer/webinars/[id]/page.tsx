import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { WebinarDetailView, type WebinarDetail } from "@/components/shared/webinar-detail-view";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerWebinarDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id, name")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!trainer) {
    return (
      <EmptyState
        title="Trainer profile not linked"
        description="Ask admin to map your auth account to a trainer profile."
      />
    );
  }

  const { data: webinar, error } = await supabase
    .from("webinars")
    .select(
      "id, title, webinar_timing, duration_minutes, status, requirements, target_user_base, pre_webinar_link, post_webinar_link, google_calendar_embed_url, trainer_id, trainers(id, name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !webinar || webinar.trainer_id !== trainer.id) notFound();

  const { data: metrics } = await supabase
    .from("webinar_metrics")
    .select("registrations_count, attendees_count, rating, success_rate")
    .eq("webinar_id", id)
    .maybeSingle();

  const detail: WebinarDetail = {
    id: webinar.id,
    title: webinar.title,
    webinar_timing: webinar.webinar_timing,
    duration_minutes: webinar.duration_minutes ?? null,
    status: webinar.status,
    requirements: webinar.requirements ?? null,
    target_user_base: webinar.target_user_base ?? null,
    pre_webinar_link: webinar.pre_webinar_link ?? null,
    post_webinar_link: webinar.post_webinar_link ?? null,
    google_calendar_embed_url: webinar.google_calendar_embed_url ?? null,
    trainer: webinar.trainers ? { id: webinar.trainers.id, name: webinar.trainers.name } : null,
    metrics: metrics ?? null
  };

  return <WebinarDetailView webinar={detail} backHref="/trainer/availability" />;
}
