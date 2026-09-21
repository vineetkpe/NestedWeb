import { NextResponse } from "next/server";

const START_TIME = Date.now();

export async function GET() {
  const hasPublicUrl =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.trim().length > 0;
  const hasSecretKey =
    typeof process.env.SUPABASE_SECRET_KEY === "string" &&
    process.env.SUPABASE_SECRET_KEY.trim().length > 0;
  const hasGeminiKey =
    typeof process.env.GEMINI_API_KEY === "string" &&
    process.env.GEMINI_API_KEY.trim().length > 0;

  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

  const isConfigured = hasPublicUrl && hasSecretKey;
  const status = isConfigured ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      environment: process.env.NODE_ENV ?? "development",
      version: "0.1.0",
      services: {
        supabase: isConfigured ? "configured" : "pending_credentials",
        gemini: hasGeminiKey ? "configured" : "disabled_by_default",
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
