"use client";

import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type TrainerRecord = {
  id: string;
  name: string;
  experience: number;
  investing_trading_persona: string;
  strengths: string;
  product_categories: string[];
  nature_of_business: string;
  phone_number: string;
  email: string;
  languages_spoken: string;
  base_city: string;
  credentials_or_claim_to_fame: string | null;
  certifications: string | null;
  social_media_handles: Record<string, string> | null;
  profile_image_url?: string | null;
  session_rating_avg?: number;
  speaker_rating_avg?: number;
  coverage_rating_avg?: number;
  average_rating: number;
};

export function TrainerDetailsViewer({ trainers }: { trainers: TrainerRecord[] }) {
  const [selectedId, setSelectedId] = useState(trainers[0]?.id ?? "");
  const selectedTrainer = trainers.find((trainer) => trainer.id === selectedId) ?? trainers[0];

  if (!trainers.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trainer Details Viewer</CardTitle>
          <CardDescription>Create at least one trainer to view full onboarding details.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trainer Details Viewer</CardTitle>
        <CardDescription>Select an existing trainer to see all onboarding fields in one place.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-md">
          <Select value={selectedTrainer?.id} onChange={(event) => setSelectedId(event.target.value)}>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name} ({trainer.email})
              </option>
            ))}
          </Select>
        </div>

        {selectedTrainer ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Detail label="Name" value={selectedTrainer.name} />
            <Detail label="Experience (years)" value={selectedTrainer.experience} />
            <Detail label="Investing / Trading Persona" value={selectedTrainer.investing_trading_persona} />
            <Detail label="Strengths" value={selectedTrainer.strengths} />
            <Detail label="Product Categories" value={selectedTrainer.product_categories.join(", ")} />
            <Detail label="Nature of Business" value={selectedTrainer.nature_of_business} />
            <Detail label="Phone Number" value={selectedTrainer.phone_number} />
            <Detail label="Email" value={selectedTrainer.email} />
            <Detail label="Languages Spoken" value={selectedTrainer.languages_spoken} />
            <Detail label="Base City" value={selectedTrainer.base_city} />
            <Detail label="Credentials / Claim to Fame" value={selectedTrainer.credentials_or_claim_to_fame} className="md:col-span-2" />
            <Detail label="Certifications" value={selectedTrainer.certifications} />
            <Detail
              label="Social Media Handles"
              value={
                selectedTrainer.social_media_handles && Object.keys(selectedTrainer.social_media_handles).length
                  ? JSON.stringify(selectedTrainer.social_media_handles)
                  : null
              }
            />
            <Detail label="Profile Image URL" value={selectedTrainer.profile_image_url ?? null} className="md:col-span-2" />
            <Detail label="Session" value={Number(selectedTrainer.session_rating_avg ?? 0).toFixed(2)} />
            <Detail label="Speaker" value={Number(selectedTrainer.speaker_rating_avg ?? 0).toFixed(2)} />
            <Detail label="Coverage" value={Number(selectedTrainer.coverage_rating_avg ?? 0).toFixed(2)} />
            <Detail label="Average Rating" value={Number(selectedTrainer.average_rating).toFixed(2)} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
  className
}: {
  label: string;
  value: string | number | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 rounded-lg border bg-muted/20 px-3 py-2 text-sm">{value && String(value).trim() ? value : "-"}</p>
    </div>
  );
}
