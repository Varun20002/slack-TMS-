import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-16">
      <div className="grid w-full gap-6 md:grid-cols-2">
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl">Admin Portal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Manage trainer onboarding, webinar planning, ratings uploads, and operational insights.
            </p>
            <Link href="/login/admin?switch=1" className="block">
              <Button className="w-full">Go to Admin Login</Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl">Trainer Portal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Track upcoming webinars, update availability, compare leaderboard rank, and manage your profile.
            </p>
            <Link href="/login/trainer?switch=1" className="block">
              <Button className="w-full">Go to Trainer Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
