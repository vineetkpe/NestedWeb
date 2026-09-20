import type { CompanyProfile } from "./company-profile.ts";
import type {
  GeneratedPrompt,
  PromptGenerationResult,
} from "./prompt-library.ts";
import type {
  ObservationFailureCode,
  RawObservation,
} from "./raw-observation.ts";

export type ScanRequest = Readonly<{
  scanId: string;
  attemptId: string;
  profile: CompanyProfile;
  cohort: Extract<PromptGenerationResult, { ok: true }>;
}>;

export type ScanFailure = Readonly<{
  code:
    | ObservationFailureCode
    | "invalid_request"
    | "invalid_clock"
    | "provider_exception"
    | "invalid_provider_response";
}>;

type AttemptIdentity = Readonly<{
  position: number;
  /** Reserved identity; an observation exists only when actually returned below. */
  attemptId: string;
  plannedPrompt: GeneratedPrompt;
}>;

export type ScanAttempt = AttemptIdentity &
  (
    | Readonly<{
        state: "answered" | "refused" | "partial";
        providerCalled: true;
        observation: RawObservation;
        failure: null;
      }>
    | Readonly<{
        state: "failed" | "cancelled";
        providerCalled: true;
        observation: RawObservation | null;
        failure: ScanFailure;
      }>
    | Readonly<{
        state: "not_attempted";
        providerCalled: boolean;
        observation: null;
        failure: ScanFailure;
      }>
  );

export type ScanResult =
  | Readonly<{
      ok: false;
      failure: { code: "invalid_scan" | "invalid_provider" };
    }>
  | (ScanRequest &
      Readonly<{
        ok: true;
        state: "settled" | "cancelled";
        attempts: readonly ScanAttempt[];
      }>);
