import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Dumbbell,
  Home,
  Library,
  Settings,
  Timer,
  UsersRound,
} from "lucide-react";

import { APP_ROUTES } from "@/app/routes";
import { NetworkStatus } from "@/components/network-status";
import { SearchSelect } from "@/components/search-select";
import type { Team } from "@/lib/api";
import { cn } from "@/lib/utils";

type AppShellProps = {
  pathname: string;
  teams: Team[];
  teamId: string;
  teamsLoading: boolean;
  teamSwitchDisabled?: boolean;
  onTeamChange: (teamId: string) => void;
  onNavigate: (path: string) => void;
  children: ReactNode;
};

const routeIcons: Record<string, LucideIcon> = {
  "/": Home,
  "/roster": UsersRound,
  "/train": Timer,
  "/data": BarChart3,
  "/drills": Library,
  "/settings": Settings,
};

const mobileRoutes = APP_ROUTES.filter((route) => route.path !== "/settings");

function NavItem({
  path,
  label,
  active,
  onNavigate,
}: {
  path: string;
  label: string;
  active: boolean;
  onNavigate: (path: string) => void;
}) {
  const Icon = routeIcons[path] ?? Dumbbell;

  return (
    <a
      href={path}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(path);
      }}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text-primary",
        active && "border-[rgba(124,58,237,0.36)] bg-[rgba(124,58,237,0.14)] text-text-primary",
      )}
    >
      <Icon aria-hidden={true} size={17} strokeWidth={1.8} />
      <span>{label}</span>
    </a>
  );
}

function formatTeam(team: Team) {
  return [team.name, team.season_label].filter(Boolean).join(" — ");
}

export function AppShell({
  pathname,
  teams,
  teamId,
  teamsLoading,
  teamSwitchDisabled = false,
  onTeamChange,
  onNavigate,
  children,
}: AppShellProps) {
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-[100dvh] bg-background pt-[env(safe-area-inset-top)] text-text-primary md:grid md:grid-cols-[188px_minmax(0,1fr)]">
      <aside className="hidden min-h-[calc(100dvh_-_env(safe-area-inset-top))] border-r border-border bg-sidebar px-3 py-[18px] md:flex md:flex-col">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
          className="flex min-h-11 items-start px-2.5 pb-7 pt-0.5 transition-opacity hover:opacity-90"
          aria-label="fld.LAB home"
        >
          <img src="/brand/fld-lab-horizontal-dark.svg" alt="fld.LAB" className="h-auto w-[118px]" />
        </a>

        <nav className="grid gap-1" aria-label="Primary navigation">
          {APP_ROUTES.filter((route) => route.path !== "/settings").map((route) => (
            <NavItem
              key={route.path}
              path={route.path}
              label={route.label}
              active={pathname === route.path}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <nav className="mt-auto" aria-label="Application settings">
          <NavItem path="/settings" label="Settings" active={pathname === "/settings"} onNavigate={onNavigate} />
        </nav>
      </aside>

      <main className="min-w-0 pb-[calc(74px+env(safe-area-inset-bottom))] md:pb-0">
        <header className="flex min-h-[60px] items-center justify-between gap-3 border-b border-border px-4 md:min-h-16 md:px-7">
          <div
            className="w-[min(220px,52vw)] md:w-[270px]"
            title={teamSwitchDisabled ? "Finish or abandon the active session before switching teams." : undefined}
          >
            <SearchSelect
              label="Current team"
              hideLabel
              value={teamId}
              options={teams.map((team) => ({ value: team.id, label: formatTeam(team) }))}
              onChange={onTeamChange}
              placeholder={teamsLoading ? "Loading teams…" : "No active teams"}
              searchPlaceholder="Search teams…"
              disabled={teamsLoading || teams.length === 0 || teamSwitchDisabled}
              triggerClassName="bg-surface text-sm font-semibold"
            />
          </div>

          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="hidden sm:inline">{dateLabel}</span>
            <button
              type="button"
              onClick={() => onNavigate("/settings")}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold transition-colors hover:bg-surface hover:text-text-primary"
            >
              <Settings aria-hidden={true} className="sm:hidden" size={18} strokeWidth={1.8} />
              <span className="hidden sm:inline">Coach</span>
              <span className="sr-only sm:hidden">Settings</span>
            </button>
          </div>
        </header>

        <NetworkStatus />
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid min-h-[64px] grid-cols-5 border-t border-border bg-sidebar/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Mobile navigation">
        {mobileRoutes.map((route) => {
          const Icon = routeIcons[route.path] ?? Dumbbell;
          const active = pathname === route.path;
          return (
            <a
              key={route.path}
              href={route.path}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(route.path);
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold text-text-muted transition-colors",
                active && "text-[#c4b5fd]",
              )}
            >
              <Icon aria-hidden={true} size={19} strokeWidth={1.8} />
              <span className="truncate">{route.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
