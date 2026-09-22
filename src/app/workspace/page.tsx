import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { ClaimedLiveProviderFactory } from "../../application/claim-scan-execution.ts";
import { buildProjectScanLaunchRequest } from "../../application/project-scan-launch.ts";
import { getWorkspaceProjectSetupStatus } from "../../application/workspace-project-setup.ts";
import { createLiveGeminiProvider } from "../../infrastructure/gemini.ts";
import {
  createCurrentUserProject,
  listCurrentUserProjects,
} from "../../infrastructure/supabase/projects-server.ts";
import { runCurrentUserProjectBoundedScan } from "../../infrastructure/supabase/project-bounded-scan-server.ts";
import { bootstrapCurrentUserWorkspace } from "../../infrastructure/supabase/workspace-bootstrap-server.ts";
import { getWorkspaceQuotaSummary } from "../../application/plan-entitlements.ts";
import { AppHeader } from "../components/app-header.tsx";
import {
  PlanUsagePanel,
  type QuotaInspectionResult,
} from "./plan-usage-panel.tsx";
import { ProjectListPanel } from "./project-list-panel.tsx";

export const metadata: Metadata = {
  title: "Workspace setup — AI Visibility OS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const setupStatus = getWorkspaceProjectSetupStatus(process.env);

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed !== value ||
    !UUID_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed.toLowerCase();
}

async function createWorkspaceAction(formData: FormData) {
  "use server";

  if (!setupStatus.available) {
    return;
  }

  const workspaceName = String(formData.get("workspaceName") ?? "").trim();
  if (workspaceName.length === 0) {
    return;
  }

  const result = await bootstrapCurrentUserWorkspace({
    workspaceName,
    idempotencyKey: crypto.randomUUID(),
  });

  if (result.ok) {
    redirect("/workspace");
  }
}

async function createProjectAction(formData: FormData) {
  "use server";

  if (!setupStatus.available) {
    return;
  }

  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const projectName = String(formData.get("projectName") ?? "").trim();
  const trackedWebsite = String(formData.get("trackedWebsite") ?? "").trim();

  if (
    workspaceId.length === 0 ||
    projectName.length === 0 ||
    trackedWebsite.length === 0
  ) {
    return;
  }

  const result = await createCurrentUserProject({
    workspaceId,
    name: projectName,
    website: trackedWebsite,
    idempotencyKey: crypto.randomUUID(),
  });

  if (result.ok) {
    redirect("/workspace");
  }
}

async function loadProjectsAction(formData: FormData) {
  "use server";

  const workspaceId = normalizeUuid(String(formData.get("workspaceId") ?? ""));
  if (!setupStatus.available || workspaceId === null) {
    return {
      ok: false,
      message: "Provide a valid workspace ID to load project records.",
      projects: [],
    } as const;
  }

  const result = await listCurrentUserProjects({ workspaceId });
  if (!result.ok) {
    return {
      ok: false,
      message: "Unable to load current projects for this workspace.",
      projects: [],
    } as const;
  }

  return {
    ok: true,
    message: `Loaded ${result.projects.length} project${result.projects.length === 1 ? "" : "s"}.`,
    projects: result.projects.map((project) => ({
      id: project.projectId,
      name: project.name,
      trackedDomain: project.trackedDomain,
    })),
  } as const;
}

async function checkWorkspaceQuotaAction(
  _previousState: QuotaInspectionResult,
  formData: FormData,
): Promise<QuotaInspectionResult> {
  "use server";

  const workspaceId = normalizeUuid(String(formData.get("workspaceId") ?? ""));
  if (!setupStatus.available || workspaceId === null) {
    return {
      ok: false,
      message: "Provide a valid workspace ID to inspect plan quotas.",
      summary: null,
    };
  }

  const listResult = await listCurrentUserProjects({ workspaceId });
  if (!listResult.ok) {
    return {
      ok: false,
      message: "Unable to inspect plan quota: workspace access denied.",
      summary: null,
    };
  }

  const quotaResult = await getWorkspaceQuotaSummary(
    { workspaceId },
    async (id) => ({
      ok: true as const,
      usage: {
        workspaceId: id,
        tier: "free_tier" as const,
        projectCount: listResult.projects.length,
        monthScans: 0,
        activeScans: 0,
      },
    }),
  );

  if (!quotaResult.ok) {
    return {
      ok: false,
      message: "Unable to calculate quota summary.",
      summary: null,
    };
  }

  return {
    ok: true,
    message: `Loaded plan quotas for workspace ${workspaceId.slice(0, 8)}…`,
    summary: quotaResult.summary,
  };
}

