import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Trophy, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getRoster, listDrills, type Drill, type RosterRow, type Team } from "@/lib/api";
import {
  getAthleteResults,
  getDrillLeaderboard,
  type AthleteResultGroup,
  type DrillLeaderboard,
  type ResultMetric,
} from "@/lib/results-api";

function athleteName(row: RosterRow) {
  return `${row.athlete.first_name} ${row.athlete.last_name}`;
}

export function formatResult(value: number | null, metric: ResultMetric | null) {
  if (value === null || !metric) return "—";
  if (metric.type === "time") {
    const totalSeconds = value / 1000;
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds - minutes * 60;
      return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
    }
    return `${totalSeconds.toFixed(2)}s`;
  }
  if (metric.type === "successes_attempts" && metric.total_attempts !== null) {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}/${metric.total_attempts}`;
  }
  if (metric.type === "rating" && metric.max !== null) {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}/${metric.max}`;
  }
  const number = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  return metric.unit && metric.unit !== "count" ? `${number} ${metric.unit}` : number;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function changeCopy(group: AthleteResultGroup | null) {
  if (!group?.metric || group.summary.change_from_previous === null || group.summary.improved_from_previous === null) return null;
  const absolute = Math.abs(group.summary.change_from_previous);
  const formatted = group.metric.type === "time"
    ? `${(absolute / 1000).toFixed(2)}s`
    : formatResult(absolute, { ...group.metric, total_attempts: null, max: null });
  return {
    improved: group.summary.improved_from_previous,
    text: group.summary.improved_from_previous ? `${formatted} better than previous` : `${formatted} off previous`,
  };
}

function ProgressChart({ group }: { group: AthleteResultGroup }) {
  const points = [...group.results].reverse();
  if (points.length < 2) {
    return (
      <div className="flex min-h-[170px] items-center justify-center rounded-lg border border-border bg-background px-4 text-center text-xs text-text-muted">
        Complete this drill again to start a progress line.
      </div>
    );
  }

  const width = 640;
  const height = 180;
  const padX = 26;
  const padY = 22;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.max(Math.abs(max), 1) * 0.05);
  const x = (index: number) => padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
  const y = (value: number) => padY + ((max + span * 0.08 - value) / (span * 1.16)) * (height - padY * 2);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background px-2 py-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[170px] w-full" role="img" aria-label={`${group.drill.name} progress chart`}>
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="stroke-border" strokeWidth="1" />
        <polyline points={polyline} fill="none" className="stroke-accent" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={point.session_id} cx={x(index)} cy={y(point.value)} r="5" className="fill-background stroke-accent" strokeWidth="3" />
        ))}
      </svg>
      <div className="flex justify-between px-3 pb-1 text-[10px] text-text-muted">
        <span>{formatDate(points[0].started_at)}</span>
        <span>{formatDate(points[points.length - 1].started_at)}</span>
      </div>
    </div>
  );
}

