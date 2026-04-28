import { createClient } from "@/lib/supabase/server";

export async function autoCompletePastWebinars() {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.rpc("auto_complete_past_webinars");
  if (!error) return;
  // Fallback if the RPC isn't deployed yet (42883 = undefined function).
  // Uses webinar_timing alone since we can't add the duration server-side here;
  // a 60-minute buffer keeps it conservative.
  if (error.code === "42883" || /auto_complete_past_webinars/i.test(error.message ?? "")) {
    const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
      .from("webinars")
      .update({ status: "completed" })
      .eq("status", "upcoming")
      .lt("webinar_timing", cutoffIso);
  }
}

export async function getAdminDashboardData() {
  await autoCompletePastWebinars();
  const supabase = (await createClient()) as any;
  const nowIso = new Date().toISOString();

  const [{ data: trainers }, { data: webinars }, { data: metrics }, { data: csvRated }] = await Promise.all([
    supabase.from("trainers").select("*").order("created_at", { ascending: false }),
    supabase.from("webinars").select("*").order("webinar_timing", { ascending: true }),
    supabase.from("webinar_metrics").select("*"),
    supabase.from("trainer_ratings").select("webinar_id").eq("source", "csv").not("webinar_id", "is", null)
  ]);

  const upcomingWebinars = (webinars ?? []).filter((webinar) => webinar.webinar_timing >= nowIso && webinar.status !== "cancelled");
  const pastWebinars = (webinars ?? []).filter((webinar) => webinar.webinar_timing < nowIso || webinar.status === "completed");
  const completedWebinars = (webinars ?? []).filter((webinar) => webinar.status === "completed");
  const totalAttendees = (metrics ?? []).reduce((sum, item) => sum + item.attendees_count, 0);
  const averageRating =
    trainers && trainers.length > 0 ? trainers.reduce((sum, trainer) => sum + Number(trainer.average_rating ?? 0), 0) / trainers.length : 0;

  return {
    trainers: trainers ?? [],
    webinars: webinars ?? [],
    upcomingWebinars,
    pastWebinars,
    metrics: metrics ?? [],
    csvRatedWebinarIds: Array.from(new Set((csvRated ?? []).map((row) => row.webinar_id).filter(Boolean))),
    stats: {
      totalTrainers: trainers?.length ?? 0,
      upcomingCount: upcomingWebinars.length,
      pastCount: pastWebinars.length,
      completedCount: completedWebinars.length,
      averageRating,
      totalAttendees
    }
  };
}

export async function getTrainerDashboardData(profileId: string) {
  await autoCompletePastWebinars();
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
  const averageRating = Number(trainer.average_rating ?? 0);

  const leaderboard = await getLeaderboardData();
  const rank = leaderboard.find((row) => row.id === trainer.id)?.rank ?? null;

  return {
    trainer,
    webinars: webinars ?? [],
    upcoming,
    past,
    badges: badges ?? [],
    incentives: incentives ?? [],
    leaderboard,
    stats: {
      registrations,
      attendees,
      highestAudience,
      averageRating,
      completedWebinars: past.length,
      rank
    }
  };
}

export async function getLeaderboardData() {
  await autoCompletePastWebinars();
  const supabase = (await createClient()) as any;
  const { data: trainers } = await supabase.from("trainers").select("id, name, base_city, average_rating, webinars(id, status, webinar_metrics(attendees_count, highest_audience_count))");

  const rows = (trainers ?? []).map((trainer) => {
    const webinars = trainer.webinars ?? [];
    const completed = webinars.filter((item) => item.status === "completed").length;
    const metricRows = webinars.flatMap((item) => item.webinar_metrics ?? []);
    const totalAttendees = metricRows.reduce((sum, m) => sum + (m.attendees_count ?? 0), 0);
    const highestAudience = metricRows.reduce((max, m) => Math.max(max, m.highest_audience_count ?? m.attendees_count ?? 0), 0);

    return {
      id: trainer.id,
      name: trainer.name,
      city: trainer.base_city,
      averageRating: Number(trainer.average_rating),
      completedWebinars: completed,
      totalAttendees,
      highestAudience
    };
  });

  return rows
    .sort((a, b) => {
      if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
      if (b.completedWebinars !== a.completedWebinars) return b.completedWebinars - a.completedWebinars;
      return b.totalAttendees - a.totalAttendees;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
