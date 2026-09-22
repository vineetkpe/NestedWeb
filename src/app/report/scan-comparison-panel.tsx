import React from "react";
import type {
  ScanComparisonReport,
  MetricDeltaResult,
  QueryObservationShift,
} from "../../domain/scan-comparison.ts";

export type ScanComparisonPanelProps = Readonly<{
  projectName: string;
  comparisonReport?: ScanComparisonReport | null;
}>;

function DeltaPill({
  label,
  deltaResult,
}: {
  label: string;
  deltaResult: MetricDeltaResult;
}) {
  if (deltaResult.state === "unavailable") {
    return (
      <div className="rounded-sm border border-border bg-muted/30 p-4">
        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </dt>
        <dd className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-semibold text-muted-foreground">—</span>
          <span className="text-xs text-muted-foreground">Unavailable</span>
        </dd>
      </div>
    );
  }

  const {
    delta,
    baselineValue,
    targetValue,
    direction,
    relativeChangePercent,
  } = deltaResult;

  const isPositive = direction === "improved";
  const isNegative = direction === "regressed";

  const colorClasses = isPositive
    ? "text-emerald-400 border-emerald-800/40 bg-emerald-950/20"
    : isNegative
      ? "text-rose-400 border-rose-800/40 bg-rose-950/20"
      : "text-muted-foreground border-border bg-muted/20";

  const prefix = delta > 0 ? "+" : "";

  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </dt>
      <dd className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {targetValue.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">
            from {baselineValue.toFixed(1)}%
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold ${colorClasses}`}
          aria-label={`${label} change: ${prefix}${delta.toFixed(1)}%`}
        >
          {prefix}
          {delta.toFixed(1)}%
          {relativeChangePercent !== null && relativeChangePercent !== 0 ? (
            <span className="ml-1 opacity-75">
              ({prefix}
              {relativeChangePercent.toFixed(1)}% rel)
            </span>
          ) : null}
        </span>
      </dd>
    </div>
  );
}

function ShiftRow({ shift }: { shift: QueryObservationShift }) {
  const isGainedMention = shift.mentionShift === "gained_mention";
  const isLostMention = shift.mentionShift === "lost_mention";

  const badgeClasses = isGainedMention
    ? "text-emerald-400 border-emerald-800/40 bg-emerald-950/30"
    : isLostMention
      ? "text-rose-400 border-rose-800/40 bg-rose-950/30"
      : "text-muted-foreground border-border bg-muted/20";

  const shiftLabel = isGainedMention
    ? "Gained Mention"
    : isLostMention
      ? "Lost Mention"
      : shift.mentionShift === "retained_mention"
        ? "Retained Mention"
        : "Unmentioned";

  return (
    <tr className="border-b border-border text-sm last:border-0 hover:bg-muted/10">
      <td className="p-3 align-top font-medium text-foreground">
        {shift.promptText}
        <span className="ml-2 inline-block rounded-xs bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
          {shift.category}
        </span>
      </td>
      <td className="p-3 align-top">
        <span
          className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${badgeClasses}`}
        >
          {shiftLabel}
        </span>
      </td>
      <td className="p-3 align-top text-xs text-muted-foreground">
        {shift.recommendationShift === "gained_recommendation" ? (
          <span className="text-emerald-400 font-medium">
            ★ Newly recommended
          </span>
        ) : shift.recommendationShift === "lost_recommendation" ? (
          <span className="text-rose-400 font-medium">
            Dropped recommendation
          </span>
        ) : shift.recommendationShift === "retained_recommendation" ? (
          <span>★ Maintained recommendation</span>
        ) : (
          <span>No recommendation</span>
        )}
      </td>
    </tr>
  );
}

