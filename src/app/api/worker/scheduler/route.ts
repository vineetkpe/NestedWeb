import crypto from "node:crypto";
import { NextResponse } from "next/server.js";

import { runConfiguredScanSchedulerOnce } from "../../../../infrastructure/supabase/scan-scheduler-server.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isSchedulerAuthorized(
  request: Request,
  envSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!envSecret || envSecret.trim().length === 0) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (timingSafeEqual(token, envSecret)) {
      return true;
    }
  }

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader && timingSafeEqual(cronHeader.trim(), envSecret)) {
    return true;
  }

  return false;
}

async function handleSchedulerExecution(request: Request) {
  if (!isSchedulerAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
        message: "A valid Bearer token or x-cron-secret header is required.",
      },
      {
        status: 401,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      },
    );
  }

  const startTime = Date.now();
  const result = await runConfiguredScanSchedulerOnce();
  const durationMs = Date.now() - startTime;

  if (result.ok) {
    return NextResponse.json(
      {
        ok: true,
        evaluatedCount: result.evaluatedCount,
        dueCount: result.dueCount,
        enqueuedCount: result.enqueuedCount,
        skippedQuotaCount: result.skippedQuotaCount,
        failedCount: result.failedCount,
        durationMs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      status: "disabled_or_misconfigured",
      stage: result.stage,
      code: result.code,
      durationMs,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}

export async function GET(request: Request) {
  return handleSchedulerExecution(request);
}

export async function POST(request: Request) {
  return handleSchedulerExecution(request);
}