async function prepareProjectScanAction(formData: FormData) {
  "use server";

  const workspaceId = normalizeUuid(String(formData.get("workspaceId") ?? ""));
  const projectId = normalizeUuid(String(formData.get("projectId") ?? ""));

  const launch = buildProjectScanLaunchRequest({
    workspaceId,
    projectId,
    workerId: crypto.randomUUID(),
    leaseSeconds: 60,
  });

  if (!launch.ok) {
    return {
      ok: false,
      message: "Select a valid workspace and project before preparing a scan.",
    } as const;
  }

  const providerFactory: ClaimedLiveProviderFactory = (providerConfig) => {
    if (!process.env.GEMINI_API_KEY) return null;
    const setup = createLiveGeminiProvider({
      model: providerConfig.modelId,
      maxOutputTokens: providerConfig.maxOutputTokens,
      env: process.env,
    });
    if (!setup.ok || !setup.provider.capabilities.liveExecution) return null;
    return setup.provider;
  };

  const result = await runCurrentUserProjectBoundedScan(
    launch.value,
    providerFactory,
  );

  if (result.state === "not_executed") {
    if (result.stage === "server_setup") {
      return {
        ok: false,
        message:
          "The project scan cannot start until the required Supabase and provider configuration is present.",
      } as const;
    }

    if (result.stage === "authorization") {
      return {
        ok: false,
        message:
          "This signed-in member is not authorized to run a scan for the selected project.",
      } as const;
    }

    if (result.stage === "project") {
      return {
        ok: false,
        message:
          "The selected project is not accessible in the current workspace.",
      } as const;
    }

    if (result.stage === "target") {
      return {
        ok: false,
        message: "The project domain is not a valid bounded scan target.",
      } as const;
    }

    if (result.stage === "crawl") {
      return {
        ok: false,
        message:
          "The project domain was valid but the crawl stage did not complete.",
      } as const;
    }

    if (result.stage === "cancelled") {
      return {
        ok: false,
        message: "The bounded scan was cancelled before completion.",
      } as const;
    }

    return {
      ok: false,
      message: "The bounded scan was stopped before execution.",
    } as const;
  }

  if (result.scan.state === "not_executed") {
    return {
      ok: false,
      message:
        "The project scan could not be reserved or claimed in the database.",
    } as const;
  }

  const execution = result.scan.execution;
  if (!execution.ok) {
    if (execution.stage === "provider_setup") {
      return {
        ok: true,
        message: `Project scan prepared and claimed for ${launch.value.projectId}. Live provider calls remain disabled until server credentials are configured.`,
      } as const;
    }

    return {
      ok: false,
      message: `Project scan execution stopped at ${execution.stage} stage.`,
    } as const;
  }

  if (execution.state === "idle") {
    return {
      ok: true,
      message: `No scan work currently pending for project ${launch.value.projectId}.`,
    } as const;
  }

  return {
    ok: true,
    message: `Project scan completed with state ${execution.state} for ${launch.value.projectId} (${execution.observationIds.length} observations).`,
  } as const;
}

