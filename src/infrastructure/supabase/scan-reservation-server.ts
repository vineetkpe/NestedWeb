import "server-only";

import {
  reserveScan,
  type ReserveScanRequest,
  type ReserveScanResult,
} from "../../application/scan-reservation.ts";
import { requireSupabaseIdentity } from "../supabase-auth.ts";
import { executeSupabaseScanReservation } from "../supabase-scan-reservation.ts";
import { createSupabaseServerClient } from "./server.ts";

/**
 * Authenticated reservation entry point only. Membership, project ownership,
 * limits, pricing and budget are re-checked atomically inside reserve_scan;
 * this boundary never executes a provider call.
 */
export async function reserveCurrentUserScan(
  request: ReserveScanRequest,
): Promise<ReserveScanResult> {
  const client = await createSupabaseServerClient();
  await requireSupabaseIdentity(client);

  return reserveScan(request, (validatedRequest) =>
    executeSupabaseScanReservation(validatedRequest, (args) =>
      client.rpc("reserve_scan", args),
    ),
  );
}
