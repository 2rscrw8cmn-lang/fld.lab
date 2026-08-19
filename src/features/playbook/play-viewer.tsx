import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Pause, Pencil, Play, RotateCcw, Search, Undo2, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DiagramAssignment, DiagramPlayer, PlayDiagram, Point } from "@/features/playbook/playbook-model";
import {
  isPrimaryPlayer,
  playerColor,
  playerForAssignment,
  playerTextColor,
} from "@/features/playbook/playbook-visuals";
import { getRoster, type RosterRow } from "@/lib/api";
import {
  getPlayPersonnel,
  replacePlayPersonnel,
  type PlayPersonnelAssignment,
  type PlayPersonnelInput,
} from "@/lib/playbook-personnel-api";
import type { PlaySituation, PlayType } from "@/lib/playbook-api";

export type PlayViewerPlay = {
  id: string;
  team_id: string;
  name: string;
  side: "offense" | "defense";
  formation: string;
  play_type: PlayType;
  concept: string;
  situation: PlaySituation;
  active_play: boolean;
  notes: string;
  diagram: PlayDiagram;
};

type Props = {
  play: PlayViewerPlay;
  onBack: () => void;
  onEdit?: () => void;
  onMoveToEditor?: () => void;
};

type LabelMode = "positions" | "players";
type PersonnelStatus = "loading" | "ready" | "unavailable";

const PLAY_DURATION_MS = 2500;
const SNAP_HOLD_MS = 180;
const SNAP_HOLD_FRACTION = SNAP_HOLD_MS / PLAY_DURATION_MS;
const MOTION_PHASE = 0.22;