export function DataScreen({ team }: { team: Team | null }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [drillId, setDrillId] = useState("");
  const [group, setGroup] = useState<AthleteResultGroup | null>(null);
  const [leaderboard, setLeaderboard] = useState<DrillLeaderboard | null>(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState("");

  const loadBase = async () => {
    if (!team) {
      setRoster([]);
      setDrills([]);
      setAthleteId("");
      setDrillId("");
      setLoadingBase(false);
      return;
    }
    setLoadingBase(true);
    setError("");
    try {
      const [nextRoster, nextDrills] = await Promise.all([getRoster(team.id), listDrills()]);
      setRoster(nextRoster);
      setDrills(nextDrills);
      setAthleteId((current) => nextRoster.some((row) => row.athlete.id === current) ? current : nextRoster[0]?.athlete.id ?? "");
      setDrillId((current) => nextDrills.some((drill) => drill.id === current) ? current : nextDrills[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Data.");
    } finally {
      setLoadingBase(false);
    }
  };

  useEffect(() => {
    void loadBase();
    // Team switch intentionally resets selected data context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id]);

  const loadResults = async () => {
    if (!team || !athleteId || !drillId) {
      setGroup(null);
      setLeaderboard(null);
      return;
    }
    setLoadingResults(true);
    setError("");
    try {
      const [athleteResults, nextLeaderboard] = await Promise.all([
        getAthleteResults(athleteId, { teamId: team.id, drillId }),
        getDrillLeaderboard(drillId, team.id),
      ]);
      setGroup(athleteResults.groups.find((candidate) => candidate.drill.id === drillId) ?? null);
      setLeaderboard(nextLeaderboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load results.");
    } finally {
      setLoadingResults(false);
    }
  };

  useEffect(() => {
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, athleteId, drillId]);

  const selectedAthlete = useMemo(() => roster.find((row) => row.athlete.id === athleteId) ?? null, [athleteId, roster]);
  const selectedDrill = useMemo(() => drills.find((drill) => drill.id === drillId) ?? null, [drillId, drills]);
  const change = changeCopy(group);

  if (!team) {
    return <section className="p-6 text-sm text-text-muted">Create or select a team to view Data.</section>;
  }

  return (
    <section className="mx-auto max-w-[1220px] px-3 pb-8 pt-4 sm:px-4 md:px-6 md:pt-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Data</h1>
          <p className="mt-0.5 text-sm text-text-muted">Progress and ranking from saved training results.</p>
        </div>
        {(loadingBase || loadingResults) && <RefreshCw size={17} className="animate-spin text-text-muted" />}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary">
          <span>{error}</span>
          <Button
            variant="secondary"
            className="min-h-8 px-3 text-xs"
            onClick={() => {
              void loadBase();
              void loadResults();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Athlete</span>
          <select
            value={athleteId}
            onChange={(event) => setAthleteId(event.target.value)}
            disabled={loadingBase || !roster.length}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-bold text-text-primary"
          >
            {!roster.length && <option value="">No athletes</option>}
            {roster.map((row) => <option key={row.athlete.id} value={row.athlete.id}>{row.membership.jersey_number ? `#${row.membership.jersey_number} · ` : ""}{athleteName(row)}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Drill</span>
          <select
            value={drillId}
            onChange={(event) => setDrillId(event.target.value)}
            disabled={loadingBase || !drills.length}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-bold text-text-primary"
          >
            {!drills.length && <option value="">No drills</option>}
            {drills.map((drill) => <option key={drill.id} value={drill.id}>{drill.name}</option>)}
          </select>
        </label>
      </div>

      {!loadingBase && (!roster.length || !drills.length) ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <Activity className="mx-auto text-text-muted" size={28} />
          <h2 className="mt-3 text-lg font-extrabold">Nothing to analyze yet</h2>
          <p className="mt-1 text-sm text-text-muted">Data appears after you have athletes, drills, and saved training results.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold">{selectedAthlete ? athleteName(selectedAthlete) : "Athlete"}</div>
                  <div className="truncate text-xs text-text-muted">{selectedDrill?.name ?? "Select a drill"}</div>
                </div>
                {group?.summary.result_count ? <span className="text-[11px] font-bold text-text-muted">{group.summary.result_count} result{group.summary.result_count === 1 ? "" : "s"}</span> : null}
              </div>

              {!group ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
                  <Activity size={28} className="text-text-muted" />
                  <h3 className="mt-3 text-lg font-extrabold">No saved results</h3>
                  <p className="mt-1 max-w-sm text-sm text-text-muted">Run {selectedDrill?.name ?? "this drill"} in Train and saved results will appear here.</p>
                </div>
              ) : (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Personal best</div>
                      <div className="mt-1 text-2xl font-black tabular-nums">{formatResult(group.summary.pb, group.metric)}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Latest</div>
                      <div className="mt-1 text-2xl font-black tabular-nums">{formatResult(group.summary.latest, group.metric)}</div>
                    </div>
                    <div className="col-span-2 rounded-lg border border-border bg-background p-3 sm:col-span-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Vs previous</div>
                      {change ? (
                        <div className={`mt-1 flex items-center gap-1.5 text-sm font-extrabold ${change.improved ? "text-success" : "text-text-secondary"}`}>
                          {change.improved ? <TrendingUp size={16} /> : <TrendingDown size={16} />}{change.text}
                        </div>
                      ) : <div className="mt-1 text-sm font-bold text-text-muted">Need 2 results</div>}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Progress</div>
                    <ProgressChart group={group} />
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-3 text-sm font-extrabold">Result history</div>
              {!group?.results.length ? (
                <div className="p-5 text-sm text-text-muted">No history for this athlete and drill.</div>
              ) : (
                <div>
                  {group.results.map((result, index) => (
                    <div key={result.session_id} className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 last:border-b-0">
                      <div className="min-w-0">
                        <div className="text-xs font-bold">{formatDate(result.started_at)}</div>
                        <div className="text-[10px] text-text-muted">{result.attempt_count} saved attempt{result.attempt_count === 1 ? "" : "s"} · {result.session_status}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {index === 0 && <span className="hidden text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted sm:inline">Latest</span>}
                        <span className="text-base font-black tabular-nums">{formatResult(result.value, result.metric)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface self-start">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-extrabold"><Trophy size={16} /> Leaderboard</div>
                <div className="mt-0.5 text-[10px] text-text-muted">Personal best · {team.name}</div>
              </div>
              {leaderboard?.metric?.direction === "none" && <span className="text-[10px] font-bold text-text-muted">Unranked</span>}
            </div>
            {!leaderboard?.entries.length ? (
              <div className="p-5 text-sm text-text-muted">No team results for this drill yet.</div>
            ) : (
              <div>
                {leaderboard.entries.map((entry) => (
                  <div key={entry.athlete.id} className={`grid min-h-[54px] grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 last:border-b-0 ${entry.athlete.id === athleteId ? "bg-surface-elevated" : ""}`}>
                    <span className="text-center text-xs font-black tabular-nums text-text-muted">{entry.rank ?? "—"}</span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold">{entry.membership.jersey_number ? `#${entry.membership.jersey_number} ` : ""}{entry.athlete.first_name} {entry.athlete.last_name}</div>
                      <div className="truncate text-[10px] text-text-muted">{[entry.membership.primary_position, entry.membership.secondary_position].filter(Boolean).join(" / ") || `${entry.result_count} result${entry.result_count === 1 ? "" : "s"}`}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black tabular-nums">{formatResult(entry.pb, leaderboard.metric)}</div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">PB</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
