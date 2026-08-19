import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Pencil, Play, RotateCcw, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlaySituation, PlayType } from "@/lib/playbook-api";
import type { DiagramAssignment, DiagramPlayer, PlayDiagram, Point } from "@/features/playbook/playbook-model";
import {
  isPrimaryPlayer,
  playerColor,
  playerForAssignment,
  playerTextColor,
} from "@/features/playbook/playbook-visuals";

export type PlayViewerPlay = {
  id: string;
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

function AnimatedField({ diagram, progress }: { diagram: PlayDiagram; progress: number }) {
  const hasMotion = diagram.assignments.some((assignment) => assignment.kind === "motion");
  const movementProgress = clamp01((progress - SNAP_HOLD_FRACTION) / (1 - SNAP_HOLD_FRACTION));
  const routeProgress = hasMotion ? clamp01((movementProgress - MOTION_PHASE) / (1 - MOTION_PHASE)) : movementProgress;
  const motionProgress = hasMotion ? clamp01(movementProgress / MOTION_PHASE) : 1;

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
        return (
          <g key={player.id}>
            <circle cx={point.x} cy={point.y} r="3.75" fill={color} className="stroke-background" strokeWidth="0.9" />
            <text x={point.x} y={point.y + 1.02} textAnchor="middle" fill={playerTextColor(primary)} className="text-[2.75px] font-black">{player.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PlayViewer({ play, onBack, onEdit, onMoveToEditor }: Props) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const progressRef = useRef(0);
  const hasMotion = play.diagram.assignments.some((assignment) => assignment.kind === "motion");

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
            <AnimatedField diagram={play.diagram} progress={progress} />
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

          {play.notes && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-muted">Coaching notes</div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{play.notes}</p>
            </div>
          )}

          {!play.active_play && (
            <div className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-text-muted">
              Library plays are view-only. Move this play to Editor before changing the diagram or assignments.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
