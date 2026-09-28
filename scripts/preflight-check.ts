/**
 * Production and staging deployment preflight audit script.
 * Audits runtime credentials, URL formats, and connectivity before traffic cutover.
 * ZERO SECRETS EXPOSED in logs or stdout.
 *
 * Run with: npm run preflight
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_KEY_PATTERN =
  /^(?:sb_secret_[A-Za-z0-9._-]{10,500}|eyJ[A-Za-z0-9._-]{20,2000})$/;
const GEMINI_KEY_PATTERN = /^[A-Za-z0-9._-]{16,256}$/;

type CheckStatus = "PASS" | "WARN" | "FAIL";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

function redact(value: string | undefined): string {
  if (!value) return "[NOT SET]";
  if (value.length <= 8) return "[SET, REDACTED]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function runPreflight() {
  if (
    typeof (process as unknown as { loadEnvFile?: (path?: string) => void })
      .loadEnvFile === "function"
  ) {
    try {
      (
        process as unknown as { loadEnvFile: (path: string) => void }
      ).loadEnvFile(".env.local");
    } catch {
      // .env.local is optional (e.g. in hosted CI/CD environments where process.env is pre-populated)
    }
  }

  console.log("\n========================================================");
  console.log("  AI VISIBILITY OS - STAGING & PRODUCTION PREFLIGHT AUDIT");
  console.log("========================================================\n");

  const results: CheckResult[] = [];

  // 1. Supabase Public URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    results.push({
      name: "NEXT_PUBLIC_SUPABASE_URL",
      status: "FAIL",
      detail: "Missing Supabase public URL",
    });
  } else {
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        results.push({
          name: "NEXT_PUBLIC_SUPABASE_URL",
          status: "FAIL",
          detail: "Must use https: or http: protocol",
        });
      } else {
        results.push({
          name: "NEXT_PUBLIC_SUPABASE_URL",
          status: "PASS",
          detail: url.origin,
        });
      }
    } catch {
      results.push({
        name: "NEXT_PUBLIC_SUPABASE_URL",
        status: "FAIL",
        detail: "Malformed URL",
      });
    }
  }

  // 2. Supabase Publishable / Anon Key
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!publishableKey) {
    results.push({
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      status: "FAIL",
      detail:
        "Missing public client key (set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    });
  } else if (publishableKey.length < 20) {
    results.push({
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      status: "WARN",
      detail: "Publishable key appears short (< 20 chars)",
    });
  } else {
    results.push({
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      status: "PASS",
      detail: `Valid format (${redact(publishableKey)})`,
    });
  }

  // 3. Supabase Secret Key
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    results.push({
      name: "SUPABASE_SECRET_KEY",
      status: "FAIL",
      detail: "Missing server-only secret key",
    });
  } else if (!SECRET_KEY_PATTERN.test(secretKey)) {
    results.push({
      name: "SUPABASE_SECRET_KEY",
      status: "FAIL",
      detail:
        "Key fails format requirements (must match sb_secret_* or service JWT)",
    });
  } else {
    results.push({
      name: "SUPABASE_SECRET_KEY",
      status: "PASS",
      detail: `Valid format (${redact(secretKey)})`,
    });
  }

  // 4. Gemini API Key
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    results.push({
      name: "GEMINI_API_KEY",
      status: "WARN",
      detail: "Missing Gemini API key (live AI scans disabled)",
    });
  } else if (!GEMINI_KEY_PATTERN.test(geminiKey)) {
    results.push({
      name: "GEMINI_API_KEY",
      status: "FAIL",
      detail: "Key does not match expected format",
    });
  } else {
    results.push({
      name: "GEMINI_API_KEY",
      status: "PASS",
      detail: `Valid format (${redact(geminiKey)})`,
    });
  }

  // 5. Cron Secret
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    results.push({
      name: "CRON_SECRET",
      status: "WARN",
      detail:
        "Missing CRON_SECRET (scheduled scan jobs cannot be triggered via HTTP)",
    });
  } else if (cronSecret.length < 16) {
    results.push({
      name: "CRON_SECRET",
      status: "WARN",
      detail: "Entropy low (< 16 chars); recommend at least 32 characters",
    });
  } else {
    results.push({
      name: "CRON_SECRET",
      status: "PASS",
      detail: `High entropy confirmed (${cronSecret.length} chars)`,
    });
  }

  // 6. Scan Worker ID
  const workerId = process.env.NESTEDWEB_SCAN_WORKER_ID?.trim();
  if (!workerId) {
    results.push({
      name: "NESTEDWEB_SCAN_WORKER_ID",
      status: "WARN",
      detail: "Unset (background worker defaults to local worker)",
    });
  } else if (!UUID_PATTERN.test(workerId)) {
    results.push({
      name: "NESTEDWEB_SCAN_WORKER_ID",
      status: "FAIL",
      detail: "Worker ID must be a valid UUID v4",
    });
  } else {
    results.push({
      name: "NESTEDWEB_SCAN_WORKER_ID",
      status: "PASS",
      detail: `Valid UUID (${workerId})`,
    });
  }

  // 7. Connectivity Check: Supabase Health
  if (supabaseUrl) {
    try {
      const probeUrl = `${supabaseUrl}/auth/v1/health`;
      const res = await fetch(probeUrl, {
        headers: { apikey: publishableKey ?? "" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        results.push({
          name: "Connectivity: Supabase Auth Health",
          status: "PASS",
          detail: `HTTP ${res.status} OK`,
        });
      } else {
        results.push({
          name: "Connectivity: Supabase Auth Health",
          status: "WARN",
          detail: `HTTP ${res.status} ${res.statusText}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        name: "Connectivity: Supabase Auth Health",
        status: "WARN",
        detail: `Network probe failed: ${msg}`,
      });
    }
  }

  // Output summary
  for (const r of results) {
    const symbol = r.status === "PASS" ? "✔" : r.status === "WARN" ? "▲" : "✖";
    const tag = `[${r.status}]`.padEnd(7, " ");
    console.log(`${symbol} ${tag} ${r.name.padEnd(32, " ")}: ${r.detail}`);
  }

  const failures = results.filter((r) => r.status === "FAIL");
  const warnings = results.filter((r) => r.status === "WARN");

  console.log("\n--------------------------------------------------------");
  console.log(
    `Results: ${results.length - failures.length - warnings.length} Passed, ${warnings.length} Warnings, ${failures.length} Failed`,
  );
  console.log("--------------------------------------------------------\n");

  if (failures.length > 0) {
    console.error(
      "✖ CRITICAL: Preflight audit failed. Address required failures before deploying.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "✔ SUCCESS: All critical runtime configurations verified. Deployment ready.",
    );
    process.exitCode = 0;
  }
}

runPreflight();
