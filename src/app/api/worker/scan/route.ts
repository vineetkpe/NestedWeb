import crypto from "node:crypto";
import { NextResponse } from "next/server.js";

import { runConfiguredScanWorkerOnce } from "../../../../infrastructure/supabase/scan-worker-server.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isWorkerAuthorized(
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

async function handleWorkerExecution(request: Request) {
  if (!isWorkerAuthorized(request)) {
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
  const result = await runConfiguredScanWorkerOnce();
  const durationMs = Date.now() - startTime;

  if (result.ok) {
    if (result.state === "idle") {
      return NextResponse.json(
        {
          ok: true,
          status: "idle",
          message: "No pending scans available in queue.",
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
        ok: true,
        status: result.state,
        scanId: result.scanId,
        attemptId: result.attemptId,
        observationCount: result.observationIds.length,
        durationMs,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      },
    );
  }

  if (result.stage === "server_setup") {
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

  return NextResponse.json(
    {
      ok: false,
      status: "error",
      stage: result.stage,
      code: "code" in result ? result.code : "worker_execution_failed",
      durationMs,
    },
    {
      status: 500,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}

export async function GET(request: Request) {
  return handleWorkerExecution(request);
}

export async function POST(request: Request) {
  return handleWorkerExecution(request);
}
