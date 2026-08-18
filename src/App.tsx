import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";

import { APP_ROUTES, getRoute } from "@/app/routes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ApiState = "checking" | "ready" | "error";

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [apiState, setApiState] = useState<ApiState>("checking");

  const checkApi = useCallback(async () => {
    setApiState("checking");
    try {
      const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Health check failed");
      setApiState("ready");
    } catch {
      setApiState("error");
    }
  }, []);

  useEffect(() => {
    void checkApi();
  }, [checkApi]);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
  };

  const route = getRoute(pathname);

  return (
    <div className="min-h-screen bg-background text-text-primary md:grid md:grid-cols-[184px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-border bg-[#0c1425] px-3 py-5 md:flex md:flex-col">
        <div className="px-3 pb-8 text-xl font-extrabold tracking-[-0.04em]">
          fld<span className="text-accent">.</span><span className="tracking-wide">LAB</span>
        </div>

        <nav className="grid gap-1" aria-label="Primary navigation">
          {APP_ROUTES.map((item) => (
            <a
              key={item.path}
              href={item.path}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text-primary",
                pathname === item.path && "bg-[rgba(124,58,237,0.14)] text-text-primary ring-1 ring-inset ring-[rgba(124,58,237,0.35)]",
                item.path === "/settings" && "mt-5 md:mt-auto"
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 pb-20 md:pb-0">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 md:px-7">
          <div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold">
            U10 Purple — Fall 2026
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                apiState === "checking" && "bg-warning",
                apiState === "ready" && "bg-success",
                apiState === "error" && "bg-danger"
              )}
              aria-hidden="true"
            />
            {apiState === "checking" ? "Checking API" : apiState === "ready" ? "API ready" : "API unavailable"}
          </div>
        </header>

        <section className="mx-auto max-w-5xl px-4 py-8 md:px-7 md:py-10">
          <div className="mb-8 max-w-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">Phase 1 scaffold</p>
            <h1 className="text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">{route.label}</h1>
            <p className="mt-2 text-sm text-text-muted md:text-base">{route.description}</p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-border bg-surface-elevated p-2 text-accent">
                <Activity aria-hidden="true" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">Application foundation is running</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
                  This screen is intentionally a shell. The approved fld.LAB Home wireframe and real navigation treatment belong to Phase 1 Issue #2.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void checkApi()}>
                    Check Worker API
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate("/")}>Home</Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-[#0c1425]/95 px-1 backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        {APP_ROUTES.filter((item) => item.path !== "/settings").map((item) => (
          <a
            key={item.path}
            href={item.path}
            onClick={(event) => {
              event.preventDefault();
              navigate(item.path);
            }}
            className={cn(
              "flex min-h-16 items-center justify-center px-1 text-[11px] font-semibold text-text-muted",
              pathname === item.path && "text-[#c4b5fd]"
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
