import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  Clock3,
  RefreshCw,
  Trophy,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { DrillIcon } from "@/components/drill-icon";
import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import {
  getRoster,
  getTrainingSession,
  listDrills,
  type Drill,
  type RosterRow,
  type SessionDetail,
  type Team,
} from "@/lib/api";
import {
  getTeamDrillTrend,
  listTeamSessions,
  type SessionSummary,
  type TeamDrillTrend,
} from "@/lib/history-api";
import {
  deriveSessionAthleteResult,
  formatResult,
  getAthleteResults,
  getDrillLeaderboard,
  type AthleteResultGroup,
  type DrillLeaderboard,
} from "@/lib/results-api";

function athleteName(row: RosterRow) {
  return `${row.athlete.first_name} ${row.athlete.last_name}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function sameDay(values: string[]) {
  if (!values.length) return false;
  const first = new Date(values[0]).toDateString();
  return values.every((value) => new Date(value).toDateString() === first);
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

function LineChart({
  values,
  dates,
  ariaLabel,
  height = 180,
}: {
  values: number[];
  dates: string[];
  ariaLabel: string;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <div className="flex min-h-[150px] items-center justify-center rounded-lg border border-border bg-background px-4 text-center text-xs text-text-muted">
        Complete this drill again to start a trend line.
      </div>
    );
  }

  const width = 640;
  const padX = 26;
  const padY = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.max(Math.abs(max), 1) * 0.05);
  const x = (index: number) => padX + (index / Math.max(values.length - 1, 1)) * (width - padX * 2);
  const y = (value: number) => padY + ((max + span * 0.08 - value) / (span * 1.16)) * (height - padY * 2);
  const polyline = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const useTime = sameDay(dates);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background px-2 py-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[170px] w-full" role="img" aria-label={ariaLabel}>
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="stroke-border" strokeWidth="1" />
        <polyline points={polyline} fill="none" className="stroke-accent" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => (
          <circle key={`${dates[index]}-${index}`} cx={x(index)} cy={y(value)} r="5" className="fill-background stroke-accent" strokeWidth="3" />
        ))}
      </svg>
      <div className="flex justify-between px-3 pb-1 text-[10px] text-text-muted">
        <span>{useTime ? formatTime(dates[0]) : formatDate(dates[0])}</span>
        <span>{useTime ? formatTime(dates[dates.length - 1]) : formatDate(dates[dates.length - 1])}</span>
      </div>
    </div>
  );
}

function ProgressChart({ group }: { group: AthleteResultGroup }) {
  const sessions = [...group.results].reverse();
  if (!sessions.length) {
    return (
      <div className="flex min-h-[150px] items-center justify-center rounded-lg border border-border bg-background px-4 text-center text-xs text-text-muted">
        Complete this drill to start a progress chart.
      </div>
    );
  }

  const width = 640;
  const height = 180;
  const padX = 40;
  const padY = 24;
  const attemptValues = sessions.flatMap((session) => session.attempts.map((attempt) => attempt.value));
  const allValues = [...attemptValues, ...sessions.map((session) => session.value)];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = Math.max(max - min, Math.max(Math.abs(max), 1) * 0.05);
  const plotWidth = width - padX * 2;
  const sessionX = (index: number) => sessions.length === 1
    ? width / 2
    : padX + (index / (sessions.length - 1)) * plotWidth;
  const y = (value: number) => padY + ((max + span * 0.08 - value) / (span * 1.16)) * (height - padY * 2);
  const sessionSpacing = sessions.length > 1 ? plotWidth / (sessions.length - 1) : plotWidth;
  const clusterWidth = Math.min(44, Math.max(20, sessionSpacing * 0.32));
  const attemptX = (sessionIndex: number, attemptIndex: number, attemptCount: number) => {
    if (attemptCount <= 1) return sessionX(sessionIndex);
    return sessionX(sessionIndex) + ((attemptIndex / (attemptCount - 1)) - 0.5) * clusterWidth;
  };
  const sessionPolyline = sessions.map((session, index) => `${sessionX(index)},${y(session.value)}`).join(" ");
  const dates = sessions.map((session) => session.started_at);
  const useTime = sameDay(dates);
  const totalAttempts = sessions.reduce((sum, session) => sum + session.attempts.length, 0);
  const sessionLabel = (value: string) => useTime ? formatTime(value) : formatDate(value);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background px-2 py-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full" role="img" aria-label={`${group.drill.name} attempts grouped by session with session-result trend`}>
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="stroke-border" strokeWidth="1" />
        {sessions.map((session, sessionIndex) => (
          <line
            key={`guide-${session.session_id}`}
            x1={sessionX(sessionIndex)}
            y1={padY}
            x2={sessionX(sessionIndex)}
            y2={height - padY}
            className="stroke-border"
            strokeWidth="1"
            opacity="0.45"
          />
        ))}
        {sessions.length > 1 && (
          <polyline points={sessionPolyline} fill="none" className="stroke-accent" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {sessions.flatMap((session, sessionIndex) => session.attempts.map((attempt, attemptIndex) => (
          <circle
            key={attempt.id}
            cx={attemptX(sessionIndex, attemptIndex, session.attempts.length)}
            cy={y(attempt.value)}
            r="4"
            className="fill-background stroke-text-muted"
            strokeWidth="2"
          >
            <title>{`Attempt ${attempt.attempt_number}: ${formatResult(attempt.value, session.metric)}`}</title>
          </circle>
        )))}
        {sessions.map((session, sessionIndex) => (
          <circle
            key={`result-${session.session_id}`}
            cx={sessionX(sessionIndex)}
            cy={y(session.value)}
            r="6"
            className="fill-accent stroke-background"
            strokeWidth="3"
          >
            <title>{`Session result: ${formatResult(session.value, session.metric)}`}</title>
          </circle>
        ))}
      </svg>
      {sessions.length === 1 ? (
        <div className="px-3 pb-1 text-center text-[10px] text-text-muted">
          {sessionLabel(sessions[0].started_at)} · {totalAttempts} attempt{totalAttempts === 1 ? "" : "s"}
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-1 text-[10px] text-text-muted">
          <span>{sessionLabel(sessions[0].started_at)}</span>
          <span>{sessions.length} sessions · {totalAttempts} attempts</span>
          <span className="text-right">{sessionLabel(sessions[sessions.length - 1].started_at)}</span>
        </div>
      )}
      <div className="flex justify-center gap-4 px-3 pb-1 pt-1 text-[9px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-text-muted bg-background" />Attempt</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" />Session result</span>
      </div>
    </div>
  );
}

function TeamTrendCard({ trend }: { trend: TeamDrillTrend | null }) {
  const points = trend?.points ?? [];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-extrabold">Team trend</div>
        <div className="mt-0.5 text-[10px] text-text-muted">Average result by completed session</div>
      </div>
      <div className="p-3">
        {!trend?.metric || points.length < 2 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-border bg-background p-4 text-center text-xs text-text-muted">
            Complete this drill in at least two sessions to see a team trend.
          </div>
        ) : (
          <>
            <LineChart
              values={points.map((point) => point.average)}
              dates={points.map((point) => point.started_at)}
              ariaLabel={`${trend.drill.name} team average trend`}
              height={150}
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-text-muted">
              <span>{points[points.length - 1].athlete_count} athlete{points[points.length - 1].athlete_count === 1 ? "" : "s"} in latest average</span>
              <span className="font-bold text-text-secondary">{formatResult(points[points.length - 1].average, trend.metric)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function statusBadge(status: SessionSummary["status"] | SessionDetail["session"]["status"]) {
  const label = status === "completed" ? "Completed" : status === "abandoned" ? "Abandoned" : "Active";
  const classes = status === "completed"
    ? "border-success/35 bg-success/10 text-success"
    : status === "abandoned"
      ? "border-border bg-background text-text-muted"
      : "border-[rgba(124,58,237,0.38)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] ${classes}`}>{label}</span>;
}

