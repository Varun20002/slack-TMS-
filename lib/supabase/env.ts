function getEnv(key: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value =
    key === "NEXT_PUBLIC_SUPABASE_ANON_KEY"
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      : process.env[key];
  if (!value) {
    const extra =
      key === "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        ? " (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
        : "";
    throw new Error(`Missing ${key}${extra}. Add it to .env.local and Vercel env vars.`);
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    url: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}
