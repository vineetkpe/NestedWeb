import Link from "next/link";

interface AppHeaderProps {
  currentSection?: "workspace" | "report" | "admin" | "home";
}

export function AppHeader({ currentSection }: AppHeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-2 sm:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-foreground hover:opacity-90"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-xs font-bold text-primary-foreground">
              OS
            </span>
            <span>AI Visibility OS</span>
          </Link>

          <nav
            aria-label="Main Navigation"
            className="hidden sm:flex sm:items-center sm:gap-4"
          >
            <Link
              href="/workspace"
              className={`text-sm font-medium transition-colors ${
                currentSection === "workspace"
                  ? "text-foreground underline underline-offset-4"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Workspace
            </Link>
            <Link
              href="/report"
              className={`text-sm font-medium transition-colors ${
                currentSection === "report"
                  ? "text-foreground underline underline-offset-4"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Reports
            </Link>
            <Link
              href="/admin"
              className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${
                currentSection === "admin"
                  ? "text-foreground underline underline-offset-4"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Admin</span>
              <span className="rounded-xs bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Ops
              </span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/api/health"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <span className="h-2 w-2 rounded-full bg-success" />
            <span>Health API</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