export function ScanComparisonPanel({
  projectName,
  comparisonReport,
}: ScanComparisonPanelProps) {
  if (!comparisonReport) {
    return (
      <div className="space-y-4">
        <div className="rounded-sm border border-border bg-accent/20 p-5">
          <p className="font-medium text-foreground">
            {projectName && projectName !== "Company not selected"
              ? `Awaiting subsequent scan baseline for ${projectName}.`
              : "Awaiting subsequent scan baseline."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Historical comparison requires at least two completed scans for the
            same project and buyer prompt cohort. Once a subsequent scan is
            executed, this monitor automatically tracks metric movement, gained
            brand presence, and competitor shifts.
          </p>
        </div>
      </div>
    );
  }

  const {
    trajectory,
    mentionRateDelta,
    recommendationRateDelta,
    aiShareOfVoiceDelta,
    citationShareDelta,
    shifts,
    summary,
  } = comparisonReport;

  const trajectoryBadgeClasses =
    trajectory === "improving"
      ? "text-emerald-400 border-emerald-800/50 bg-emerald-950/40"
      : trajectory === "regressing"
        ? "text-rose-400 border-rose-800/50 bg-rose-950/40"
        : trajectory === "mixed"
          ? "text-amber-400 border-amber-800/50 bg-amber-950/40"
          : "text-muted-foreground border-border bg-muted/40";

  return (
    <div className="space-y-8">
      {/* Trajectory Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border bg-accent/30 p-5">
        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overall Scan Movement Trajectory
          </span>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-foreground capitalize">
            {trajectory} Trajectory
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Comparing scan{" "}
            {comparisonReport.metadata.baselineScanId.slice(0, 8)}… to{" "}
            {comparisonReport.metadata.targetScanId.slice(0, 8)}…
          </p>
        </div>
        <span
          className={`rounded-sm border px-3 py-1 text-sm font-semibold capitalize ${trajectoryBadgeClasses}`}
        >
          {trajectory}
        </span>
      </div>

      {/* Metric Delta Cards Grid */}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DeltaPill label="Mention Rate" deltaResult={mentionRateDelta} />
        <DeltaPill
          label="Recommendation Rate"
          deltaResult={recommendationRateDelta}
        />
        <DeltaPill
          label="AI Share of Voice"
          deltaResult={aiShareOfVoiceDelta}
        />
        <DeltaPill label="Citation Share" deltaResult={citationShareDelta} />
      </dl>

      {/* Net Movement Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">
            Brand Mention Movement
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Net change in buyer queries mentioning {projectName}
          </p>
          <div className="mt-4 flex items-center gap-6">
            <div>
              <span className="block text-2xl font-bold text-emerald-400">
                +{summary.gainedMentionsCount}
              </span>
              <span className="text-xs text-muted-foreground">
                Gained Queries
              </span>
            </div>
            <div>
              <span className="block text-2xl font-bold text-rose-400">
                -{summary.lostMentionsCount}
              </span>
              <span className="text-xs text-muted-foreground">
                Lost Queries
              </span>
            </div>
            <div className="border-l border-border pl-6">
              <span className="block text-2xl font-bold text-foreground">
                {summary.netMentionChange > 0
                  ? `+${summary.netMentionChange}`
                  : summary.netMentionChange}
              </span>
              <span className="text-xs text-muted-foreground">Net Shift</span>
            </div>
          </div>
        </div>

        <div className="rounded-sm border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">
            Recommendation Movement
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Net change in queries where {projectName} was explicitly recommended
          </p>
          <div className="mt-4 flex items-center gap-6">
            <div>
              <span className="block text-2xl font-bold text-emerald-400">
                +{summary.gainedRecommendationsCount}
              </span>
              <span className="text-xs text-muted-foreground">Gained</span>
            </div>
            <div>
              <span className="block text-2xl font-bold text-rose-400">
                -{summary.lostRecommendationsCount}
              </span>
              <span className="text-xs text-muted-foreground">Lost</span>
            </div>
            <div className="border-l border-border pl-6">
              <span className="block text-2xl font-bold text-foreground">
                {summary.netRecommendationChange > 0
                  ? `+${summary.netRecommendationChange}`
                  : summary.netRecommendationChange}
              </span>
              <span className="text-xs text-muted-foreground">Net Shift</span>
            </div>
          </div>
        </div>
      </div>

      {/* Query Movement Detail Table */}
      {shifts.length > 0 ? (
        <div className="rounded-sm border border-border bg-card">
          <div className="border-b border-border p-4">
            <h4 className="text-base font-semibold text-foreground">
              Query-Level Observation Shifts
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Traceable query movement between baseline and target scan
              snapshots
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-xs font-semibold text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="p-3">
                    Buyer Query
                  </th>
                  <th scope="col" className="p-3">
                    Brand Mention Shift
                  </th>
                  <th scope="col" className="p-3">
                    Recommendation Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <ShiftRow key={shift.queryId} shift={shift} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
