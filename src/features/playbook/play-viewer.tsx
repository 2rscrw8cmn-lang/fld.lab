import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Pencil, Play, RotateCcw, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlaySituation, PlayType } from "@/lib/playbook-api";
import type { DiagramAssignment, DiagramPlayer, PlayDiagram, Point } from "@/features/playbook/playbook-model";

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
  onMoveToActive?: () => void;
};

const PLAY_DURATION_MS = 3600;
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
    if (progress <= MOTION_PHASE) {
      return pointAlongPolyline(motion.points, progress / MOTION_PHASE);
    }

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
      <rect x="3" y="3" width="94" height="94" rx="2" fill="none" className="stroke-border" strokeWidth="0.65" opacity="0.72" />
      {guides.map((guide) => (
        <g key={guide.y}>
          <line x1="3" y1={guide.y} x2="97" y2={guide.y} className="stroke-border" strokeWidth="0.42" opacity="0.5" />
          <text x="5" y={guide.y - 1.4} className="fill-text-muted text-[2.2px] font-bold" opacity="0.72">{guide.label}</text>
        </g>
      ))}
      <line x1="3" y1="55" x2="97" y2="55" className="stroke-text-muted" strokeWidth="0.45" strokeDasharray="2 2" opacity="0.45" />
      <text x="95" y="53.3" textAnchor="end" className="fill-text-muted text-[2.15px] font-bold" opacity="0.72">7YD RUSH</text>
      <line x1="3" y1="76" x2="97" y2="76" className="stroke-text-secondary" strokeWidth="0.8" opacity="0.8" />
      <text x="5" y="74" className="fill-text-muted text-[2.35px] font-bold">LOS</text>
    </>
  );
}

function AnimatedField({ diagram, progress }: { diagram: PlayDiagram; progress: number }) {
  const hasMotion = diagram.assignments.some((assignment) => assignment.kind === "motion");
  const routeProgress = hasMotion ? clamp01((progress - MOTION_PHASE) / (1 - MOTION_PHASE)) : progress;
  const motionProgress = hasMotion ? clamp01(progress / MOTION_PHASE) : 1;

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Animated play diagram">
      <FieldLines />
      <defs>
        <marker id="viewer-route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.1" markerHeight="3.1" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-text-secondary" />
        </marker>
        <marker id="viewer-motion-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.8" markerHeight="2.8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-text-muted" />
        </marker>
      </defs>

      {diagram.assignments.map((assignment) => {
        const assignmentProgress = assignment.kind === "motion" ? motionProgress : routeProgress;
        return (
          <g key={assignment.id}>
            <polyline
              points={polylinePoints(assignment.points)}
              fill="none"
              className={assignment.kind === "route" ? "stroke-text-secondary" : "stroke-text-muted"}
              strokeWidth={assignment.kind === "route" ? 0.78 : 0.62}
              strokeDasharray={assignment.kind === "motion" ? "2.4 2" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.22"
              markerEnd={`url(#viewer-${assignment.kind}-arrow)`}
            />
            <polyline
              points={polylinePoints(assignment.points)}
              fill="none"
              className={assignment.kind === "route" ? "stroke-text-primary" : "stroke-text-muted"}
              strokeWidth={assignment.kind === "route" ? 0.92 : 0.72}
              strokeDasharray="1"
              strokeDashoffset={1 - assignmentProgress}
              pathLength="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={assignmentProgress > 0 ? 0.92 : 0}
            />
          </g>
        );
      })}

      {diagram.players.map((player) => {
        const point = animatedPlayerPoint(player, diagram, progress, hasMotion);
        const primary = diagram.primary_target_player_id === player.id;
        return (
          <g key={player.id}>
            {primary && <circle cx={point.x} cy={point.y} r="6.1" fill="none" className="stroke-accent" strokeWidth="0.85" opacity="0.78" />}
            <circle cx={point.x} cy={point.y} r="4" className="fill-surface stroke-text-primary" strokeWidth="0.9" />
            <text x={point.x} y={point.y + 1.1} textAnchor="middle" className="fill-text-primary text-[3px] font-black">{player.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PlayViewer({ play, onBack, onEdit, onMoveToActive }: Props) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const progressRef = useRef(0);

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

  return (
    <section className="mx-auto max-w-[1180px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary">
          <ArrowLeft size={16} />Playbook
        </button>
        <div className="flex items-center gap-2">
          {onMoveToActive && <Button variant="secondary" onClick={onMoveToActive}><Undo2 size={15} />Move to Active</Button>}
          {onEdit && <Button variant="secondary" onClick={onEdit}><Pencil size={15} />Edit</Button>}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">{play.active_play ? "Active play" : "Library"}</div>
        <h1 className="mt-1 text-[26px] font-extrabold leading-none tracking-[-0.035em] md:text-[32px]">{play.name}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {metadata.map((item) => (
            <span key={item} className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-bold text-text-muted">{item}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="relative aspect-[5/4] max-h-[720px] overflow-hidden rounded-xl border border-border bg-background">
            <AnimatedField diagram={play.diagram} progress={progress} />
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-surface/95 p-1.5 shadow-xl backdrop-blur">
              <Button className="min-w-[112px]" onClick={togglePlayback}>
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {playing ? "Pause" : progress > 0 && progress < 1 ? "Resume" : "Run Play"}
              </Button>
              <button type="button" onClick={replay} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-elevated hover:text-text-primary" aria-label="Replay play" title="Replay">
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full bg-accent transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm font-extrabold">Play</div>
            <dl className="mt-3 grid gap-3 text-xs">
              <div><dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Formation</dt><dd className="mt-1 font-bold text-text-primary">{play.formation || "Custom"}</dd></div>
              <div><dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Type</dt><dd className="mt-1 font-bold capitalize text-text-primary">{play.play_type}</dd></div>
              {play.concept && <div><dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Concept</dt><dd className="mt-1 font-bold text-text-primary">{play.concept}</dd></div>}
              <div><dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Situation</dt><dd className="mt-1 font-bold text-text-primary">{SITUATION_LABELS[play.situation]}</dd></div>
            </dl>
          </section>

          {play.notes && (
            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm font-extrabold">Coaching notes</div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{play.notes}</p>
            </section>
          )}

          {!play.active_play && (
            <section className="rounded-xl border border-border bg-surface p-4 text-xs leading-5 text-text-muted">
              Library plays are view-only here. Move the play back to Active before changing its diagram or assignments.
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
