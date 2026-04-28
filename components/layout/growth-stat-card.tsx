import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function GrowthStatCard({
  label,
  percent,
  direction,
  hint
}: {
  label: string;
  percent: number;
  direction: "up" | "down" | "flat";
  hint?: string;
}) {
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : ArrowRight;
  const colorClass =
    direction === "up"
      ? "text-emerald-600"
      : direction === "down"
        ? "text-rose-600"
        : "text-muted-foreground";
  const sign = direction === "up" ? "+" : direction === "down" ? "-" : "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("flex items-center gap-2 text-2xl font-semibold", colorClass)}>
          <Icon className="h-6 w-6" aria-hidden />
          <span>
            {sign}
            {Math.abs(percent)}%
          </span>
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
