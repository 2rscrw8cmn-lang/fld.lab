import { useEffect, useState } from "react";
import { Activity, ChevronRight, Clock3, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { recentDrillsFromSessions, type RecentDrill } from "@/features/home/recent-drills";
import {
  getActiveSession,
  getDrill,
  getRoster,
  listDrills,
  type DrillDetail,
  type RosterRow,
  type SessionDetail,
  type Team,
} from "@/lib/api";
import { listTeamSessions, type SessionSummary } from "@/lib/history-api";

function positionLabel(row: RosterRow) {
  return [row.membership.primary_position, row.membership.secondary_position].filter(Boolean).join(" / ") || "—";
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function HomeScreen({ onNavigate, team }: { onNavigate: (path: string) => void; team: Team | null }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [quickDrill, setQuickDrill] = useState<DrillDetail | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [recentDrills, setRecentDrills] = useState<RecentDrill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!team) {
      setRoster([]);
      setQuickDrill(null);
      setActiveSession(null);
      setRecentSessions([]);
      setRecentDrills([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    Promise.all([
      getRoster(team.id),
      getActiveSession(team.id),
      listTeamSessions(team.id, 12),
      listDrills(),
    ])
      .then(async ([rows, detail, sessions, drills]) => {
        const completedOrAbandoned = sessions.filter((session) => session.status !== "active");
        const availableIds = new Set(drills.map((drill) => drill.id));
        const recent = recentDrillsFromSessions(sessions, 4).filter((drill) => availableIds.has(drill.id));
        const preferredDrillId = recent[0]?.id ?? drills[0]?.id ?? null;
        const preferredDetail = !detail && preferredDrillId ? await getDrill(preferredDrillId) : null;

        if (cancelled) return;
        setRoster(rows.slice(0, 5));
        setActiveSession(detail);
        setRecentSessions(completedOrAbandoned.slice(0, 3));
        setRecentDrills(recent);
        setQuickDrill(preferredDetail);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setRoster([]);
        setQuickDrill(null);
        setActiveSession(null);
        setRecentSessions([]);
        setRecentDrills([]);
        setError(loadError instanceof Error ? loadError.message : "Could not load the practice launch screen.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [reloadKey, team?.id]);

  const definition = activeSession?.drill_definition ?? quickDrill?.version.definition;
  const drillName = activeSession?.drill_definition.name ?? quickDrill?.drill.name;
  const drillCategory = activeSession?.drill_definition.category ?? quickDrill?.drill.category;
  const quickDrillId = quickDrill?.drill.id ?? null;
  const splitLabel = definition?.timer?.splits?.[0]?.label;
  const hasDrill = Boolean(definition && drillName);
  const recentAlternates = recentDrills.filter((drill) => drill.id !== quickDrillId).slice(0, 3);
  const quickIsRecent = Boolean(quickDrillId && recentDrills[0]?.id === quickDrillId);

  const launchDrill = (drillId: string) => {
    onNavigate(`/train/start/${encodeURIComponent(drillId)}`);
  };

  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-7 pt-[18px] md:px-7 md:pt-[22px]">
      <div className="mb-[13px] md:mb-[15px]">
        <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Ready for practice.</h1>
        <p className="mt-1 text-[13px] text-text-muted">{activeSession ? "You have an active training session." : "Start the last drill you used or jump into another recent one."}</p>
      </div>

      {error && (
        <div className="mb-3 flex flex-col gap-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-3 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-warning">Practice launch is unavailable.</strong> {error}</span>
          <Button type="button" variant="warning" size="sm" onClick={() => setReloadKey((value) => value + 1)} className="min-h-10 shrink-0 gap-1.5 self-start sm:self-auto">
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </Button>
        </div>
      )}

      <div className="grid gap-3.5 min-[781px]:grid-cols-[minmax(0,1.62fr)_minmax(290px,0.88fr)]">
        <section className="flex min-h-[272px] flex-col overflow-hidden rounded-[11px] border border-border bg-surface min-[781px]:min-h-[286px]" aria-labelledby="quick-start-title">
          <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
            <h2 id="quick-start-title" className="text-[13px] font-bold">{activeSession ? "Active Session" : "Quick Start"}</h2>
            {!activeSession && <button type="button" onClick={() => onNavigate("/drills")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">All drills</button>}
          </div>

          <div className="flex flex-1 flex-col justify-between gap-5 p-[17px] sm:p-5">
            {loading && !activeSession ? (
              <div className="space-y-3" aria-label="Loading drill">
                <div className="h-9 w-2/3 animate-pulse rounded bg-surface-elevated" />
                <div className="h-6 w-1/2 animate-pulse rounded bg-surface-elevated" />
                <div className="h-11 w-full max-w-[380px] animate-pulse rounded bg-surface-elevated/70" />
              </div>
            ) : hasDrill && definition ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[28px] font-extrabold leading-none tracking-[-0.05em] sm:text-[34px] lg:text-[39px]">{drillName}</div>
                  {!activeSession && quickIsRecent && (
                    <span className="rounded-full border border-[rgba(124,58,237,0.42)] bg-[rgba(124,58,237,0.14)] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.06em] text-[#c4b5fd]">Last used</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="inline-flex min-h-[25px] items-center rounded-full border border-[rgba(124,58,237,0.42)] bg-[rgba(124,58,237,0.14)] px-2.5 text-[10px] font-bold text-[#c4b5fd]">{drillCategory}</span>
                  <span className="inline-flex min-h-[25px] items-center rounded-full border border-border px-2.5 text-[10px] font-bold text-text-muted">{definition.attempts.count} {definition.attempts.count === 1 ? "attempt" : "attempts"}</span>
                  {splitLabel && <span className="inline-flex min-h-[25px] items-center rounded-full border border-border px-2.5 text-[10px] font-bold text-text-muted">{splitLabel} split</span>}
                </div>

                {!activeSession && recentAlternates.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-text-muted">Recent drills</div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {recentAlternates.map((drill) => (
                        <button
                          key={drill.id}
                          type="button"
                          onClick={() => launchDrill(drill.id)}
                          className="min-h-11 shrink-0 rounded-lg border border-border bg-background px-3 text-left transition-colors hover:border-[rgba(124,58,237,0.55)] hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <span className="block text-[11px] font-extrabold">{drill.name}</span>
                          <span className="block text-[9px] text-text-muted">{drill.category}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                  <Activity aria-hidden={true} size={19} />
                </span>
                <div>
                  <div className="text-base font-extrabold">No drills configured</div>
                  <p className="mt-1 max-w-md text-xs leading-5 text-text-muted">Open the Drill Library and import a drill definition to start training.</p>
                </div>
              </div>
            )}

            <div>
              <Button
                type="button"
                size="lg"
                onClick={() => activeSession ? onNavigate("/train") : quickDrillId ? launchDrill(quickDrillId) : undefined}
                disabled={!team || !hasDrill || loading}
                className="min-h-[60px] w-full rounded-[9px] text-base font-extrabold"
              >
                {activeSession ? "Resume Session" : "Start Drill"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => onNavigate("/drills")} className="mt-2 min-h-11 w-full text-[11px] font-bold">Open Drill Library</Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[11px] border border-border bg-surface" aria-labelledby="roster-snapshot-title">
          <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
            <h2 id="roster-snapshot-title" className="text-[13px] font-bold">Roster Snapshot</h2>
            <button type="button" onClick={() => onNavigate("/roster")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">View roster</button>
          </div>
          <div>
            {loading ? (
              [0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[46px] animate-pulse border-b border-border bg-surface-elevated/35 last:border-b-0" />)
            ) : !team ? (
              <div className="p-4 text-xs text-text-muted">Select or create a team to build a roster.</div>
            ) : roster.length === 0 ? (
              <button type="button" onClick={() => onNavigate("/roster")} className="min-h-14 w-full p-4 text-left text-xs text-text-muted hover:bg-surface-elevated">No active athletes yet. Add the first athlete →</button>
            ) : (
              roster.map((row) => (
                <button
                  key={row.membership.id}
                  type="button"
                  onClick={() => onNavigate(`/athletes/${encodeURIComponent(row.athlete.id)}`)}
                  className="grid min-h-[48px] w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-[13px] text-left last:border-b-0 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <span className="text-[11px] font-extrabold tabular-nums text-text-muted">{row.membership.jersey_number || "—"}</span>
                  <span className="truncate text-xs font-bold">{row.athlete.first_name} {row.athlete.last_name}</span>
                  <span className="text-[10px] font-bold text-text-muted">{positionLabel(row)}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-3 overflow-hidden rounded-[11px] border border-border bg-surface md:mt-3.5" aria-labelledby="recent-sessions-title">
        <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
          <h2 id="recent-sessions-title" className="text-[13px] font-bold">Recent Sessions</h2>
          <button type="button" onClick={() => onNavigate("/data")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">View all</button>
        </div>
        {loading ? (
          [0, 1, 2].map((item) => <div key={item} className="h-[60px] animate-pulse border-b border-border bg-surface-elevated/30 last:border-b-0" />)
        ) : !team ? (
          <div className="p-4 text-xs text-text-muted">Select a team to see session history.</div>
        ) : recentSessions.length === 0 ? (
          <div className="grid min-h-[64px] grid-cols-[34px_minmax(0,1fr)] items-center gap-3 px-[15px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-text-muted"><Clock3 size={15} /></span>
            <span>
              <span className="block text-xs font-bold">No completed sessions recorded yet.</span>
              <span className="mt-0.5 block text-[11px] text-text-muted">Completed and abandoned sessions will appear here after training.</span>
            </span>
          </div>
        ) : (
          recentSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onNavigate("/data")}
              className="grid min-h-[60px] w-full grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-3 border-b border-border px-[15px] text-left last:border-b-0 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold">{session.drill_name}</span>
                  {session.status === "abandoned" && <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-text-muted">Abandoned</span>}
                </span>
                <span className="mt-0.5 block text-[10px] text-text-muted">{formatSessionTime(session.started_at)} · {session.attempt_count} saved attempt{session.attempt_count === 1 ? "" : "s"}</span>
              </span>
              <span className="text-right text-[10px] text-text-muted"><strong className="block text-xs text-text-secondary">{session.completed_count} complete</strong>{session.skipped_count ? `${session.skipped_count} skipped` : `${session.athlete_count} athletes`}</span>
              <ChevronRight aria-hidden={true} size={15} className="text-text-muted" />
            </button>
          ))
        )}
      </section>
    </section>
  );
}
