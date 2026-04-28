import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { WebinarDetailView, type WebinarDetail } from "@/components/shared/webinar-detail-view";
import { createClient } from "@/lib/supabase/server";

export default async function AdminWebinarDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = (await createClient()) as any;

  const { data: webinar, error } = await supabase
    .from("webinars")
    .select(
      "id, title, webinar_timing, duration_minutes, status, requirements, target_user_base, pre_webinar_link, post_webinar_link, google_calendar_embed_url, trainers(id, name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !webinar) {
    if (error?.code === "PGRST116" || !webinar) notFound();
    return (
      <EmptyState
        title="Could not load webinar"
        description={error?.message ?? "The webinar could not be loaded."}
      />
    );
  }

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

  return <WebinarDetailView webinar={detail} backHref="/admin/dashboard#calendar" />;
}
