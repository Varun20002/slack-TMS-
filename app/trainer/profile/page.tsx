import Image from "next/image";
import { User } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerProfilePage() {
  const profile = await requireRole("trainer");
  const supabase = (await createClient()) as any;
  if (new Date(profile.updated_at).getTime() === new Date(profile.created_at).getTime()) {
    await supabase.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", profile.id);
  }
  const { data: trainer } = await supabase.from("trainers").select("*").eq("profile_id", profile.id).maybeSingle();
  if (!trainer) return null;

  const socialEntries: [string, string][] =
    trainer.social_media_handles && typeof trainer.social_media_handles === "object"
      ? (Object.entries(trainer.social_media_handles) as [string, unknown][])
          .filter(([, v]) => v)
          .map(([k, v]) => [k, String(v)])
      : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>A read-only summary of your onboarding details.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 md:grid-cols-[160px_1fr]">
            <div className="flex flex-col items-center gap-3">
              {trainer.profile_image_url ? (
                <Image
                  src={trainer.profile_image_url}
                  alt={`${profile.full_name} profile`}
                  width={140}
                  height={140}
                  className="h-36 w-36 rounded-full border object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center rounded-full border bg-muted/30">
                  <User className="h-14 w-14 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-semibold">{trainer.name}</p>
                <p className="text-sm text-muted-foreground">{trainer.investing_trading_persona}</p>
              </div>
            </div>

            <div className="space-y-6">
              <Section title="Basic Info">
                <Row label="Name" value={trainer.name} />
                <Row label="Experience" value={`${trainer.experience} years`} />
                <Row label="Persona" value={trainer.investing_trading_persona} />
                <Row label="Base City" value={trainer.base_city} />
              </Section>

              <Section title="Skills & Experience">
                <Row label="Strengths" value={trainer.strengths} />
                <Row label="Product Categories" value={trainer.product_categories?.join(", ")} />
                <Row label="Nature of Business" value={trainer.nature_of_business} />
                <Row label="Languages Spoken" value={trainer.languages_spoken} />
                <Row label="Bio" value={trainer.credentials_or_claim_to_fame} />
                <Row label="Certifications" value={trainer.certifications} />
              </Section>

              <Section title="Contact">
                <Row label="Email" value={trainer.email} />
                <Row label="Phone" value={trainer.phone_number} />
                {socialEntries.length
                  ? socialEntries.map(([platform, handle]) => (
                      <Row key={platform} label={platform.charAt(0).toUpperCase() + platform.slice(1)} value={String(handle)} />
                    ))
                  : <Row label="Social" value={null} />}
              </Section>

              <Section title="Performance">
                <Row label="Average Rating" value={Number(trainer.average_rating ?? 0).toFixed(2)} />
              </Section>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="divide-y divide-border/60 rounded-lg border">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value !== null && value !== undefined && String(value).trim() !== "" ? String(value) : "—";
  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{display}</dd>
    </div>
  );
}