function SessionDetailDrawer({ detail, loading, onClose }: { detail: SessionDetail | null; loading: boolean; onClose: () => void }) {
  if (!detail && !loading) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/45" role="dialog" aria-modal="true" aria-label="Session detail">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close session detail" onClick={onClose} />
      <aside className="relative z-10 h-full w-full max-w-[600px] overflow-y-auto border-l border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-4 pb-4 pt-[calc(16px+env(safe-area-inset-top))] sm:px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Session detail</div>
            <h2 className="mt-0.5 truncate text-xl font-extrabold">{detail?.drill_definition.name ?? "Loading…"}</h2>
            {detail && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted"><span>{formatDateTime(detail.session.started_at)}</span>{statusBadge(detail.session.status)}</div>}
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-text-muted hover:bg-surface-elevated hover:text-text-primary" aria-label="Close"><X size={18} /></button>
        </div>

        {loading || !detail ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-surface-elevated" />)}
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-text-muted">
              <span>{detail.athletes.length} athlete{detail.athletes.length === 1 ? "" : "s"} · {detail.attempts.length} saved attempt{detail.attempts.length === 1 ? "" : "s"}</span>
              <span>{detail.drill_definition.attempts.count} attempt{detail.drill_definition.attempts.count === 1 ? "" : "s"} per athlete</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              {detail.athletes.map((athlete) => {
                const attempts = detail.attempts.filter((attempt) => attempt.athlete_id === athlete.athlete_id);
                const result = deriveSessionAthleteResult(detail.drill_definition, attempts);
                return (
                  <div key={athlete.id} className="border-b border-border p-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold">{athlete.membership.jersey_number ? `#${athlete.membership.jersey_number} ` : ""}{athlete.athlete.first_name} {athlete.athlete.last_name}</div>
                        <div className="mt-0.5 text-[10px] text-text-muted">{[athlete.membership.primary_position, athlete.membership.secondary_position].filter(Boolean).join(" / ") || athlete.status}</div>
                      </div>
                      <div className="text-right">
                        {athlete.status === "skipped" ? (
                          <span className="text-xs font-bold text-text-muted">Skipped</span>
                        ) : result ? (
                          <div className="text-lg font-black tabular-nums">{formatResult(result.value, result.metric)}</div>
                        ) : (
                          <span className="text-xs font-bold text-text-muted">No result</span>
                        )}
                      </div>
                    </div>
                    {attempts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[...attempts].sort((a, b) => a.attempt_number - b.attempt_number).map((attempt) => {
                          const attemptResult = deriveSessionAthleteResult(detail.drill_definition, [attempt]);
                          return (
                            <span key={attempt.id} className="inline-flex min-h-7 items-center rounded-md border border-border bg-surface px-2 text-[10px] text-text-muted">
                              <strong className="mr-1 text-text-secondary">A{attempt.attempt_number}</strong>{attemptResult ? formatResult(attemptResult.value, attemptResult.metric) : "—"}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export function DataScreen({ team }: { team: Team | null }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [drillId, setDrillId] = useState("");
  const [group, setGroup] = useState<AthleteResultGroup | null>(null);
  const [leaderboard, setLeaderboard] = useState<DrillLeaderboard | null>(null);
  const [trend, setTrend] = useState<TeamDrillTrend | null>(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadBase = async () => {
    if (!team) {
      setRoster([]);
      setDrills([]);
      setSessions([]);
      setAthleteId("");
      setDrillId("");
      setLoadingBase(false);
      return;
    }
    setLoadingBase(true);
    setError("");
    try {
      const [nextRoster, nextDrills, nextSessions] = await Promise.all([
        getRoster(team.id),
        listDrills(),
        listTeamSessions(team.id, 5),
      ]);
      setRoster(nextRoster);
      setDrills(nextDrills);
      setSessions(nextSessions);
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
      setTrend(null);
      return;
    }
    setLoadingResults(true);
    setError("");
    try {
      const [athleteResults, nextLeaderboard, nextTrend] = await Promise.all([
        getAthleteResults(athleteId, { teamId: team.id, drillId }),
        getDrillLeaderboard(drillId, team.id),
        getTeamDrillTrend(team.id, drillId),
      ]);
      setGroup(athleteResults.groups.find((candidate) => candidate.drill.id === drillId) ?? null);
      setLeaderboard(nextLeaderboard);
      setTrend(nextTrend);
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

  const openSession = async (sessionId: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getTrainingSession(sessionId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load session detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedAthlete = useMemo(() => roster.find((row) => row.athlete.id === athleteId) ?? null, [athleteId, roster]);
  const selectedDrill = useMemo(() => drills.find((drill) => drill.id === drillId) ?? null, [drillId, drills]);
  const change = changeCopy(group);

  if (!team) {
    return <section className="p-6 text-sm text-text-muted">Create or select a team to view Data.</section>;
  }

  const athleteOptions = roster.map((row) => ({
    value: row.athlete.id,
    label: `${row.membership.jersey_number ? `#${row.membership.jersey_number} · ` : ""}${athleteName(row)}`,
    meta: [row.membership.primary_position, row.membership.secondary_position].filter(Boolean).join(" / ") || undefined,
  }));
  const drillOptions = drills.map((drill) => ({ value: drill.id, label: drill.name, meta: `${drill.category} · ${drill.measurement_type.replaceAll("_", " ")}` }));

  return (
    <section className="mx-auto max-w-[1220px] px-3 pb-8 pt-[18px] sm:px-4 md:px-6 md:pt-[22px]">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[23px] font-extrabold leading-[1.08] tracking-[-0.035em] md:text-[29px]">Data</h1>
          <p className="mt-1 text-[13px] text-text-muted">Progress, sessions, and ranking from saved training results.</p>
        </div>
        {(loadingBase || loadingResults) && <RefreshCw size={17} className="animate-spin text-text-muted" />}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary">
          <span>{error}</span>
          <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => { void loadBase(); void loadResults(); }}>Retry</Button>
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2">
        <SearchSelect label="Athlete" value={athleteId} options={athleteOptions} onChange={setAthleteId} placeholder="No athletes" searchPlaceholder="Search athletes…" disabled={loadingBase || !roster.length} />
        <SearchSelect label="Drill" value={drillId} options={drillOptions} onChange={setDrillId} placeholder="No drills" searchPlaceholder="Search drills…" disabled={loadingBase || !drills.length} />
      </div>

      {!loadingBase && (!roster.length || !drills.length) ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <Activity className="mx-auto text-text-muted" size={28} />
          <h2 className="mt-3 text-lg font-extrabold">Nothing to analyze yet</h2>
          <p className="mt-1 text-sm text-text-muted">Data appears after you have athletes, drills, and saved training results.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <div className="min-w-0 space-y-4">
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-extrabold">{selectedAthlete ? athleteName(selectedAthlete) : "Athlete"}</div>
                    <div className="truncate text-xs text-text-muted">{selectedDrill?.name ?? "Select a drill"}</div>
                  </div>
                  {group?.summary.result_count ? <span className="text-[11px] font-bold text-text-muted">{group.summary.result_count} session{group.summary.result_count === 1 ? "" : "s"}</span> : null}
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
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Latest vs previous</div>
                        {change ? (
                          <div className={`mt-1 flex items-center gap-1.5 text-sm font-extrabold ${change.improved ? "text-success" : "text-text-secondary"}`}>
                            {change.improved ? <TrendingUp size={16} /> : <TrendingDown size={16} />}{change.text}
                          </div>
                        ) : <div className="mt-1 text-sm font-bold text-text-muted">Need 2 sessions</div>}
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
                <div className="border-b border-border px-4 py-3 text-sm font-extrabold">Session history</div>
                {!group?.results.length ? (
                  <div className="p-5 text-sm text-text-muted">No completed-session history for this athlete and drill.</div>
                ) : (
                  <div>
                    {group.results.map((result, index) => {
                      const isPb = group.summary.pb !== null && result.value === group.summary.pb;
                      return (
                        <button key={result.session_id} type="button" onClick={() => void openSession(result.session_id)} className="grid min-h-[58px] w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 border-b border-border px-4 text-left transition-colors last:border-b-0 hover:bg-surface-elevated">
                          <span className="min-w-0">
                            <span className="text-xs font-bold">{formatDateTime(result.started_at)}</span>
                            <span className="mt-0.5 block text-[10px] text-text-muted">{result.attempt_count} saved attempt{result.attempt_count === 1 ? "" : "s"}</span>
                          </span>
                          <span className="flex items-center gap-2 text-right">
                            {index === 0 && <span className="hidden text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted sm:inline">Latest</span>}
                            {isPb && <span className="rounded-full border border-[rgba(124,58,237,0.4)] bg-[rgba(124,58,237,0.12)] px-1.5 py-0.5 text-[9px] font-black text-[#c4b5fd]">PB</span>}
                            <span className="text-base font-black tabular-nums">{formatResult(result.value, result.metric)}</span>
                          </span>
                          <ChevronRight size={14} className="text-text-muted" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <aside className="min-w-0 space-y-4 self-start">
              <section className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-extrabold"><Trophy size={16} /> Leaderboard</div>
                    <div className="mt-0.5 text-[10px] text-text-muted">Personal best · active {team.name} roster</div>
                  </div>
                  {leaderboard?.metric?.direction === "none" && <span className="text-[10px] font-bold text-text-muted">Unranked</span>}
                </div>
                {!leaderboard?.entries.length ? (
                  <div className="p-5 text-sm text-text-muted">No active-roster results for this drill yet.</div>
                ) : (
                  <div>
                    {leaderboard.entries.map((entry) => {
                      const selected = entry.athlete.id === athleteId;
                      return (
                        <button key={entry.athlete.id} type="button" onClick={() => setAthleteId(entry.athlete.id)} className={`grid min-h-[56px] w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 text-left last:border-b-0 ${selected ? "border-l-2 border-l-accent bg-[rgba(124,58,237,0.12)]" : "hover:bg-surface-elevated"}`}>
                          <span className="text-center text-xs font-black tabular-nums text-text-muted">{entry.rank ?? "—"}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-extrabold">{entry.membership.jersey_number ? `#${entry.membership.jersey_number} ` : ""}{entry.athlete.first_name} {entry.athlete.last_name}</span>
                            <span className="block truncate text-[10px] text-text-muted">{[entry.membership.primary_position, entry.membership.secondary_position].filter(Boolean).join(" / ") || `${entry.result_count} session${entry.result_count === 1 ? "" : "s"}`}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-sm font-black tabular-nums">{formatResult(entry.pb, leaderboard.metric)}</span>
                            <span className="block text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">PB</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
              <TeamTrendCard trend={trend} />
            </aside>
          </div>

          <section className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-extrabold">Recent sessions</div>
                <div className="mt-0.5 text-[10px] text-text-muted">Latest 5 operational sessions. Open one to inspect athlete results and attempts.</div>
              </div>
              <Clock3 size={16} className="text-text-muted" />
            </div>
            {!sessions.length ? (
              <div className="p-5 text-sm text-text-muted">No sessions recorded yet.</div>
            ) : (
              <div>
                {sessions.map((session) => (
                  <button key={session.id} type="button" onClick={() => void openSession(session.id)} className="grid min-h-[62px] w-full grid-cols-[36px_minmax(0,1fr)_auto_16px] items-center gap-3 border-b border-border px-4 text-left last:border-b-0 hover:bg-surface-elevated">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                      <DrillIcon drill={{ icon: session.drill_icon, category: session.drill_category }} size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><strong className="truncate text-xs">{session.drill_name}</strong>{statusBadge(session.status)}</span>
                      <span className="mt-0.5 block text-[10px] text-text-muted">{formatDateTime(session.started_at)} · {session.attempt_count} attempt{session.attempt_count === 1 ? "" : "s"}</span>
                    </span>
                    <span className="text-right text-[10px] text-text-muted"><strong className="block text-xs text-text-secondary">{session.completed_count} complete</strong>{session.skipped_count ? `${session.skipped_count} skipped` : `${session.athlete_count} athlete${session.athlete_count === 1 ? "" : "s"}`}</span>
                    <ChevronRight size={14} className="text-text-muted" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <SessionDetailDrawer detail={detail} loading={detailLoading} onClose={() => { setDetail(null); setDetailLoading(false); }} />
    </section>
  );
}
