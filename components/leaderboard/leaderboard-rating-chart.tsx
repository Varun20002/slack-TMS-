"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LeaderboardRatingChart({ data }: { data: Array<{ name: string; rating: number }> }) {
  const sorted = [...data].sort((a, b) => b.rating - a.rating);

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Bar dataKey="rating" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
