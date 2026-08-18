import { useEffect, useState } from "react";
import { Activity, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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

function positionLabel(row: RosterRow) {
  return [row.membership.primary_position, row.membership.secondary_position].filter(Boolean).join(" / ") || "—";
}

export function HomeScreen({ onNavigate, team }: { onNavigate: (path: string) => void; team: Team | null }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [quickDrill, setQuickDrill] = useState<DrillDetail | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [drillLoading, setDrillLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!team) {
      setRoster([]);
      setActiveSession(null);
      return;
    }

    setRosterLoading(true);
    getRoster(team.id)
      .then((rows) => { if (!cancelled) setRoster(rows.slice(0, 5)); })
      .catch(() => { if (!cancelled) setRoster([]); })
      .finally(() => { if (!cancelled) setRosterLoading(false); });

    getActiveSession(team.id)
      .then((detail) => { if (!cancelled) setActiveSession(detail); })
      .catch(() => { if (!cancelled) setActiveSession(null); });

    return () => { cancelled = true; };
  }, [team]);

  useEffect(() => {
    let cancelled = false;
    setDrillLoading(true);

    listDrills()
      .then(async (drills) => {
        const firstTimed = drills.find((drill) => drill.measurement_type === "time");
        if (!firstTimed) return null;
        return getDrill(firstTimed.id);
      })
      .then((detail) => { if (!cancelled) setQuickDrill(detail); })
      .catch(() => { if (!cancelled) setQuickDrill(null); })
      .finally(() => { if (!cancelled) setDrillLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const definition = activeSession?.drill_definition ?? quickDrill?.version.definition;
  const drillName = activeSession?.drill_definition.name ?? quickDrill?.drill.name;
  const drillCategory = activeSession?.drill_definition.category ?? quickDrill?.drill.category;
  const splitLabel = definition?.timer?.splits?.[0]?.label;
  const hasDrill = Boolean(definition && drillName);

  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-7 pt-[18px] md:px-7 md:pt-[22px]">
      <div className="mb-[13px] md:mb-[15px]">
        <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Ready for practice.</h1>
        <p className="mt-1 text-[13px] text-text-muted">{activeSession ? "You have an active training session." : "Start where you left off or choose another drill."}</p>
      </div>

      <div className="grid gap-3.5 min-[781px]:grid-cols-[minmax(0,1.62fr)_minmax(290px,0.88fr)]">
        <section className="flex min-h-[272px] flex-col overflow-hidden rounded-[11px] border border-border bg-surface min-[781px]:min-h-[286px]" aria-labelledby="quick-start-title">
          <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
            <h2 id="quick-start-title" className="text-[13px] font-bold">{activeSession ? "Active Session" : "Quick Start"}</h2>
            {!activeSession && <button type="button" onClick={() => onNavigate("/drills")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">Change drill</button>}
          </div>

          <div className="flex flex-1 flex-col justify-between gap-5 p-[17px] sm:p-5">
            {drillLoading && !activeSession ? (
              <div className="space-y-3" aria-label="Loading drill">
                <div className="h-9 w-2/3 animate-pulse rounded bg-surface-elevated" />
                <div className="h-6 w-1/2 animate-pulse rounded bg-surface-elevated" />
              </div>
            ) : hasDrill && definition ? (
              <div>
                <div className="text-[28px] font-extrabold leading-none tracking-[-0.05em] sm:text-[34px] lg:text-[39px]">{drillName}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="inline-flex min-h-[25px] items-center rounded-full border border-[rgba(124,58,237,0.42)] bg-[rgba(124,58,237,0.14)] px-2.5 text-[10px] font-bold text-[#c4b5fd]">{drillCategory}</span>
                  <span className="inline-flex min-h-[25px] items-center rounded-full border border-border px-2.5 text-[10px] font-bold text-text-muted">{definition.attempts.count} {definition.attempts.count === 1 ? "attempt" : "attempts"}</span>
                  {splitLabel && <span className="inline-flex min-h-[25px] items-center rounded-full border border-border px-2.5 text-[10px] font-bold text-text-muted">{splitLabel} split</span>}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                  <Activity aria-hidden={true} size={19} />
                </span>
                <div>
                  <div className="text-base font-extrabold">No timed drills configured</div>
                  <p className="mt-1 max-w-md text-xs leading-5 text-text-muted">Open the Drill Library and import a timed drill definition.</p>
                </div>
              </div>
            )}

            <div>
              <Button type="button" size="lg" onClick={() => onNavigate("/train")} disabled={!team || !hasDrill} className="min-h-[60px] w-full rounded-[9px] text-base font-extrabold">
                {activeSession ? "Resume Session" : "Start Session"}
              </Button>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={() => onNavigate("/train")} disabled={!activeSession} className="min-h-10 text-[11px] font-bold">Resume Active Session</Button>
                <Button type="button" variant="secondary" onClick={() => onNavigate("/drills")} className="min-h-10 text-[11px] font-bold">Open Drill Library</Button>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[11px] border border-border bg-surface" aria-labelledby="roster-snapshot-title">
          <div className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border px-[15px]">
            <h2 id="roster-snapshot-title" className="text-[13px] font-bold">Roster Snapshot</h2>
            <button type="button" onClick={() => onNavigate("/roster")} className="min-h-10 px-1 text-[11px] font-bold text-text-muted transition-colors hover:text-text-primary">View roster</button>
          </div>
          <div>
            {rosterLoading ? (
              [0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[46px] animate-pulse border-b border-border bg-surface-elevated/35 last:border-b-0" />)
            ) : !team ? (
              <div className="p-4 text-xs text-text-muted">Select or create a team to build a roster.</div>
            ) : roster.length === 0 ? (
              <button type="button" onClick={() => onNavigate("/roster")} className="w-full p-4 text-left text-xs text-text-muted hover:bg-surface-elevated">No active athletes yet. Add the first athlete →</button>
            ) : (
              roster.map((row) => (
                <button
                  key={row.membership.id}
                  type="button"
                  onClick={() => onNavigate("/roster")}
                  className="grid min-h-[46px] w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-[13px] text-left last:border-b-0 hover:bg-surface-elevated"
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
        <button
          type="button"
          onClick={() => onNavigate("/train")}
          className="grid min-h-[64px] w-full grid-cols-[minmax(0,1fr)_18px] items-center gap-3 px-[15px] text-left hover:bg-surface-elevated"
        >
          <span>
            <span className="block text-xs font-bold">{activeSession ? "Training session in progress" : "No completed sessions recorded yet."}</span>
            <span className="mt-0.5 block text-[11px] text-text-muted">{activeSession ? "Resume the active session to continue capturing results." : "Completed sessions will appear here after training."}</span>
          </span>
          <ChevronRight aria-hidden={true} size={15} className="text-text-muted" />
        </button>
      </section>
    </section>
  );
}
