"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

function getRemainingLabel(targetIso: string) {
  const targetMs = new Date(targetIso).getTime();
  if (Number.isNaN(targetMs)) return "Invalid date";

  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) return "Started";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 2) {
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  return `${hours}h ${minutes}m left`;
}

export function TimeRemainingBadge({ targetIso }: { targetIso: string }) {
  const [label, setLabel] = useState(() => getRemainingLabel(targetIso));

  useEffect(() => {
    setLabel(getRemainingLabel(targetIso));

    const interval = setInterval(() => {
      setLabel(getRemainingLabel(targetIso));
    }, 30_000);

    return () => clearInterval(interval);
  }, [targetIso]);

  return <Badge>{label}</Badge>;
}