const SITUATION_LABELS: Record<PlaySituation, string> = {
  any: "Any",
  short: "Short",
  medium: "Medium",
  deep: "Deep",
  "no-run": "No-run",
  "goal-line": "Goal line",
  conversion: "Conversion",
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointAlongPolyline(points: Point[], progress: number): Point {
  if (!points.length) return { x: 50, y: 50 };
  if (points.length === 1) return points[0];

  const lengths = points.slice(1).map((point, index) => pointDistance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return points[points.length - 1];

  let remaining = clamp01(progress) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (remaining <= segmentLength || index === lengths.length - 1) {
      const start = points[index];
      const end = points[index + 1];
      const t = segmentLength <= 0 ? 1 : remaining / segmentLength;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }
    remaining -= segmentLength;
  }

  return points[points.length - 1];
}

function assignmentFor(diagram: PlayDiagram, playerId: string, kind: DiagramAssignment["kind"]) {
  return diagram.assignments.find((assignment) => assignment.player_id === playerId && assignment.kind === kind) ?? null;
}

function translatedRoute(route: DiagramAssignment, from: Point): Point[] {
  const start = route.points[0];
  if (!start) return route.points;
  const dx = from.x - start.x;
  const dy = from.y - start.y;
  return route.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function animatedPlayerPoint(player: DiagramPlayer, diagram: PlayDiagram, progress: number, hasMotion: boolean): Point {
  const motion = assignmentFor(diagram, player.id, "motion");
  const route = assignmentFor(diagram, player.id, "route");

  if (motion && hasMotion) {
    if (progress <= MOTION_PHASE) return pointAlongPolyline(motion.points, progress / MOTION_PHASE);
    const motionEnd = motion.points[motion.points.length - 1] ?? player;
    if (!route) return motionEnd;
    return pointAlongPolyline(translatedRoute(route, motionEnd), (progress - MOTION_PHASE) / (1 - MOTION_PHASE));
  }

  if (route) {
    const routeProgress = hasMotion ? (progress - MOTION_PHASE) / (1 - MOTION_PHASE) : progress;
    return routeProgress <= 0 ? player : pointAlongPolyline(route.points, routeProgress);
  }

  return player;
}

function polylinePoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function athleteName(assignment: PlayPersonnelAssignment) {
  return `${assignment.athlete.first_name} ${assignment.athlete.last_name}`.trim();
}

function rosterName(row: RosterRow) {
  return `${row.athlete.first_name} ${row.athlete.last_name}`.trim();
}

function playerMarkerLabel(player: DiagramPlayer, assignment: PlayPersonnelAssignment | undefined, mode: LabelMode) {
  if (mode === "positions" || !assignment) return player.label;
  const jersey = assignment.membership.jersey_number?.trim();
  if (jersey) return jersey.slice(0, 3);
  return `${assignment.athlete.first_name[0] ?? ""}${assignment.athlete.last_name[0] ?? ""}`.toUpperCase() || player.label;
}

function FieldLines() {
  const guides = [
    { y: 16, label: "+20" },
    { y: 31, label: "+15" },
    { y: 46, label: "+10" },
    { y: 61, label: "+5" },
  ];

  return (
    <>
      <rect x="3" y="3" width="94" height="94" rx="1.5" fill="none" className="stroke-border" strokeWidth="0.5" opacity="0.68" />
      {guides.map((guide) => (
        <g key={guide.y}>
          <line x1="3" y1={guide.y} x2="97" y2={guide.y} className="stroke-border" strokeWidth="0.32" opacity="0.44" />
          <text x="5" y={guide.y - 1.35} className="fill-text-muted text-[2px] font-bold" opacity="0.62">{guide.label}</text>
          {[25, 50, 75].map((x) => (
            <line key={x} x1={x} y1={guide.y - 0.65} x2={x} y2={guide.y + 0.65} className="stroke-border" strokeWidth="0.4" opacity="0.55" />
          ))}
        </g>
      ))}
      <line x1="3" y1="55" x2="97" y2="55" className="stroke-text-muted" strokeWidth="0.36" strokeDasharray="1.8 1.8" opacity="0.4" />
      <text x="95" y="53.3" textAnchor="end" className="fill-text-muted text-[2px] font-bold" opacity="0.62">7YD RUSH</text>
      <line x1="3" y1="76" x2="97" y2="76" className="stroke-text-secondary" strokeWidth="0.68" opacity="0.78" />
      <text x="5" y="74.1" className="fill-text-muted text-[2.15px] font-bold">LOS</text>
    </>
  );
}

function AnimatedField({
  diagram,
  progress,
  personnel,
  labelMode,
}: {
  diagram: PlayDiagram;
  progress: number;
  personnel: PlayPersonnelAssignment[];
  labelMode: LabelMode;
}) {
  const hasMotion = diagram.assignments.some((assignment) => assignment.kind === "motion");
  const movementProgress = clamp01((progress - SNAP_HOLD_FRACTION) / (1 - SNAP_HOLD_FRACTION));
  const routeProgress = hasMotion ? clamp01((movementProgress - MOTION_PHASE) / (1 - MOTION_PHASE)) : movementProgress;
  const motionProgress = hasMotion ? clamp01(movementProgress / MOTION_PHASE) : 1;
  const personnelByPlayer = useMemo(
    () => new Map(personnel.map((assignment) => [assignment.player_id, assignment])),
    [personnel],
  );

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Animated play diagram">
      <FieldLines />
      <defs>
        {diagram.assignments.map((assignment) => {
          const player = playerForAssignment(diagram, assignment.player_id);
          const primary = player ? isPrimaryPlayer(diagram, player.id) : false;
          const color = player ? playerColor(player, primary) : "var(--text-secondary)";
          return (
            <marker key={assignment.id} id={`viewer-arrow-${assignment.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth={assignment.kind === "route" ? "4" : "3.5"} markerHeight={assignment.kind === "route" ? "4" : "3.5"} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          );
        })}
      </defs>

      {diagram.assignments.map((assignment) => {
        const assignmentProgress = assignment.kind === "motion" ? motionProgress : routeProgress;
        const player = playerForAssignment(diagram, assignment.player_id);
        const primary = player ? isPrimaryPlayer(diagram, player.id) : false;
        const color = player ? playerColor(player, primary) : "var(--text-secondary)";
        const isMotion = assignment.kind === "motion";
        return (
          <g key={assignment.id}>
            <polyline
              points={polylinePoints(assignment.points)}
              fill="none"
              stroke={color}
              strokeWidth={isMotion ? 0.5 : 0.72}
              strokeDasharray={isMotion ? "2.2 1.8" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isMotion ? 0.28 : 0.26}
              markerEnd={`url(#viewer-arrow-${assignment.id})`}
            />
            <polyline
              points={polylinePoints(assignment.points)}
              fill="none"
              stroke={color}
              strokeWidth={isMotion ? 0.62 : 0.88}
              strokeDasharray="1"
              strokeDashoffset={1 - assignmentProgress}
              pathLength="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={assignmentProgress > 0 ? 0.96 : 0}
            />
          </g>
        );
      })}

      {diagram.players.map((player) => {
        const point = animatedPlayerPoint(player, diagram, movementProgress, hasMotion);
        const primary = isPrimaryPlayer(diagram, player.id);
        const color = playerColor(player, primary);
        const personnelAssignment = personnelByPlayer.get(player.id);
        const markerLabel = playerMarkerLabel(player, personnelAssignment, labelMode);
        const showAthleteName = labelMode === "players" && personnelAssignment;
        const athleteLabelY = point.y > 87 ? point.y - 5.8 : point.y + 6.3;
        return (
          <g key={player.id}>
            <circle cx={point.x} cy={point.y} r="3.75" fill={color} className="stroke-background" strokeWidth="0.9" />
            <text x={point.x} y={point.y + 1.02} textAnchor="middle" fill={playerTextColor(primary)} className="text-[2.75px] font-black">{markerLabel}</text>
            {showAthleteName && (
              <text x={point.x} y={athleteLabelY} textAnchor="middle" className="fill-text-secondary text-[2.15px] font-bold">
                {personnelAssignment.athlete.first_name.slice(0, 10)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function PersonnelEditor({
  diagram,
  roster,
  personnel,
  onClose,
  onSave,
}: {
  diagram: PlayDiagram;
  roster: RosterRow[];
  personnel: PlayPersonnelAssignment[];
  onClose: () => void;
  onSave: (assignments: PlayPersonnelInput[]) => Promise<void>;
}) {
  const initialAssignments = useMemo(
    () => Object.fromEntries(personnel.map((assignment) => [assignment.player_id, assignment.athlete_id])) as Record<string, string>,
    [personnel],
  );
  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments);
  const [selectedPlayerId, setSelectedPlayerId] = useState(diagram.players[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayer = diagram.players.find((player) => player.id === selectedPlayerId) ?? diagram.players[0] ?? null;
  const usedByAthlete = useMemo(() => {
    const map = new Map<string, string>();
    for (const [playerId, athleteId] of Object.entries(assignments)) {
      if (athleteId) map.set(athleteId, playerId);
    }
    return map;
  }, [assignments]);
  const rosterByAthlete = useMemo(() => new Map(roster.map((row) => [row.athlete.id, row])), [roster]);
  const needle = search.trim().toLowerCase();
  const filteredRoster = roster.filter((row) => {
    if (!needle) return true;
    return [rosterName(row), row.membership.jersey_number, row.membership.primary_position, row.membership.secondary_position]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(
        diagram.players.flatMap((player) => {
          const athleteId = assignments[player.id];
          return athleteId ? [{ player_id: player.id, athlete_id: athleteId }] : [];
        }),
      );
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save personnel.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Manage play personnel">
      <button type="button" className="absolute inset-0 cursor-default" onClick={saving ? undefined : onClose} aria-label="Close personnel editor" />
      <section className="relative z-10 flex max-h-[86dvh] w-full max-w-[780px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-base font-extrabold">Personnel</div>
            <div className="mt-0.5 text-[11px] text-text-muted">Map team athletes to this play’s football positions.</div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-40" aria-label="Close"><X size={17} /></button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[250px_minmax(0,1fr)]">
          <div className="border-b border-border p-3 md:border-b-0 md:border-r">
            <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-text-muted">Positions</div>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-1">
              {diagram.players.map((player) => {
                const primary = isPrimaryPlayer(diagram, player.id);
                const athleteId = assignments[player.id];
                const row = athleteId ? rosterByAthlete.get(athleteId) : null;
                const active = selectedPlayer?.id === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`flex min-h-12 items-center gap-2.5 rounded-lg border px-2.5 text-left transition-colors ${active ? "border-text-muted bg-surface-elevated" : "border-border bg-background hover:bg-surface-elevated"}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black" style={{ backgroundColor: playerColor(player, primary), color: playerTextColor(primary) }}>{player.label}</span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-extrabold text-text-primary">{player.label}</span>
                      <span className="block truncate text-[9px] text-text-muted">{row ? rosterName(row) : "Unassigned"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
            {selectedPlayer ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold">Assign {selectedPlayer.label}</div>
                    <div className="mt-0.5 text-[10px] text-text-muted">Each athlete can fill one position in this play.</div>
                  </div>
                  {assignments[selectedPlayer.id] && (
                    <button type="button" onClick={() => setAssignments((current) => ({ ...current, [selectedPlayer.id]: "" }))} className="text-[10px] font-bold text-text-muted underline decoration-border underline-offset-4 hover:text-text-primary">Clear</button>
                  )}
                </div>

                <label className="relative mt-3 block">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roster" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
                </label>

                <div className="mt-3 space-y-1.5">
                  {filteredRoster.map((row) => {
                    const athleteId = row.athlete.id;
                    const assignedPlayerId = usedByAthlete.get(athleteId);
                    const assignedElsewhere = Boolean(assignedPlayerId && assignedPlayerId !== selectedPlayer.id);
                    const selected = assignments[selectedPlayer.id] === athleteId;
                    const assignedRole = diagram.players.find((player) => player.id === assignedPlayerId)?.label;
                    return (
                      <button
                        key={athleteId}
                        type="button"
                        disabled={assignedElsewhere}
                        onClick={() => setAssignments((current) => ({ ...current, [selectedPlayer.id]: athleteId }))}
                        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left transition-colors ${selected ? "border-accent bg-[rgba(124,58,237,0.1)]" : "border-border bg-background hover:bg-surface-elevated"} disabled:cursor-not-allowed disabled:opacity-45`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-text-primary">{rosterName(row)}</span>
                          <span className="mt-0.5 block truncate text-[9px] text-text-muted">
                            {[row.membership.jersey_number ? `#${row.membership.jersey_number}` : null, row.membership.primary_position].filter(Boolean).join(" · ") || "Roster athlete"}
                          </span>
                        </span>
                        {selected ? <Check size={16} className="shrink-0 text-accent" /> : assignedElsewhere ? <span className="shrink-0 text-[9px] font-bold text-text-muted">{assignedRole}</span> : null}
                      </button>
                    );
                  })}
                  {!filteredRoster.length && <div className="py-6 text-center text-xs text-text-muted">No roster athletes match that search.</div>}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-text-muted">This play has no positions to map.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div className="min-w-0 text-[10px] text-text-muted">{error ?? `${Object.values(assignments).filter(Boolean).length} of ${diagram.players.length} positions assigned`}</div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save Personnel"}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PlayViewer({ play, onBack, onEdit, onMoveToEditor }: Props) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [personnel, setPersonnel] = useState<PlayPersonnelAssignment[]>([]);
  const [personnelStatus, setPersonnelStatus] = useState<PersonnelStatus>("loading");
  const [labelMode, setLabelMode] = useState<LabelMode>("positions");
  const [personnelEditorOpen, setPersonnelEditorOpen] = useState(false);
  const progressRef = useRef(0);
  const hasMotion = play.diagram.assignments.some((assignment) => assignment.kind === "motion");
  const personnelByPlayer = useMemo(
    () => new Map(personnel.map((assignment) => [assignment.player_id, assignment])),
    [personnel],
  );
  const hasPersonnel = personnel.length > 0;

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now() - progressRef.current * PLAY_DURATION_MS;
    let frame = 0;

    const tick = (now: number) => {
      const next = clamp01((now - startedAt) / PLAY_DURATION_MS);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, runId]);

  useEffect(() => {
    let cancelled = false;
    setRoster([]);
    setPersonnel([]);
    setPersonnelStatus("loading");
    setLabelMode("positions");
    setPersonnelEditorOpen(false);

    void Promise.all([getRoster(play.team_id), getPlayPersonnel(play.team_id, play.id)])
      .then(([nextRoster, nextPersonnel]) => {
        if (cancelled) return;
        setRoster(nextRoster);
        setPersonnel(nextPersonnel.filter((assignment) => play.diagram.players.some((player) => player.id === assignment.player_id)));
        setPersonnelStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setPersonnelStatus("unavailable");
      });

    return () => { cancelled = true; };
  }, [play.id, play.team_id, play.diagram]);

  const replay = () => {
    progressRef.current = 0;
    setProgress(0);
    setRunId((value) => value + 1);
    setPlaying(true);
  };

  const togglePlayback = () => {
    if (progress >= 1) {
      replay();
      return;
    }
    setPlaying((value) => !value);
  };

  const savePersonnel = async (assignments: PlayPersonnelInput[]) => {
    const next = await replacePlayPersonnel(play.team_id, play.id, assignments);
    setPersonnel(next.filter((assignment) => play.diagram.players.some((player) => player.id === assignment.player_id)));
    setPersonnelStatus("ready");
    if (next.length) setLabelMode("players");
  };

  const metadata = useMemo(() => [
    play.formation || (play.side === "offense" ? "Offense" : "Defense"),
    play.play_type.charAt(0).toUpperCase() + play.play_type.slice(1),
    play.concept || null,
    play.situation === "any" ? null : SITUATION_LABELS[play.situation],
  ].filter((value): value is string => Boolean(value)), [play]);

  const phaseLabel = progress >= 1
    ? "Complete"
    : !playing && progress > 0
      ? "Paused"
      : progress === 0
        ? "Ready"
        : progress < SNAP_HOLD_FRACTION
          ? "Set"
          : hasMotion && ((progress - SNAP_HOLD_FRACTION) / (1 - SNAP_HOLD_FRACTION)) < MOTION_PHASE
            ? "Motion"
            : "Routes";

  return (
    <section className="mx-auto max-w-[1080px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted transition-colors hover:text-text-primary">
          <ArrowLeft size={16} />Playbook
        </button>
        <div className="flex items-center gap-2">
          {onMoveToEditor && <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={onMoveToEditor}><Undo2 size={15} />Move to Editor</Button>}
          {onEdit && <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={onEdit}><Pencil size={15} />Edit</Button>}
        </div>
      </div>

      <header className="mt-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.11em] text-text-muted">{play.active_play ? "Editor" : "Library"}</div>
            <h1 className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.035em] md:text-[31px]">{play.name}</h1>
          </div>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[10px] font-semibold text-text-muted">
            {metadata.map((item, index) => (
              <span key={`${item}-${index}`} className="whitespace-nowrap">{index > 0 && <span className="mr-3 text-border">·</span>}{item}</span>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0">
          <div className="aspect-[5/4] max-h-[650px] overflow-hidden rounded-lg border border-border bg-background p-1">
            <AnimatedField diagram={play.diagram} progress={progress} personnel={personnel} labelMode={labelMode} />
          </div>

          <div className="mt-3 flex items-center gap-3 border-b border-border pb-3">
            <Button className="min-w-[112px]" onClick={togglePlayback}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Pause" : progress > 0 && progress < 1 ? "Resume" : "Run Play"}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">{phaseLabel}</div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full bg-accent transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            <button type="button" onClick={replay} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface hover:text-text-primary" aria-label="Replay play" title="Replay">
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        <aside className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-muted">Play details</div>
          <dl className="mt-3 divide-y divide-border text-xs">
            <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0"><dt className="text-text-muted">Formation</dt><dd className="text-right font-bold text-text-primary">{play.formation || "Custom"}</dd></div>
            <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-text-muted">Type</dt><dd className="text-right font-bold capitalize text-text-primary">{play.play_type}</dd></div>
            {play.concept && <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-text-muted">Concept</dt><dd className="text-right font-bold text-text-primary">{play.concept}</dd></div>}
            <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-text-muted">Situation</dt><dd className="text-right font-bold text-text-primary">{SITUATION_LABELS[play.situation]}</dd></div>
          </dl>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-text-muted"><Users size={12} />Personnel</div>
              {play.active_play && personnelStatus === "ready" && (
                <button type="button" onClick={() => setPersonnelEditorOpen(true)} className="text-[10px] font-bold text-text-muted underline decoration-border underline-offset-4 hover:text-text-primary">Manage</button>
              )}
            </div>

            {personnelStatus === "loading" ? (
              <div className="mt-3 text-[10px] text-text-muted">Loading roster…</div>
            ) : personnelStatus === "unavailable" ? (
              <div className="mt-3 text-[10px] leading-4 text-text-muted">Personnel mapping is unavailable until the team database is updated.</div>
            ) : (
              <>
                <div className="mt-3 inline-grid grid-cols-2 rounded-md border border-border bg-background p-0.5 text-[9px] font-bold">
                  <button type="button" onClick={() => setLabelMode("positions")} className={`min-h-7 rounded-[4px] px-2.5 ${labelMode === "positions" ? "bg-surface-elevated text-text-primary" : "text-text-muted"}`}>Positions</button>
                  <button type="button" disabled={!hasPersonnel} onClick={() => setLabelMode("players")} className={`min-h-7 rounded-[4px] px-2.5 ${labelMode === "players" ? "bg-surface-elevated text-text-primary" : "text-text-muted"} disabled:opacity-35`}>Players</button>
                </div>

                <div className="mt-3 space-y-2">
                  {play.diagram.players.map((player) => {
                    const assignment = personnelByPlayer.get(player.id);
                    const primary = isPrimaryPlayer(play.diagram, player.id);
                    return (
                      <div key={player.id} className="flex min-w-0 items-center gap-2 text-[10px]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-black" style={{ backgroundColor: playerColor(player, primary), color: playerTextColor(primary) }}>{player.label}</span>
                        <span className={`min-w-0 truncate ${assignment ? "font-semibold text-text-secondary" : "text-text-muted"}`}>{assignment ? athleteName(assignment) : "Unassigned"}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {play.notes && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-muted">Coaching notes</div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{play.notes}</p>
            </div>
          )}

          {!play.active_play && (
            <div className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-text-muted">
              Library plays are view-only. Move this play to Editor before changing the diagram, assignments, or personnel.
            </div>
          )}
        </aside>
      </div>

      {personnelEditorOpen && (
        <PersonnelEditor
          diagram={play.diagram}
          roster={roster}
          personnel={personnel}
          onClose={() => setPersonnelEditorOpen(false)}
          onSave={savePersonnel}
        />
      )}
    </section>
  );
}
