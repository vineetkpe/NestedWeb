import assert from "node:assert/strict";
import { test } from "node:test";

import { getWorkspaceProjectSetupStatus } from "./workspace-project-setup.ts";

test("reports configuration readiness for the signed-in workspace workflow", () => {
  const status = getWorkspaceProjectSetupStatus({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key",
  });

  assert.deepEqual(status, {
    available: true,
    missing: [],
    message: "Signed-in workspace setup is ready.",
  });
});

test("surfaces missing environment values before the workflow is exposed", () => {
  const status = getWorkspaceProjectSetupStatus({});

  assert.deepEqual(status, {
    available: false,
    missing: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ],
    message:
      "Workspace setup is unavailable until Supabase configuration is added.",
  });
});
