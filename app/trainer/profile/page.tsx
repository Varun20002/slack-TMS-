import Image from "next/image";

import { ProfileForm } from "@/components/layout/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerProfilePage() {
  const profile = await requireRole("trainer");
  const supabase = (await createClient()) as any;
  const { data: trainer } = await supabase.from("trainers").select("*").eq("profile_id", profile.id).maybeSingle();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trainer Profile</CardTitle>
          <CardDescription>You can edit phone and display email here. Auth email updates should be handled in Supabase Auth settings if required.</CardDescription>
        </CardHeader>
        <CardContent>
          {trainer?.profile_image_url ? (
            <div className="mb-6">
              <p className="mb-2 text-sm font-medium">Profile Photo</p>
              <Image
                src={trainer.profile_image_url}
                alt={`${profile.full_name} profile`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-full border object-cover"
                unoptimized
              />
            </div>
          ) : null}
          <ProfileForm defaults={{ full_name: profile.full_name, phone: profile.phone ?? "", email: profile.email }} />
        </CardContent>
      </Card>

      {trainer ? (
        <Card>
          <CardHeader>
            <CardTitle>Trainer Details</CardTitle>
            <CardDescription>All onboarding fields associated with your trainer record.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <Detail label="Name" value={trainer.name} />
              <Detail label="Experience (years)" value={trainer.experience} />
              <Detail label="Investing / Trading Persona" value={trainer.investing_trading_persona} />
              <Detail label="Strengths" value={trainer.strengths} />
              <Detail label="Product Categories" value={trainer.product_categories?.join(", ")} />
              <Detail label="Nature of Business" value={trainer.nature_of_business} />
              <Detail label="Phone Number" value={trainer.phone_number} />
              <Detail label="Email" value={trainer.email} />
              <Detail label="Languages Spoken" value={trainer.languages_spoken} />
              <Detail label="Base City" value={trainer.base_city} />
              <Detail label="Credentials / Claim to Fame" value={trainer.credentials_or_claim_to_fame} className="md:col-span-2" />
              <Detail label="Certifications" value={trainer.certifications} />
              <Detail
                label="Social Media Handles"
                value={
                  trainer.social_media_handles && Object.keys(trainer.social_media_handles).length
                    ? JSON.stringify(trainer.social_media_handles)
                    : null
                }
              />
              <Detail label="Average Rating" value={Number(trainer.average_rating ?? 0).toFixed(2)} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  className
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 rounded-lg border bg-muted/20 px-3 py-2 text-sm">{value && String(value).trim() ? value : "-"}</p>
    </div>
  );
}
