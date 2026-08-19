import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Gauge,
  RefreshCw,
  Trophy,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { DrillIcon } from "@/components/drill-icon";
import { Button } from "@/components/ui/button";
import { getRoster, type RosterRow, type Team } from "@/lib/api";
import {
  formatResult,
  getAthleteResults,
  type AthleteResultGroup,
  type AthleteResults,
  type DerivedSessionResult,
} from "@/lib/results-api";

function teamLabel(team: Team) {
  return [team.name, team.season_label].filter(Boolean).join(" — ");
}

function positionLabel(row: RosterRow) {
  return [row.membership.primary_position, row.membership.secondary_position].filter(Boolean).join(" / ") || "—";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function changeLabel(group: AthleteResultGroup) {
  if (!group.metric || group.summary.change_from_previous === null || group.summary.improved_from_previous === null) return null;
  const absolute = Math.abs(group.summary.change_from_previous);
  const formatted = group.metric.type === "time"
    ? `${(absolute / 1000).toFixed(2)}s`
    : formatResult(absolute, { ...group.metric, total_attempts: null, max: null });
  return {
    improved: group.summary.improved_from_previous,
    text: group.summary.improved_from_previous ? `${formatted} better` : `${formatted} off`,
  };
}

type RecentResult = DerivedSessionResult & {
  drill: AthleteResultGroup["drill"];
  pb: number | null;
};

export function AthleteProfileScreen({
  team,
  athleteId,
  onNavigate,
}: {
  team: Team | null;
  athleteId: string;
  onNavigate: (path: string) => void;
}) {
  const [row, setRow] = useState<RosterRow | null>(null);
  const [results, setResults] = useState<AthleteResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!team || !athleteId) {
      setRow(null);
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [roster, athleteResults] = await Promise.all([
        getRoster(team.id, true),
        getAthleteResults(athleteId, { teamId: team.id }),
      ]);
      setRow(roster.find((candidate) => candidate.athlete.id === athleteId) ?? null);
      setResults(athleteResults);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the athlete profile.");
    } finally {
      setLoading(false);
    }
  }, [athleteId, team]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => (results?.groups ?? []).filter((group) => group.summary.result_count > 0),
    [results],
  );

  const recentResults = useMemo<RecentResult[]>(() =>
    groups
      .flatMap((group) => group.results.map((result) => ({ ...result, drill: group.drill, pb: group.summary.pb })))
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 8),
  [groups]);

  const totalResults = groups.reduce((sum, group) => sum + group.summary.result_count, 0);
  const improvingDrills = groups.filter((group) => group.summary.improved_from_previous === true).length;

  if (!team) {
    return (
      <section className="mx-auto max-w-[1160px] px-4 py-8 md:px-7">
        <Button variant="secondary" onClick={() => onNavigate("/roster")}><ArrowLeft size={16} />Roster</Button>
        <div className="mt-5 rounded-xl border border-border bg-surface p-6 text-sm text-text-muted">Select a team to view an athlete profile.</div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-[1160px] px-4 pb-8 pt-5 md:px-7">
        <div className="h-9 w-36 animate-pulse rounded bg-surface-elevated" />
        <div className="mt-5 h-40 animate-pulse rounded-xl border border-border bg-surface" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.8fr)]">
          <div className="h-72 animate-pulse rounded-xl border border-border bg-surface" />
          <div className="h-72 animate-pulse rounded-xl border border-border bg-surface" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-[1160px] px-4 py-8 md:px-7">
        <Button variant="secondary" onClick={() => onNavigate("/roster")}><ArrowLeft size={16} />Roster</Button>
        <div className="mt-5 rounded-xl border border-danger/40 bg-danger/10 p-6">
          <div className="flex items-center gap-2 font-bold"><CircleAlert size={18} className="text-danger" />Profile unavailable</div>
          <p className="mt-2 text-sm text-text-muted">{error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void load()}><RefreshCw size={15} />Retry</Button>
        </div>
      </section>
    );
  }

  if (!row) {
    return (
      <section className="mx-auto max-w-[1160px] px-4 py-8 md:px-7">
        <Button variant="secondary" onClick={() => onNavigate("/roster")}><ArrowLeft size={16} />Roster</Button>
        <div className="mt-5 rounded-xl border border-border bg-surface p-6">
          <div className="font-bold">Athlete not on this team</div>
          <p className="mt-1 text-sm text-text-muted">This athlete is not part of {teamLabel(team)}.</p>
        </div>
      </section>
    );
  }

  const athleteName = `${row.athlete.first_name} ${row.athlete.last_name}`;

  return (
    <section className="mx-auto max-w-[1160px] px-3 pb-8 pt-4 sm:px-4 md:px-7 md:pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => onNavigate("/roster")} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted transition-colors hover:text-text-primary">
          <ArrowLeft size={16} /> Back to Roster
        </button>
        <Button variant="secondary" onClick={() => onNavigate("/data")} className="min-h-10">Open Data <ChevronRight size={15} /></Button>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid gap-5 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[rgba(124,58,237,0.4)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]">
            <UserRound size={26} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold tracking-[-0.035em] sm:text-[30px]">{athleteName}</h1>
              {!row.membership.active && <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">Archived</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
              <span>{row.membership.jersey_number ? `#${row.membership.jersey_number}` : "No jersey #"}</span>
              <span>{positionLabel(row)}</span>
              <span>{teamLabel(team)}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[290px]">
            <Stat label="Drills" value={groups.length} />
            <Stat label="Results" value={totalResults} />
            <Stat label="Improving" value={improvingDrills} />
          </div>
        </div>

        {(row.athlete.birth_year || row.athlete.notes) && (
          <div className="grid gap-3 border-t border-border bg-background/35 px-4 py-3 text-xs sm:grid-cols-[180px_minmax(0,1fr)] sm:px-5">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Birth year</div>
              <div className="mt-1 font-semibold text-text-secondary">{row.athlete.birth_year ?? "—"}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Notes</div>
              <div className="mt-1 leading-5 text-text-secondary">{row.athlete.notes || "—"}</div>
            </div>
          </div>
        )}
      </section>

      {groups.length === 0 ? (
        <section className="mt-4 rounded-xl border border-border bg-surface p-8 text-center">
          <Gauge className="mx-auto text-text-muted" size={30} />
          <h2 className="mt-3 text-lg font-extrabold">No saved results yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">Run this athlete through a drill in Train and their PB, latest result, and history will appear here.</p>
          <Button className="mt-5" onClick={() => onNavigate("/train")}>Open Train</Button>
        </section>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.85fr)]">
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex min-h-[48px] items-center justify-between border-b border-border px-4">
              <div>
                <h2 className="text-sm font-extrabold">Drill performance</h2>
                <p className="text-[10px] text-text-muted">PB and latest result for this team</p>
              </div>
              <Trophy size={17} className="text-text-muted" />
            </div>
            <div>
              {groups.map((group) => {
                const change = changeLabel(group);
                return (
                  <div key={group.drill.id} className="border-b border-border px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[minmax(0,1fr)_110px_110px_150px] sm:items-center sm:gap-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                        <DrillIcon drill={group.drill} size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold">{group.drill.name}</div>
                        <div className="mt-0.5 text-[10px] text-text-muted">{group.drill.category} · {group.summary.result_count} result{group.summary.result_count === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-[0.8fr_0.8fr_1.4fr] items-end gap-3 sm:contents">
                      <Metric label="PB" value={formatResult(group.summary.pb, group.metric)} emphasis />
                      <Metric label="Latest" value={formatResult(group.summary.latest, group.metric)} />
                      <div className="min-w-0 sm:text-right">
                        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Latest vs previous</div>
                        {change ? (
                          <div className={`mt-1 inline-flex max-w-full items-center gap-1 text-xs font-bold ${change.improved ? "text-success" : "text-text-secondary"}`}>
                            {change.improved ? <TrendingUp className="shrink-0" size={14} /> : <TrendingDown className="shrink-0" size={14} />}<span className="truncate">{change.text}</span>
                          </div>
                        ) : <div className="mt-1 truncate text-xs font-semibold text-text-muted">Need another result</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex min-h-[48px] items-center justify-between border-b border-border px-4">
              <div>
                <h2 className="text-sm font-extrabold">Recent results</h2>
                <p className="text-[10px] text-text-muted">Completed sessions across all drills</p>
              </div>
              <CalendarDays size={17} className="text-text-muted" />
            </div>
            <div>
              {recentResults.map((result) => {
                const isPb = result.pb !== null && result.value === result.pb;
                return (
                  <div key={`${result.session_id}-${result.drill_id}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                      <DrillIcon drill={result.drill} size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold">{result.drill.name}</div>
                      <div className="mt-0.5 text-[10px] text-text-muted">{formatDateTime(result.started_at)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-extrabold tabular-nums">{formatResult(result.value, result.metric)}</div>
                      {isPb && <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[#c4b5fd]">PB</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
      <div className="text-lg font-extrabold tabular-nums">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</div>
    </div>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</div>
      <div className={`mt-1 truncate tabular-nums ${emphasis ? "text-lg font-extrabold" : "text-sm font-bold"}`}>{value}</div>
    </div>
  );
}
