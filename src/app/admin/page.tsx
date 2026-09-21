import type { Metadata } from "next";

import { AppHeader } from "../components/app-header.tsx";
import {
  createDefaultAdminTelemetryGateway,
  getAdminTelemetrySummary,
} from "../../application/admin-telemetry.ts";
import { AdminView } from "./admin-view.tsx";

export const metadata: Metadata = {
  title: "Admin Dashboard & Telemetry — AI Visibility OS",
  description:
    "System operational telemetry, worker queues, and tenant workspace monitoring.",
};

export default async function AdminPage() {
  const gateway = createDefaultAdminTelemetryGateway(process.env);
  const report = await getAdminTelemetrySummary(gateway);

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-card focus:p-3"
        href="#main-admin"
      >
        Skip to content
      </a>

      <AppHeader currentSection="admin" />

      <main
        id="main-admin"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"
      >
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administrative Operations & Telemetry
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            System Administration
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Inspect live operational health signals, scan worker leases, and
            agency tenant resource distribution.
          </p>
        </div>

        <AdminView report={report} />
      </main>
    </>
  );
}
