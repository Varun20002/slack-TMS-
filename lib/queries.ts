import { createClient } from "@/lib/supabase/server";

export async function getAdminDashboardData() {
  const supabase = (await createClient()) as any;
  const nowIso = new Date().toISOString();

  const [{ data: trainers }, { data: webinars }, { data: metrics }] = await Promise.all([
    supabase.from("trainers").select("*").order("created_at", { ascending: false }),
    supabase.from("webinars").select("*").order("webinar_timing", { ascending: true }),
    supabase.from("webinar_metrics").select("*")
  ]);

  const upcomingWebinars = (webinars ?? []).filter((webinar) => webinar.webinar_timing >= nowIso && webinar.status !== "cancelled");
  const pastWebinars = (webinars ?? []).filter((webinar) => webinar.webinar_timing < nowIso || webinar.status === "completed");
  const totalAttendees = (metrics ?? []).reduce((sum, item) => sum + item.attendees_count, 0);
  const averageRating =
    trainers && trainers.length > 0 ? trainers.reduce((sum, trainer) => sum + Number(trainer.average_rating ?? 0), 0) / trainers.length : 0;

  return {
    trainers: trainers ?? [],
    webinars: webinars ?? [],
    upcomingWebinars,
    pastWebinars,
    metrics: metrics ?? [],
    stats: {
      totalTrainers: trainers?.length ?? 0,
      upcomingCount: upcomingWebinars.length,
      pastCount: pastWebinars.length,
      averageRating,
      totalAttendees
    }
  };
}

export async function getTrainerDashboardData(profileId: string) {
  const supabase = (await createClient()) as any;
  const nowIso = new Date().toISOString();

  const { data: trainer } = await supabase.from("trainers").select("*").eq("profile_id", profileId).maybeSingle();
  if (!trainer) return null;

  const [{ data: webinars }, { data: badges }, { data: incentives }] = await Promise.all([
    supabase.from("webinars").select("*, webinar_metrics(*)").eq("trainer_id", trainer.id).order("webinar_timing", { ascending: true }),
    supabase.from("trainer_badges").select("id, badge_id, awarded_at, badges(*)").eq("trainer_id", trainer.id).order("awarded_at", { ascending: false }),
    supabase.from("incentives").select("*").eq("trainer_id", trainer.id).order("awarded_at", { ascending: false })
  ]);

  const upcoming = (webinars ?? []).filter((item) => item.webinar_timing >= nowIso && item.status !== "cancelled");
  const past = (webinars ?? []).filter((item) => item.webinar_timing < nowIso || item.status === "completed");

  const metricRows = (webinars ?? [])
    .flatMap((item) => (Array.isArray(item.webinar_metrics) ? item.webinar_metrics : item.webinar_metrics ? [item.webinar_metrics] : []))
    .filter(Boolean);

  const registrations = metricRows.reduce((sum, item) => sum + item.registrations_count, 0);
  const attendees = metricRows.reduce((sum, item) => sum + item.attendees_count, 0);
  const highestAudience = metricRows.reduce((max, item) => Math.max(max, item.highest_audience_count ?? item.attendees_count), 0);
  const averageRating = metricRows.length ? metricRows.reduce((sum, item) => sum + Number(item.rating ?? 0), 0) / metricRows.length : trainer.average_rating;

  return {
    trainer,
    webinars: webinars ?? [],
    upcoming,
    past,
    badges: badges ?? [],
    incentives: incentives ?? [],
    stats: {
      registrations,
      attendees,
      highestAudience,
      averageRating,
      completedWebinars: past.length
    }
  };
}

export async function getLeaderboardData() {
  const supabase = (await createClient()) as any;
  const { data: trainers } = await supabase.from("trainers").select("id, name, base_city, average_rating, webinars(id, status, webinar_metrics(attendees_count, highest_audience_count))");

  const rows = (trainers ?? []).map((trainer) => {
    const webinars = trainer.webinars ?? [];
    const completed = webinars.filter((item) => item.status === "completed").length;
    const metricRows = webinars.flatMap((item) => item.webinar_metrics ?? []);
    const totalAttendees = metricRows.reduce((sum, m) => sum + (m.attendees_count ?? 0), 0);
    const highestAudience = metricRows.reduce((max, m) => Math.max(max, m.highest_audience_count ?? m.attendees_count ?? 0), 0);
    const score = Number((Number(trainer.average_rating) * 0.5 + completed * 0.3 + totalAttendees * 0.2 / 100).toFixed(3));

    return {
      id: trainer.id,
      name: trainer.name,
      city: trainer.base_city,
      averageRating: Number(trainer.average_rating),
      completedWebinars: completed,
      totalAttendees,
      highestAudience,
      score
    };
  });

  return rows.sort((a, b) => b.score - a.score).map((row, index) => ({ ...row, rank: index + 1 }));
}