export default function WorkspaceSetupPage() {
  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-card focus:p-3"
        href="#main-workspace"
      >
        Skip to content
      </a>
      <AppHeader currentSection="workspace" />
      <main
        id="main-workspace"
        tabIndex={-1}
        className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-16"
      >
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            Workspace setup
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Workspace setup
          </h1>
          <p className="mt-4 text-muted-foreground">
            This is the next operational boundary before real project and client
            data are exposed. The app can only begin the authenticated flow when
            the required Supabase configuration is present.
          </p>
        </div>

        <section className="rounded-md border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Current status</h2>
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {setupStatus.available
              ? "Signed-in workspace flow ready"
              : "Setup pending"}
          </p>
          <p className="mt-2 text-muted-foreground">{setupStatus.message}</p>

          {setupStatus.available ? (
            <div className="mt-6 rounded-sm border border-border bg-accent/40 p-4 text-sm text-muted-foreground">
              The app is ready for the workspace bootstrapping and project setup
              path once a signed-in member enters a real client project.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Add the missing environment values before exposing the real
                workspace flow.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {setupStatus.missing.length > 0 ? (
                  setupStatus.missing.map((key) => <li key={key}>{key}</li>)
                ) : (
                  <li>No environment values are missing.</li>
                )}
              </ul>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-md border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Workspace bootstrap</h2>
          <p className="mt-4 text-muted-foreground">
            Before any client project can be created, the current signed-in
            member needs a valid agency workspace identity. This is the tenant
            boundary for subsequent project and scan records.
          </p>

          <form action={createWorkspaceAction} className="mt-6 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="workspace-name"
                className="text-sm font-medium text-foreground"
              >
                Workspace name
              </label>
              <input
                id="workspace-name"
                name="workspaceName"
                type="text"
                disabled={!setupStatus.available}
                placeholder="Northstar SEO"
                className="min-h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={!setupStatus.available}
                className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create workspace
              </button>
              <span className="text-sm text-muted-foreground">
                {setupStatus.available
                  ? "Supabase is ready for tenant bootstrap."
                  : "Complete the required Supabase configuration first."}
              </span>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-md border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Current projects</h2>
          <p className="mt-4 text-muted-foreground">
            Review the workspace’s current client projects before creating a new
            one or selecting an existing brand for future scan work.
          </p>

          <ProjectListPanel
            loadProjectsAction={loadProjectsAction}
            launchScanAction={prepareProjectScanAction}
            disabled={!setupStatus.available}
          />
        </section>

        <section className="mt-8 rounded-md border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Plan & usage accounting</h2>
          <p className="mt-4 text-muted-foreground">
            Monitor your agency’s active tier, tracked client capacity, and scan
            execution limits. Entitlements are strictly verified server-side
            before provider resources are reserved.
          </p>

          <div className="mt-6">
            <PlanUsagePanel
              checkQuotaAction={checkWorkspaceQuotaAction}
              disabled={!setupStatus.available}
            />
          </div>
        </section>

        <section className="mt-8 rounded-md border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Project setup</h2>
          <p className="mt-4 text-muted-foreground">
            The next proof point is a real client project linked to the current
            workspace. This confirms the agency can create and manage a tracked
            domain before any report or recommendation logic is exposed.
          </p>

          <form action={createProjectAction} className="mt-6 space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="workspace-id"
                className="text-sm font-medium text-foreground"
              >
                Workspace ID
              </label>
              <input
                id="workspace-id"
                name="workspaceId"
                type="text"
                disabled={!setupStatus.available}
                placeholder="00000000-0000-4000-8000-000000000000"
                className="min-h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="project-name"
                className="text-sm font-medium text-foreground"
              >
                Client project name
              </label>
              <input
                id="project-name"
                name="projectName"
                type="text"
                disabled={!setupStatus.available}
                placeholder="Acme Growth"
                className="min-h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="tracked-website"
                className="text-sm font-medium text-foreground"
              >
                Tracked website
              </label>
              <input
                id="tracked-website"
                name="trackedWebsite"
                type="url"
                disabled={!setupStatus.available}
                placeholder="https://www.acme.com"
                className="min-h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={!setupStatus.available}
                className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create client project
              </button>
              <span className="text-sm text-muted-foreground">
                {setupStatus.available
                  ? "Workspace credentials are available."
                  : "Complete the required Supabase configuration first."}
              </span>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-md border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Next steps</h2>
          <ol className="mt-6 list-decimal space-y-4 pl-5 text-muted-foreground">
            <li>Configure the public Supabase URL and publishable key.</li>
            <li>
              Verify the workspace and member tables are available in the app
              tenant.
            </li>
            <li>
              Start the real workspace bootstrap and project creation flow for
              an authenticated agency member.
            </li>
          </ol>
        </section>
      </main>
    </>
  );
}
