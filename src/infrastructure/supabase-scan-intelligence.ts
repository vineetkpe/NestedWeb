import "server-only";

import {
  processScanIntelligence,
  type ProcessScanIntelligenceRequest,
  type ProcessScanIntelligenceResult,
} from "../application/scan-intelligence.ts";
import {
  executeSupabaseCitationNormalization,
  type SupabaseCitationNormalizationRpcName,
} from "./supabase-citation-normalization.ts";
import {
  executeSupabaseMentionDetection,
  type SupabaseMentionDetectionRpcName,
} from "./supabase-mention-detection.ts";

export type SupabaseScanIntelligenceRpcName =
  SupabaseCitationNormalizationRpcName | SupabaseMentionDetectionRpcName;

export type SupabaseScanIntelligenceRpc = (
  name: SupabaseScanIntelligenceRpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/**
 * Server-only composition of Level 3 intelligence over Supabase RPCs.
 * Composes list/persist citation normalization and read/persist mention
 * detection through atomic, narrow database functions.
 */
export function executeSupabaseScanIntelligence(
  request: ProcessScanIntelligenceRequest,
  rpc: SupabaseScanIntelligenceRpc,
): Promise<ProcessScanIntelligenceResult> {
  return processScanIntelligence(request, {
    normalizeCitations: (req) => executeSupabaseCitationNormalization(req, rpc),
    detectMentions: (req) => executeSupabaseMentionDetection(req, rpc),
  });
}
