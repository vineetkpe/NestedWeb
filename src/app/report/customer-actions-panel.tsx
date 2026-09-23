import React from "react";
import type { CustomerAction } from "../../domain/customer-actions.ts";

export type CustomerActionsPanelProps = Readonly<{
  projectName: string;
  actions: readonly CustomerAction[];
}>;

const CATEGORY_LABELS: Readonly<
  Record<string, { label: string; badgeClasses: string }>
> = {
  comparison_defense: {
    label: "Comparison Defense",
    badgeClasses: "bg-warning/10 text-warning border-warning/20",
  },
  citation_building: {
    label: "Citation Building",
    badgeClasses: "bg-accent text-accent-foreground border-border",
  },
  content_expansion: {
    label: "Content Expansion",
    badgeClasses: "bg-success/10 text-success border-success/20",
  },
};

const IMPACT_BADGES: Readonly<Record<string, string>> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

export function CustomerActionsPanel({
  projectName,
  actions,
}: CustomerActionsPanelProps) {
  if (actions.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-6 text-center">
        <p className="font-medium text-foreground">
          No specific action proposals generated yet.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Actions will be generated once a full scan with answered AI queries is
          completed for {projectName}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actions.map((action) => {
        const cat = CATEGORY_LABELS[action.category] ?? {
          label: action.category,
          badgeClasses: "bg-muted text-muted-foreground border-border",
        };
        const impactBadge = IMPACT_BADGES[action.impact] ?? IMPACT_BADGES.low;

        return (
          <div
            key={action.actionId}
            className="rounded-md border border-border bg-card p-5 transition-colors hover:border-border/80"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${cat.badgeClasses}`}
                >
                  {cat.label}
                </span>
                <span
                  className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${impactBadge}`}
                >
                  {action.impact} impact
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                ID: {action.actionId}
              </span>
            </div>

            <h3 className="mt-3 text-base font-semibold text-foreground">
              {action.title}
            </h3>

            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {action.rationale}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border/50 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Target Entity:
              </span>
              <span className="rounded-xs bg-muted px-2 py-0.5 font-mono text-foreground">
                {action.targetEntity}
              </span>
              <span className="ml-auto font-mono">
                {action.supportingQueryIds.length} supporting{" "}
                {action.supportingQueryIds.length === 1 ? "query" : "queries"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
