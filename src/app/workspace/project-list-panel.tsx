"use client";

import { useActionState, useState } from "react";

export type ProjectListItem = Readonly<{
  id: string;
  name: string;
  trackedDomain: string;
}>;

export type ProjectListState = Readonly<{
  ok: boolean;
  message: string;
  projects: readonly ProjectListItem[];
}>;

export function ProjectListPanel({
  loadProjectsAction,
  disabled,
}: Readonly<{
  loadProjectsAction: (formData: FormData) => Promise<ProjectListState>;
  disabled: boolean;
}>) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );

  const [state, formAction, isPending] = useActionState<
    ProjectListState,
    FormData
  >(
    async (_previousState: ProjectListState, formData: FormData) => {
      const result = await loadProjectsAction(formData);
      const firstProject = result.projects[0];

      if (firstProject && selectedProjectId === null) {
        setSelectedProjectId(firstProject.id);
      }

      return {
        ok: result.ok,
        message: result.message,
        projects: result.projects,
      };
    },
    {
      ok: false,
      message: "",
      projects: [],
    },
  );

  return (
    <div className="mt-6 space-y-5">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="workspace-id-list"
            className="text-sm font-medium text-foreground"
          >
            Workspace ID to load
          </label>
          <input
            id="workspace-id-list"
            name="workspaceId"
            type="text"
            disabled={disabled}
            placeholder="00000000-0000-4000-8000-000000000000"
            className="min-h-11 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={disabled || isPending}
          className="inline-flex min-h-11 items-center rounded-sm bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors duration-150 hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Loading…" : "Load projects"}
        </button>
      </form>

      {state.message ? (
        <div
          className={
            state.ok
              ? "rounded-sm border border-border bg-accent/40 p-3 text-sm text-muted-foreground"
              : "rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          }
        >
          {state.message}
        </div>
      ) : null}

      {state.projects.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Available projects
          </p>
          <ul className="space-y-3">
            {state.projects.map((project) => {
              const isSelected = project.id === selectedProjectId;
              return (
                <li
                  key={project.id}
                  className="rounded-sm border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {project.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {project.trackedDomain}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className="inline-flex min-h-9 items-center rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-ring"
                    >
                      {isSelected ? "Selected" : "Select project"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {selectedProjectId ? (
            <div className="rounded-sm border border-border bg-accent/40 p-3 text-sm text-muted-foreground">
              Selected project ID: {selectedProjectId}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
