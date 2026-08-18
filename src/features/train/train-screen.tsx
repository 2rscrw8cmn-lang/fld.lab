import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  CircleStop,
  Flag,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  TimerReset,
  X,
} from "lucide-react";

import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import { buildManualResult, initialManualValues, type ManualValues } from "@/features/train/manual-result";
import { ManualResultInput } from "@/features/train/manual-result-input";
import {
  ApiError,
  createTrainingSession,
  getActiveSession,
  getTrainingSession,
  listDrills,
  patchSessionAthlete,
  patchTrainingSession,
  persistTrainingAttempt,
  type AttemptPayload,
  type Drill,
  type DrillDefinition,
  type SessionAthlete,
  type SessionDetail,
  type Team,
} from "@/lib/api";

type Capture = {
  mode: "ready" | "running" | "review";
  elapsedMs: number;
  splits: Record<string, number>;
  startedAt: string | null;
  stoppedAt: string | null;
};

type PendingWrite = {
  payload: AttemptPayload;
  status: "pending" | "saved" | "failed";
  error?: string;
};

const emptyCapture = (): Capture => ({
  mode: "ready",
  elapsedMs: 0,
  splits: {},
  startedAt: null,
  stoppedAt: null,
});

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`
    : `${seconds}.${hundredths.toString().padStart(2, "0")}`;
}

function athleteName(athlete: SessionAthlete) {
  return `${athlete.athlete.first_name} ${athlete.athlete.last_name}`;
}

function athletePositions(athlete: SessionAthlete) {
  return [athlete.membership.primary_position, athlete.membership.secondary_position].filter(Boolean).join(" / ") || "—";
}

function measurementTypeLabel(type: Drill["measurement_type"]) {
  switch (type) {
    case "successes_attempts": return "Successes / attempts";
    case "custom_numeric": return "Custom numeric";
    default: return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function measurementValue(payload: AttemptPayload, key: string) {
  return payload.measurements.find((measurement) => measurement.key === key)?.value_numeric ?? null;
}

function attemptSummary(payload: AttemptPayload, definition: DrillDefinition) {
  if (definition.measurement.type === "time" && payload.elapsed_ms !== null) return formatTime(payload.elapsed_ms);
  const unit = definition.measurement.unit;

  if (definition.measurement.type === "successes_attempts") {
    return `${measurementValue(payload, "successes") ?? "—"}/${measurementValue(payload, "attempts") ?? "—"}`;
  }
  if (definition.measurement.type === "distance") {
    const value = measurementValue(payload, "distance");
    return `${value ?? "—"}${unit ? ` ${unit}` : ""}`;
  }
  if (definition.measurement.type === "count") {
    const value = measurementValue(payload, "count");
    return `${value ?? "—"}${unit ? ` ${unit}` : ""}`;
  }
  if (definition.measurement.type === "rating") {
    const value = measurementValue(payload, "rating");
    return definition.measurement.max !== undefined ? `${value ?? "—"}/${definition.measurement.max}` : `${value ?? "—"}`;
  }

  return payload.measurements
    .map((measurement) => `${measurement.label} ${measurement.value_numeric ?? "—"}${measurement.unit ? ` ${measurement.unit}` : ""}`)
    .join(" · ");
}

export function TrainScreen({ team, onNavigate }: { team: Team | null; onNavigate: (path: string) => void }) {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [selectedDrillId, setSelectedDrillId] = useState("");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [activeAthleteId, setActiveAthleteId] = useState("");
  const [capture, setCapture] = useState<Capture>(emptyCapture);
  const [manualValues, setManualValues] = useState<ManualValues>({});
  const [manualError, setManualError] = useState("");
  const [localAttempts, setLocalAttempts] = useState<AttemptPayload[]>([]);
  const [writes, setWrites] = useState<Record<string, PendingWrite>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sessionAction, setSessionAction] = useState(false);
  const [error, setError] = useState("");
  const startPerf = useRef<number | null>(null);

  const requiredAttempts = session?.drill_definition.attempts.count ?? 0;
  const isTimed = session?.drill_definition.measurement.type === "time";

  const attemptCount = (athleteId: string) => {
    const persisted = session?.attempts.filter((attempt) => attempt.athlete_id === athleteId).length ?? 0;
    const local = localAttempts.filter((attempt) => attempt.athlete_id === athleteId).length;
    return persisted + local;
  };

  const athleteIsComplete = (athlete: SessionAthlete) =>
    athlete.status === "skipped" || attemptCount(athlete.athlete_id) >= requiredAttempts;

  const activeAthlete = session?.athletes.find((athlete) => athlete.athlete_id === activeAthleteId) ?? null;
  const activeAttemptNumber = activeAthlete ? Math.min(attemptCount(activeAthlete.athlete_id) + 1, Math.max(requiredAttempts, 1)) : 1;
  const sessionComplete = Boolean(session?.athletes.length) && session!.athletes.every(athleteIsComplete);
  const failedWrites = Object.values(writes).filter((write) => write.status === "failed");
  const pendingWrites = Object.values(writes).filter((write) => write.status === "pending");
  const unresolvedWrites = failedWrites.length + pendingWrites.length;

  const chooseFirstEligible = (detail: SessionDetail, extraAttempts: AttemptPayload[] = []) => {
    const count = (athleteId: string) =>
      detail.attempts.filter((attempt) => attempt.athlete_id === athleteId).length +
      extraAttempts.filter((attempt) => attempt.athlete_id === athleteId).length;
    return detail.athletes.find(
      (athlete) => athlete.status !== "skipped" && count(athlete.athlete_id) < detail.drill_definition.attempts.count,
    )?.athlete_id ?? detail.athletes[0]?.athlete_id ?? "";
  };

  const resetEntry = (definition = session?.drill_definition) => {
    startPerf.current = null;
    setCapture(emptyCapture());
    setManualValues(definition ? initialManualValues(definition) : {});
    setManualError("");
  };

  const load = async () => {
    if (!team) {
      setDrills([]);
      setSession(null);
      setActiveAthleteId("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [availableDrills, activeSession] = await Promise.all([listDrills(), getActiveSession(team.id)]);
      setDrills(availableDrills);
      setSelectedDrillId((current) => availableDrills.some((drill) => drill.id === current) ? current : availableDrills[0]?.id ?? "");
      setSession(activeSession);
      setLocalAttempts([]);
      setWrites({});
      setCapture(emptyCapture());
      setManualValues(activeSession ? initialManualValues(activeSession.drill_definition) : {});
      setManualError("");
      if (activeSession) setActiveAthleteId(chooseFirstEligible(activeSession));
      else setActiveAthleteId("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load training.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Team switch intentionally resets volatile session capture state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id]);

  useEffect(() => {
    if (capture.mode !== "running") return;
    let frame = 0;
    const tick = () => {
      if (startPerf.current !== null) {
        setCapture((current) => ({ ...current, elapsedMs: Math.max(0, Math.round(performance.now() - startPerf.current!)) }));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [capture.mode]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (capture.mode === "running" || capture.mode === "review" || unresolvedWrites > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [capture.mode, unresolvedWrites]);

  const startSession = async () => {
    if (!team || !selectedDrillId) return;
    setStarting(true);
    setError("");
    try {
      const detail = await createTrainingSession(team.id, selectedDrillId);
      setSession(detail);
      setActiveAthleteId(chooseFirstEligible(detail));
      setLocalAttempts([]);
      setWrites({});
      resetEntry(detail.drill_definition);
    } catch (startError) {
      if (startError instanceof ApiError && startError.status === 409 && startError.fields?.session_id) {
        try {
          const detail = await getTrainingSession(startError.fields.session_id);
          setSession(detail);
          setActiveAthleteId(chooseFirstEligible(detail));
          resetEntry(detail.drill_definition);
          return;
        } catch {
          // Fall through to the original error below.
        }
      }
      setError(startError instanceof Error ? startError.message : "Could not start session.");
    } finally {
      setStarting(false);
    }
  };

  const selectAthlete = (athleteId: string) => {
    if (capture.mode !== "ready") return;
    setActiveAthleteId(athleteId);
    resetEntry();
  };

  const startTimer = () => {
    if (!activeAthlete || athleteIsComplete(activeAthlete) || !isTimed) return;
    startPerf.current = performance.now();
    setCapture({ mode: "running", elapsedMs: 0, splits: {}, startedAt: new Date().toISOString(), stoppedAt: null });
  };

  const captureSplit = () => {
    if (capture.mode !== "running" || startPerf.current === null || !session || !isTimed) return;
    const nextSplit = (session.drill_definition.timer?.splits ?? []).find((split) => capture.splits[split.key] === undefined);
    if (!nextSplit) return;
    const elapsed = Math.max(1, Math.round(performance.now() - startPerf.current));
    setCapture((current) => ({ ...current, elapsedMs: elapsed, splits: { ...current.splits, [nextSplit.key]: elapsed } }));
  };

  const stopTimer = () => {
    if (capture.mode !== "running" || startPerf.current === null || !isTimed) return;
    const elapsed = Math.max(1, Math.round(performance.now() - startPerf.current));
    startPerf.current = null;
    setCapture((current) => ({ ...current, mode: "review", elapsedMs: elapsed, stoppedAt: new Date().toISOString() }));
  };

  const reviewManualResult = () => {
    if (!session || isTimed || !activeAthlete || athleteIsComplete(activeAthlete)) return;
    const result = buildManualResult(session.drill_definition, manualValues);
    if (!result.ok) {
      setManualError(result.error);
      return;
    }
    setManualError("");
    setCapture((current) => ({ ...current, mode: "review" }));
  };

  const nextEligibleAthlete = (currentAthleteId: string, nextLocalAttempts: AttemptPayload[]) => {
    if (!session) return "";
    const startIndex = Math.max(0, session.athletes.findIndex((athlete) => athlete.athlete_id === currentAthleteId));
    for (let offset = 1; offset <= session.athletes.length; offset += 1) {
      const athlete = session.athletes[(startIndex + offset) % session.athletes.length];
      const persisted = session.attempts.filter((attempt) => attempt.athlete_id === athlete.athlete_id).length;
      const local = nextLocalAttempts.filter((attempt) => attempt.athlete_id === athlete.athlete_id).length;
      if (athlete.status !== "skipped" && persisted + local < requiredAttempts) return athlete.athlete_id;
    }
    return currentAthleteId;
  };

  const sendWrite = async (payload: AttemptPayload) => {
    if (!session) return;
    setWrites((current) => ({ ...current, [payload.client_attempt_id]: { payload, status: "pending" } }));
    try {
      await persistTrainingAttempt(session.session.id, payload);
      setWrites((current) => ({ ...current, [payload.client_attempt_id]: { payload, status: "saved" } }));
    } catch (saveError) {
      setWrites((current) => ({
        ...current,
        [payload.client_attempt_id]: {
          payload,
          status: "failed",
          error: saveError instanceof Error ? saveError.message : "Save failed.",
        },
      }));
    }
  };

  const saveAttempt = (advance: boolean) => {
    if (!session || !activeAthlete || capture.mode !== "review") return;

    let payload: AttemptPayload;
    if (isTimed) {
      const splits = session.drill_definition.timer?.splits ?? [];
      payload = {
        client_attempt_id: crypto.randomUUID(),
        athlete_id: activeAthlete.athlete_id,
        attempt_number: activeAttemptNumber,
        started_at: capture.startedAt,
        stopped_at: capture.stoppedAt,
        elapsed_ms: capture.elapsedMs,
        valid: true,
        note: null,
        measurements: [
          {
            key: "total_time",
            label: "Total Time",
            value_numeric: capture.elapsedMs,
            value_text: null,
            unit: "ms",
            sequence: 0,
          },
          ...splits
            .filter((split) => capture.splits[split.key] !== undefined)
            .map((split, index) => ({
              key: split.key,
              label: split.label,
              value_numeric: capture.splits[split.key],
              value_text: null,
              unit: "ms",
              sequence: index + 1,
            })),
        ],
      };
    } else {
      const manual = buildManualResult(session.drill_definition, manualValues);
      if (!manual.ok) {
        setManualError(manual.error);
        setCapture((current) => ({ ...current, mode: "ready" }));
        return;
      }
      payload = {
        client_attempt_id: crypto.randomUUID(),
        athlete_id: activeAthlete.athlete_id,
        attempt_number: activeAttemptNumber,
        started_at: null,
        stopped_at: null,
        elapsed_ms: null,
        valid: true,
        note: null,
        measurements: manual.measurements,
      };
    }

    const nextLocal = [...localAttempts, payload];
    setLocalAttempts(nextLocal);
    setSession((current) => current ? {
      ...current,
      athletes: current.athletes.map((athlete) =>
        athlete.athlete_id === payload.athlete_id && attemptCount(payload.athlete_id) + 1 >= requiredAttempts
          ? { ...athlete, status: "complete" as const }
          : athlete,
      ),
    } : current);
    resetEntry(session.drill_definition);
    if (advance) setActiveAthleteId(nextEligibleAthlete(activeAthlete.athlete_id, nextLocal));
    void sendWrite(payload);
  };

  const retryWrite = (write: PendingWrite) => void sendWrite(write.payload);

  const toggleSkip = async (athlete: SessionAthlete) => {
    if (!session || capture.mode !== "ready") return;
    const next = athlete.status === "skipped" ? "pending" : "skipped";
    try {
      const result = await patchSessionAthlete(session.session.id, athlete.athlete_id, next);
      setSession((current) => current ? {
        ...current,
        athletes: current.athletes.map((row) => row.athlete_id === athlete.athlete_id ? { ...row, status: result.status } : row),
      } : current);
      if (next === "skipped" && athlete.athlete_id === activeAthleteId) {
        setActiveAthleteId(nextEligibleAthlete(athlete.athlete_id, localAttempts));
        resetEntry();
      }
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : "Could not update athlete.");
    }
  };

  const finishSession = async () => {
    if (!session || !sessionComplete || unresolvedWrites > 0) return;
    setSessionAction(true);
    setError("");
    try {
      await patchTrainingSession(session.session.id, "completed");
      onNavigate("/");
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : "Could not finish session.");
    } finally {
      setSessionAction(false);
    }
  };

  const abandonSession = async () => {
    if (!session || capture.mode === "running") return;
    if (!window.confirm("Abandon this session? Saved attempts will be kept.")) return;
    setSessionAction(true);
    setError("");
    try {
      await patchTrainingSession(session.session.id, "abandoned");
      setSession(null);
      setLocalAttempts([]);
      setWrites({});
      resetEntry(undefined);
      setActiveAthleteId("");
    } catch (abandonError) {
      setError(abandonError instanceof Error ? abandonError.message : "Could not abandon session.");
    } finally {
      setSessionAction(false);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto max-w-[1160px] px-4 py-6 md:px-7">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-elevated" />
        <div className="mt-5 h-64 animate-pulse rounded-xl border border-border bg-surface" />
      </section>
    );
  }

  if (!team) {
    return (
      <section className="mx-auto max-w-[1160px] px-4 py-6 md:px-7">
        <h1 className="text-2xl font-extrabold tracking-tight">Train</h1>
        <div className="mt-5 rounded-xl border border-border bg-surface p-6">
          <div className="font-bold">No team selected</div>
          <p className="mt-1 text-sm text-text-muted">Create or select a team before starting a training session.</p>
          <Button className="mt-4" onClick={() => onNavigate("/roster")}>Open Roster</Button>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="mx-auto max-w-[900px] px-4 pb-8 pt-5 md:px-7 md:pt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">Train</h1>
            <p className="mt-1 text-sm text-text-muted">Start one drill with the current team.</p>
          </div>
          <div className="text-right text-xs text-text-muted">
            <div className="font-bold text-text-secondary">{team.name}</div>
            {team.season_label && <div>{team.season_label}</div>}
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-text-secondary">
            <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={17} />
            <span>{error}</span>
          </div>
        )}

        <section className="mt-5 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">Choose drill</div>
          </div>
          {drills.length ? (
            <div className="divide-y divide-border">
              {drills.map((drill) => (
                <button
                  key={drill.id}
                  type="button"
                  onClick={() => setSelectedDrillId(drill.id)}
                  className={`grid min-h-[58px] w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 text-left transition-colors hover:bg-surface-elevated ${selectedDrillId === drill.id ? "bg-surface-elevated" : ""}`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-text-muted">
                    {drill.measurement_type === "time" ? <TimerReset size={18} /> : <Activity size={18} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{drill.name}</span>
                    <span className="block text-xs text-text-muted">{drill.category} · {measurementTypeLabel(drill.measurement_type)} · v{drill.current_version}</span>
                  </span>
                  <span className={`h-4 w-4 rounded-full border ${selectedDrillId === drill.id ? "border-accent bg-accent" : "border-border"}`} aria-hidden={true} />
                </button>
              ))}
            </div>
          ) : (
            <div className="p-5 text-sm text-text-muted">No drills are available yet. Import a drill in the Drill Library.</div>
          )}
        </section>

        <Button size="lg" className="mt-4 min-h-[58px] w-full text-base font-extrabold" disabled={!selectedDrillId || starting} onClick={() => void startSession()}>
          {starting ? "Starting…" : "Start Session"}
        </Button>
      </section>
    );
  }

  const splits = isTimed ? session.drill_definition.timer?.splits ?? [] : [];
  const nextSplit = splits.find((split) => capture.splits[split.key] === undefined);
  const manualResult = !isTimed ? buildManualResult(session.drill_definition, manualValues) : null;
  const completedCount = session.athletes.filter((athlete) => athlete.status !== "skipped" && athleteIsComplete(athlete)).length;
  const skippedCount = session.athletes.filter((athlete) => athlete.status === "skipped").length;

  return (
    <section className="mx-auto max-w-[1180px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">Active session</div>
          <h1 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">{session.drill_definition.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {unresolvedWrites > 0 && (
            <div className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:flex ${failedWrites.length ? "border-danger/40 text-danger" : "border-border text-text-muted"}`}>
              {failedWrites.length ? <AlertTriangle size={13} /> : <RefreshCw size={13} className="animate-spin" />}
              {failedWrites.length ? `${failedWrites.length} unsaved` : "Saving"}
            </div>
          )}
          <Button variant="destructive" className="min-h-9 px-3 text-xs" disabled={capture.mode === "running" || sessionAction} onClick={() => void abandonSession()}>Abandon</Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-text-secondary">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}

      {failedWrites.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-lg border border-danger/40 bg-surface">
          <div className="border-b border-border px-3 py-2 text-xs font-bold text-danger">Unsaved results</div>
          {failedWrites.map((write) => {
            const athlete = session.athletes.find((row) => row.athlete_id === write.payload.athlete_id);
            return (
              <div key={write.payload.client_attempt_id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
                <div className="min-w-0 text-xs">
                  <span className="font-bold">{athlete ? athleteName(athlete) : "Athlete"}</span>
                  <span className="ml-2 text-text-muted">Attempt {write.payload.attempt_number} · {attemptSummary(write.payload, session.drill_definition)}</span>
                  {write.error && <div className="truncate text-[11px] text-danger">{write.error}</div>}
                </div>
                <Button variant="warning" className="min-h-8 shrink-0 px-3 text-xs" onClick={() => retryWrite(write)}>Retry</Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[275px_minmax(0,1fr)]">
        <aside className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
          <div className="flex min-h-[44px] items-center justify-between border-b border-border px-3">
            <span className="text-xs font-bold">Athletes</span>
            <span className="text-[11px] text-text-muted">{completedCount}/{session.athletes.length - skippedCount} complete</span>
          </div>
          <div className="max-h-[610px] overflow-y-auto">
            {session.athletes.map((athlete) => {
              const count = attemptCount(athlete.athlete_id);
              const isActive = athlete.athlete_id === activeAthleteId;
              const complete = athleteIsComplete(athlete);
              return (
                <button
                  key={athlete.id}
                  type="button"
                  disabled={capture.mode !== "ready"}
                  onClick={() => selectAthlete(athlete.athlete_id)}
                  className={`grid min-h-[52px] w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 text-left last:border-b-0 ${isActive ? "bg-surface-elevated" : "hover:bg-surface-elevated/60"} disabled:cursor-default`}
                >
                  <span className="text-[11px] font-extrabold tabular-nums text-text-muted">{athlete.membership.jersey_number || "—"}</span>
                  <span className="min-w-0">
                    <span className={`block truncate text-xs font-bold ${athlete.status === "skipped" ? "text-text-muted line-through" : ""}`}>{athleteName(athlete)}</span>
                    <span className="block truncate text-[10px] text-text-muted">{athletePositions(athlete)}</span>
                  </span>
                  <span className="text-[10px] font-bold text-text-muted">
                    {athlete.status === "skipped" ? "SKIP" : complete ? <Check size={14} className="text-success" /> : `${count}/${requiredAttempts}`}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border p-3 md:hidden">
            <SearchSelect
              label="Athlete"
              value={activeAthleteId}
              options={session.athletes.map((athlete) => ({
                value: athlete.athlete_id,
                label: `${athlete.membership.jersey_number ? `#${athlete.membership.jersey_number} ` : ""}${athleteName(athlete)}`,
                meta: `${athletePositions(athlete)}${athlete.status === "skipped" ? " · skipped" : ""}`,
              }))}
              onChange={selectAthlete}
              placeholder="Choose athlete"
              searchPlaceholder="Search athletes…"
              disabled={capture.mode !== "ready"}
            />
          </div>

          {sessionComplete ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center p-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success"><Flag size={25} /></span>
              <h2 className="mt-4 text-2xl font-extrabold">Session complete</h2>
              <p className="mt-1 text-sm text-text-muted">{completedCount} completed · {skippedCount} skipped</p>
              {unresolvedWrites > 0 ? (
                <div className="mt-5 max-w-sm rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-text-secondary">
                  {failedWrites.length ? "Retry failed results before finishing." : "Waiting for saved results to finish syncing."}
                </div>
              ) : (
                <Button variant="success" size="lg" className="mt-6 min-h-[56px] min-w-[220px] text-base font-extrabold" disabled={sessionAction} onClick={() => void finishSession()}>
                  {sessionAction ? "Finishing…" : "Finish Session"}
                </Button>
              )}
            </div>
          ) : !activeAthlete ? (
            <div className="flex min-h-[520px] items-center justify-center p-6 text-center text-sm text-text-muted">Choose an athlete to continue.</div>
          ) : activeAthlete.status === "skipped" ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center p-6 text-center">
              <SkipForward size={30} className="text-text-muted" />
              <h2 className="mt-3 text-xl font-extrabold">{athleteName(activeAthlete)} is skipped</h2>
              <Button variant="secondary" className="mt-5" onClick={() => void toggleSkip(activeAthlete)}>Unskip Athlete</Button>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="truncate text-xl font-extrabold sm:text-2xl">{athleteName(activeAthlete)}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {activeAthlete.membership.jersey_number ? `#${activeAthlete.membership.jersey_number} · ` : ""}{athletePositions(activeAthlete)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Attempt</div>
                  <div className="text-sm font-extrabold tabular-nums">{activeAttemptNumber} of {requiredAttempts}</div>
                </div>
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-4 py-7 sm:px-6">
                {isTimed ? (
                  <>
                    <div className="tabular-nums text-[68px] font-black leading-none tracking-[-0.06em] sm:text-[92px] lg:text-[112px]">
                      {formatTime(capture.elapsedMs)}
                    </div>
                    <div className="mt-3 min-h-6 text-center text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
                      {capture.mode === "running" ? "Running" : capture.mode === "review" ? "Review result" : "Ready"}
                    </div>

                    {splits.length > 0 && (
                      <div className="mt-5 flex min-h-10 flex-wrap justify-center gap-2">
                        {splits.map((split) => (
                          <span key={split.key} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs">
                            <span className="font-bold text-text-muted">{split.label}</span>
                            <span className="font-extrabold tabular-nums">{capture.splits[split.key] !== undefined ? formatTime(capture.splits[split.key]) : "—"}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {capture.mode === "ready" && (
                      <div className="mt-8 w-full max-w-[560px]">
                        <Button size="lg" className="min-h-[88px] w-full text-xl font-black sm:min-h-[100px] sm:text-2xl" onClick={startTimer}>
                          <Play size={25} fill="currentColor" /> Start
                        </Button>
                        <button type="button" onClick={() => void toggleSkip(activeAthlete)} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary">
                          <SkipForward size={16} /> Skip athlete
                        </button>
                      </div>
                    )}

                    {capture.mode === "running" && (
                      <div className={`mt-8 grid w-full max-w-[680px] gap-3 ${nextSplit ? "grid-cols-2" : "grid-cols-1"}`}>
                        {nextSplit && (
                          <Button variant="secondary" size="lg" className="min-h-[88px] text-lg font-extrabold sm:min-h-[100px]" onClick={captureSplit}>
                            <Flag size={22} /> Split {nextSplit.label}
                          </Button>
                        )}
                        <Button variant="destructive" size="lg" className="min-h-[88px] text-lg font-extrabold sm:min-h-[100px]" onClick={stopTimer}>
                          <CircleStop size={23} /> Stop
                        </Button>
                      </div>
                    )}
                  </>
                ) : capture.mode === "ready" ? (
                  <div className="flex w-full flex-col items-center">
                    <div className="mb-5 text-center">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Enter result</div>
                      <div className="mt-1 text-sm text-text-secondary">{measurementTypeLabel(session.drill_definition.measurement.type)}</div>
                    </div>
                    <ManualResultInput
                      definition={session.drill_definition}
                      values={manualValues}
                      onChange={(key, value) => {
                        setManualValues((current) => ({ ...current, [key]: value }));
                        if (manualError) setManualError("");
                      }}
                    />
                    {manualError && <p className="mt-3 text-center text-sm font-semibold text-danger">{manualError}</p>}
                    <div className="mt-7 w-full max-w-[560px]">
                      <Button size="lg" className="min-h-[64px] w-full text-base font-extrabold" onClick={reviewManualResult}>
                        Review Result
                      </Button>
                      <button type="button" onClick={() => void toggleSkip(activeAthlete)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary">
                        <SkipForward size={16} /> Skip athlete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Review result</div>
                    <div className="mt-3 max-w-[680px] text-[42px] font-black leading-tight tracking-[-0.04em] sm:text-[56px]">
                      {manualResult?.ok ? manualResult.summary : "—"}
                    </div>
                  </div>
                )}

                {capture.mode === "review" && (
                  <div className="mt-8 w-full max-w-[680px]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button size="lg" className="min-h-[64px] text-base font-extrabold" onClick={() => saveAttempt(true)}>
                        <Check size={20} /> Save + Next
                      </Button>
                      <Button variant="secondary" size="lg" className="min-h-[64px] text-base font-extrabold" onClick={() => saveAttempt(false)}>
                        Save + Stay
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="secondary" className="min-h-11" onClick={() => resetEntry()}><RotateCcw size={17} /> Redo</Button>
                      <Button variant="secondary" className="min-h-11" onClick={() => resetEntry()}><X size={17} /> Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-text-muted">
        <span>{team.name}{team.season_label ? ` · ${team.season_label}` : ""}</span>
        <span>{session.drill_definition.attempts.count} {session.drill_definition.attempts.count === 1 ? "attempt" : "attempts"} · {session.drill_definition.attempts.result}</span>
      </div>
    </section>
  );
}
