"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LeaderboardRatingChart({ data }: { data: Array<{ name: string; rating: number }> }) {
  const sorted = [...data].sort((a, b) => b.rating - a.rating);

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ top: 12, right: 12, bottom: 56, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
          <XAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-32}
            textAnchor="end"
            height={48}
          />
          <YAxis type="number" domain={[0, 5]} tick={{ fontSize: 12 }} width={36} />
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Bar dataKey="rating" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
