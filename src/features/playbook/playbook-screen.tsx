import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  ClipboardList,
  Copy,
  Eraser,
  FilePlus2,
  FlipHorizontal2,
  MoveRight,
  Plus,
  Redo2,
  Route,
  Save,
  Target,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlaybookGameDay } from "@/features/playbook/playbook-gameday";
import { PlayViewer } from "@/features/playbook/play-viewer";
import {
  isPrimaryPlayer,
  playerColor,
  playerForAssignment,
  playerTextColor,
} from "@/features/playbook/playbook-visuals";
import type { Team } from "@/lib/api";
import {
  createTeamPlay,
  listTeamPlays,
  updateTeamPlay,
  type PlaySituation,
  type PlayType,
} from "@/lib/playbook-api";
import {
  FORMATIONS,
  LOS_Y,
  ROUTE_TEMPLATES,
  buildMotionPoints,
  buildRoutePoints,
  constrainPlayerPoint,
  createFormationPlayers,
  flipDiagram,
  formationById,
  formationsForSide,
  mirroredFormationId,
  replacePlayerMotion,
  replacePlayerRoute,
  shiftAssignment,
  type DiagramAssignment,
  type DiagramPlayer,
  type FormationPreset,
  type PlayDiagram,
  type PlaySide,
  type Point,
  type RouteTemplate,
} from "@/features/playbook/playbook-model";

type Play = {
  id: string;
  team_id: string;
  name: string;
  side: PlaySide;
  formation_id: string | null;
  formation: string;
  play_type: PlayType;
  concept: string;
  situation: PlaySituation;
  active_play: boolean;
  notes: string;
  diagram: PlayDiagram;
  created_at: string;
  updated_at: string;
};

type Filter = "all" | PlaySide;
type LibraryView = "editor" | "library";
type PersistenceMode = "loading" | "database" | "local";
type EditorSnapshot = Pick<Play, "side" | "formation_id" | "formation" | "diagram">;
type DragState =
  | { kind: "player"; id: string }
  | { kind: "assignment"; id: string; pointIndex: number }
  | null;

const PLAY_TYPES: Array<{ value: PlayType; label: string }> = [
  { value: "pass", label: "Pass" },
  { value: "run", label: "Run" },
  { value: "option", label: "Option" },
];

const SITUATIONS: Array<{ value: PlaySituation; label: string }> = [
  { value: "any", label: "Any" },
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "deep", label: "Deep" },
  { value: "no-run", label: "No-run" },
  { value: "goal-line", label: "Goal line" },
  { value: "conversion", label: "Conversion" },
];

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const clamp = (value: number) => Math.max(5, Math.min(95, value));

function storageKey(teamId: string) {
  return `fld-lab:playbook:${teamId}`;
}

function diagramForFormation(formationId: string): PlayDiagram {
  return {
    schema_version: 2,
    players: createFormationPlayers(formationId, id),
    assignments: [],
    primary_target_player_id: null,
  };
}

function newPlay(teamId: string, formationId = "spread"): Play {
  const timestamp = new Date().toISOString();
  const formation = formationById(formationId) ?? FORMATIONS[0];
  return {
    id: id("play"),
    team_id: teamId,
    name: "New Play",
    side: formation.side,
    formation_id: formation.id,
    formation: formation.name,
    play_type: "pass",
    concept: "",
    situation: "any",
    active_play: true,
    notes: "",
    diagram: diagramForFormation(formation.id),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function normalizeDiagram(value: unknown): PlayDiagram | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const players = Array.isArray(raw.players)
    ? raw.players.filter((candidate): candidate is DiagramPlayer => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
      const player = candidate as Partial<DiagramPlayer>;
      return typeof player.id === "string" && typeof player.label === "string" && typeof player.x === "number" && typeof player.y === "number";
    }).map((player) => ({ ...player, x: clamp(player.x), y: clamp(player.y) }))
    : [];
  if (!players.length) return null;

  const playerIds = new Set(players.map((player) => player.id));
  const rawAssignments = Array.isArray(raw.assignments)
    ? raw.assignments
    : Array.isArray(raw.paths)
      ? raw.paths
      : [];

  const assignments = rawAssignments.flatMap((candidate): DiagramAssignment[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const assignment = candidate as Record<string, unknown>;
    const playerId = typeof assignment.player_id === "string" ? assignment.player_id : "";
    const kind = assignment.kind === "route" || assignment.kind === "motion" ? assignment.kind : null;
    const points = Array.isArray(assignment.points)
      ? assignment.points.flatMap((pointValue): Point[] => {
        if (!pointValue || typeof pointValue !== "object" || Array.isArray(pointValue)) return [];
        const candidatePoint = pointValue as Record<string, unknown>;
        return typeof candidatePoint.x === "number" && typeof candidatePoint.y === "number"
          ? [{ x: clamp(candidatePoint.x), y: clamp(candidatePoint.y) }]
          : [];
      })
      : [];
    const template = ROUTE_TEMPLATES.some((route) => route.id === assignment.template)
      ? assignment.template as RouteTemplate
      : undefined;
    if (!playerIds.has(playerId) || !kind || points.length < 2) return [];
    return [{
      id: typeof assignment.id === "string" ? assignment.id : id("assignment"),
      player_id: playerId,
      kind,
      ...(template ? { template } : {}),
      points,
    }];
  });

  const primary = typeof raw.primary_target_player_id === "string" && playerIds.has(raw.primary_target_player_id)
    ? raw.primary_target_player_id
    : null;

  return {
    schema_version: 2,
    players,
    assignments,
    primary_target_player_id: primary,
  };
}

function normalizePlay(value: unknown, teamId: string): Play | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.team_id !== teamId || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const diagram = normalizeDiagram(raw.diagram);
  if (!diagram) return null;
  const side: PlaySide = raw.side === "defense" ? "defense" : "offense";
  const formationText = typeof raw.formation === "string" ? raw.formation : "";
  const storedFormationId = typeof raw.formation_id === "string" ? raw.formation_id : null;
  const inferred = FORMATIONS.find((formation) => formation.side === side && formation.name.toLowerCase() === formationText.toLowerCase()) ?? null;
  const formationId = formationById(storedFormationId)?.side === side ? storedFormationId : inferred?.id ?? null;
  const playType: PlayType = raw.play_type === "run" || raw.play_type === "option" ? raw.play_type : "pass";
  const situation: PlaySituation = SITUATIONS.some((option) => option.value === raw.situation)
    ? raw.situation as PlaySituation
    : "any";
  const timestamp = new Date().toISOString();
  return {
    id: raw.id,
    team_id: teamId,
    name: raw.name,
    side,
    formation_id: formationId,
    formation: formationText || formationById(formationId)?.name || (side === "offense" ? "Custom" : "Defense"),
    play_type: playType,
    concept: typeof raw.concept === "string" ? raw.concept : "",
    situation,
    active_play: typeof raw.active_play === "boolean" ? raw.active_play : true,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    diagram,
    created_at: typeof raw.created_at === "string" ? raw.created_at : timestamp,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : timestamp,
  };
}

function parseStoredPlays(teamId: string): Play[] {
  try {
    const raw = window.localStorage.getItem(storageKey(teamId));
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      const play = normalizePlay(candidate, teamId);
      return play ? [play] : [];
    });
  } catch {
    return [];
  }
}

function cachePlays(teamId: string, plays: Play[]) {
  window.localStorage.setItem(storageKey(teamId), JSON.stringify(plays));
}

function playInput(play: Play) {
  return {
    name: play.name.trim() || "Untitled Play",
    side: play.side,
    formation_id: play.formation_id,
    formation: play.formation.trim(),
    play_type: play.play_type,
    concept: play.concept.trim(),
    situation: play.situation,
    active_play: play.active_play,
    notes: play.notes.trim(),
    diagram: play.diagram,
  };
}

async function reconcileDatabasePlays(teamId: string): Promise<Play[]> {
  const remoteValues = await listTeamPlays(teamId);
  const localPlays = parseStoredPlays(teamId);
  const remotePlays = remoteValues.flatMap((value) => {
    const play = normalizePlay(value, teamId);
    return play ? [play] : [];
  });
  const byId = new Map(remotePlays.map((play) => [play.id, play]));
  const reconciled = [...remotePlays];

  for (const localPlay of localPlays) {
    const remote = byId.get(localPlay.id);
    if (remote) {
      if (localPlay.updated_at > remote.updated_at) {
        const stored = await updateTeamPlay(teamId, remote.id, playInput(localPlay));
        const updated = normalizePlay(stored, teamId);
        if (updated) {
          const index = reconciled.findIndex((play) => play.id === remote.id);
          if (index >= 0) reconciled[index] = updated;
        }
      }
      continue;
    }

    const stored = await createTeamPlay(teamId, playInput(localPlay));
    const created = normalizePlay(stored, teamId);
    if (created) reconciled.push(created);
  }

  return reconciled;
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function situationLabel(value: PlaySituation) {
  return SITUATIONS.find((option) => option.value === value)?.label ?? "Any";
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
        </g>
      ))}
      <line x1="3" y1="55" x2="97" y2="55" className="stroke-text-muted" strokeWidth="0.36" strokeDasharray="1.8 1.8" opacity="0.4" />
      <text x="95" y="53.3" textAnchor="end" className="fill-text-muted text-[2px] font-bold" opacity="0.62">7YD RUSH</text>
      <line x1="3" y1={LOS_Y} x2="97" y2={LOS_Y} className="stroke-text-secondary" strokeWidth="0.68" opacity="0.78" />
      <text x="5" y={LOS_Y - 1.9} className="fill-text-muted text-[2.15px] font-bold">LOS</text>
    </>
  );
}

function AssignmentLines({
  diagram,
  markerPrefix,
  compact = false,
  selectedAssignmentId = null,
  onAssignmentSelect,
}: {
  diagram: PlayDiagram;
  markerPrefix: string;
  compact?: boolean;
  selectedAssignmentId?: string | null;
  onAssignmentSelect?: (event: ReactPointerEvent<SVGPolylineElement>, assignment: DiagramAssignment) => void;
}) {
  return (
    <>
      <defs>
        {diagram.assignments.map((assignment) => {
          const player = playerForAssignment(diagram, assignment.player_id);
          const primary = player ? isPrimaryPlayer(diagram, player.id) : false;
          const color = player ? playerColor(player, primary) : "var(--text-secondary)";
          const selected = assignment.id === selectedAssignmentId;
          const markerSize = compact ? 3.25 : selected ? 4.3 : assignment.kind === "route" ? 4.05 : 3.45;
          return (
            <marker key={assignment.id} id={`${markerPrefix}-${assignment.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth={markerSize} markerHeight={markerSize} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          );
        })}
      </defs>
      {diagram.assignments.map((assignment) => {
        const selected = assignment.id === selectedAssignmentId;
        const isRoute = assignment.kind === "route";
        const player = playerForAssignment(diagram, assignment.player_id);
        const primary = player ? isPrimaryPlayer(diagram, player.id) : false;
        const color = player ? playerColor(player, primary) : "var(--text-secondary)";
        return (
          <polyline
            key={assignment.id}
            points={polylinePoints(assignment.points)}
            fill="none"
            markerEnd={`url(#${markerPrefix}-${assignment.id})`}
            stroke={color}
            strokeWidth={compact ? (isRoute ? 0.68 : 0.5) : selected ? 1.05 : isRoute ? 0.8 : 0.6}
            strokeDasharray={assignment.kind === "motion" ? "2.3 1.9" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={selected ? 1 : isRoute ? 0.78 : 0.58}
            pointerEvents={onAssignmentSelect ? "stroke" : undefined}
            className={onAssignmentSelect ? "cursor-pointer" : undefined}
            onPointerDown={onAssignmentSelect ? (event) => onAssignmentSelect(event, assignment) : undefined}
          />
        );
      })}
    </>
  );
}

function FieldDiagram({
  diagram,
  compact = false,
  markerPrefix = "play",
  showLabels = false,
}: {
  diagram: PlayDiagram;
  compact?: boolean;
  markerPrefix?: string;
  showLabels?: boolean;
}) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden={true}>
      <FieldLines />
      <AssignmentLines diagram={diagram} compact={compact} markerPrefix={markerPrefix} />
      {diagram.players.map((player) => {
        const primary = isPrimaryPlayer(diagram, player.id);
        const color = playerColor(player, primary);
        const radius = compact ? 3.15 : 3.85;
        return (
          <g key={player.id}>
            <circle cx={player.x} cy={player.y} r={radius} fill={color} className="stroke-background" strokeWidth={compact ? 0.72 : 0.86} />
            {(!compact || showLabels) && (
              <text x={player.x} y={player.y + (compact ? 0.88 : 1.02)} textAnchor="middle" fill={playerTextColor(primary)} className={`${compact ? "text-[2.25px]" : "text-[2.8px]"} font-black`}>{player.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function FormationPreview({ formation }: { formation: FormationPreset }) {
  const diagram: PlayDiagram = {
    schema_version: 2,
    players: formation.players.map((player, index) => ({ ...player, id: `preview-${formation.id}-${index}` })),
    assignments: [],
    primary_target_player_id: null,
  };
  return <FieldDiagram diagram={diagram} compact markerPrefix={`formation-${formation.id}`} />;
}

function PlayCard({
  play,
  onOpen,
  onMoveToLibrary,
}: {
  play: Play;
  onOpen: () => void;
  onMoveToLibrary?: () => void;
}) {
  const details = [
    play.play_type.charAt(0).toUpperCase() + play.play_type.slice(1),
    play.concept || null,
    play.situation !== "any" ? situationLabel(play.situation) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-text-muted hover:bg-surface-elevated">
      <button type="button" onClick={onOpen} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
        <div className="aspect-[4/3] bg-background p-3">
          <FieldDiagram diagram={play.diagram} compact showLabels markerPrefix={`card-${play.id}`} />
        </div>
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-extrabold text-text-primary">{play.name}</div>
              <div className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-text-muted">{play.formation || (play.side === "offense" ? "Offense" : "Defense")}</div>
            </div>
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.08em] text-text-muted">{play.side}</span>
          </div>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[9px] text-text-muted">
            <span className="truncate">{details.join(" · ") || "Uncategorized"}</span>
            <span className="shrink-0 tabular-nums opacity-70">{formatUpdated(play.updated_at)}</span>
          </div>
        </div>
      </button>
      {onMoveToLibrary && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-background/45 px-3 py-2">
          <span className="text-[8px] font-black uppercase tracking-[0.08em] text-text-muted">Editor</span>
          <button
            type="button"
            onClick={onMoveToLibrary}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-1 text-[9px] font-extrabold text-[#c4b5fd] transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Move to Library <ArrowRight size={12} />
          </button>
        </div>
      )}
    </article>
  );
}

function SegmentedFilter({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div className="inline-grid grid-cols-3 rounded-md border border-border bg-background p-0.5 text-[10px] font-bold">
      {(["all", "offense", "defense"] as Filter[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-h-8 rounded-[5px] px-3 capitalize transition-colors ${value === option ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function FormationPicker({
  side,
  onSideChange,
  onSelect,
  onClose,
  title = "Choose a formation",
}: {
  side: PlaySide;
  onSideChange: (side: PlaySide) => void;
  onSelect: (formation: FormationPreset) => void;
  onClose: () => void;
  title?: string;
}) {
  const formations = formationsForSide(side);
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close formation picker" onClick={onClose} />
      <section className="relative z-10 max-h-[min(780px,88dvh)] w-full max-w-[760px] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <div>
            <h2 className="text-base font-extrabold">{title}</h2>
            <p className="mt-0.5 text-[11px] text-text-muted">Start structured. You can move players after.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-text-muted hover:bg-surface-elevated hover:text-text-primary" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-3 sm:p-4">
          <div className="mb-3 inline-grid grid-cols-2 rounded-md border border-border bg-background p-0.5 text-xs font-bold">
            {(["offense", "defense"] as PlaySide[]).map((option) => (
              <button key={option} type="button" onClick={() => onSideChange(option)} className={`min-h-9 rounded-[5px] px-4 capitalize ${side === option ? "bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "text-text-muted"}`}>{option}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {formations.map((formation) => (
              <button key={formation.id} type="button" onClick={() => onSelect(formation)} className="overflow-hidden rounded-lg border border-border bg-background text-left transition-colors hover:border-text-muted hover:bg-surface-elevated">
                <div className="aspect-[4/3] p-3"><FormationPreview formation={formation} /></div>
                <div className="border-t border-border px-3 py-2 text-xs font-extrabold">{formation.name}</div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function PlaybookScreen({ team }: { team: Team | null }) {
  const [plays, setPlays] = useState<Play[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<LibraryView>("editor");
  const [viewer, setViewer] = useState<Play | null>(null);
  const [draft, setDraft] = useState<Play | null>(null);
  const [gameDayOpen, setGameDayOpen] = useState(false);
  const [newPlayPickerOpen, setNewPlayPickerOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<PlaySide>("offense");
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("loading");

  useEffect(() => {
    let cancelled = false;
    setViewer(null);
    setDraft(null);
    setGameDayOpen(false);
    setFilter("all");
    setView("editor");
    setNewPlayPickerOpen(false);
    setPersistenceMode("loading");

    if (!team) {
      setPlays([]);
      return () => { cancelled = true; };
    }

    const localPlays = parseStoredPlays(team.id);
    setPlays(localPlays);

    void reconcileDatabasePlays(team.id)
      .then((databasePlays) => {
        if (cancelled) return;
        setPlays(databasePlays);
        cachePlays(team.id, databasePlays);
        setPersistenceMode("database");
      })
      .catch(() => {
        if (cancelled) return;
        setPlays(parseStoredPlays(team.id));
        setPersistenceMode("local");
      });

    return () => { cancelled = true; };
  }, [team?.id]);

  const persistLocal = (next: Play[]) => {
    setPlays(next);
    if (team) cachePlays(team.id, next);
  };

  const savePlay = async (saved: Play) => {
    if (!team) return;
    const exists = plays.some((play) => play.id === saved.id);
    const localNext = exists
      ? plays.map((play) => play.id === saved.id ? saved : play)
      : [saved, ...plays];

    if (persistenceMode !== "database") {
      persistLocal(localNext);
      setPersistenceMode("local");
      setDraft(null);
      setView(saved.active_play ? "editor" : "library");
      return;
    }

    try {
      const stored = exists
        ? await updateTeamPlay(team.id, saved.id, playInput(saved))
        : await createTeamPlay(team.id, playInput(saved));
      const persisted = normalizePlay(stored, team.id);
      if (!persisted) throw new Error("Invalid play returned by API.");
      const next = exists
        ? plays.map((play) => play.id === saved.id ? persisted : play)
        : [persisted, ...plays];
      persistLocal(next);
      setDraft(null);
      setView(persisted.active_play ? "editor" : "library");
    } catch {
      persistLocal(localNext);
      setPersistenceMode("local");
      setDraft(null);
      setView(saved.active_play ? "editor" : "library");
    }
  };

  const movePlayToLibrary = async (play: Play) => {
    if (!team) return;
    const moved = { ...play, active_play: false, updated_at: new Date().toISOString() };
    const localNext = plays.map((candidate) => candidate.id === play.id ? moved : candidate);

    if (persistenceMode !== "database") {
      persistLocal(localNext);
      setPersistenceMode("local");
      return;
    }

    try {
      const stored = await updateTeamPlay(team.id, play.id, playInput(moved));
      const persisted = normalizePlay(stored, team.id);
      if (!persisted) throw new Error("Invalid play returned by API.");
      persistLocal(plays.map((candidate) => candidate.id === play.id ? persisted : candidate));
    } catch {
      persistLocal(localNext);
      setPersistenceMode("local");
    }
  };

  const duplicatePlay = async (copy: Play) => {
    if (!team) return;
    const localNext = [copy, ...plays.filter((play) => play.id !== copy.id)];

    if (persistenceMode !== "database") {
      persistLocal(localNext);
      setPersistenceMode("local");
      setDraft(copy);
      return;
    }

    try {
      const stored = await createTeamPlay(team.id, playInput(copy));
      const persisted = normalizePlay(stored, team.id);
      if (!persisted) throw new Error("Invalid play returned by API.");
      const next = [persisted, ...plays];
      persistLocal(next);
      setDraft(persisted);
    } catch {
      persistLocal(localNext);
      setPersistenceMode("local");
      setDraft(copy);
    }
  };

  const filtered = useMemo(
    () => plays
      .filter((play) => view === "editor" ? play.active_play : !play.active_play)
      .filter((play) => filter === "all" || play.side === filter)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [filter, plays, view],
  );

  const editorCount = plays.filter((play) => play.active_play).length;
  const libraryPlays = plays.filter((play) => !play.active_play);
  const libraryCount = libraryPlays.length;

  if (!team) {
    return <section className="p-6 text-sm text-text-muted">Create or select a team to build a playbook.</section>;
  }

  if (gameDayOpen) {
    return <PlaybookGameDay team={team} plays={libraryPlays} onBack={() => setGameDayOpen(false)} />;
  }

  if (viewer) {
    return (
      <PlayViewer
        key={`viewer-${viewer.id}`}
        play={viewer}
        onBack={() => setViewer(null)}
        onMoveToEditor={!viewer.active_play ? () => {
          const promoted = { ...structuredClone(viewer), active_play: true, updated_at: new Date().toISOString() };
          setViewer(null);
          void savePlay(promoted);
        } : undefined}
      />
    );
  }

  if (draft) {
    return (
      <PlayEditor
        key={draft.id}
        play={draft}
        onCancel={() => setDraft(null)}
        onSave={savePlay}
        onDuplicate={duplicatePlay}
      />
    );
  }

  return (
    <section className="mx-auto max-w-[1220px] px-3 pb-8 pt-[18px] sm:px-4 md:px-6 md:pt-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-[24px] font-extrabold leading-none tracking-[-0.035em] md:text-[30px]">Playbook</h1>
          <p className="mt-1.5 text-[12px] text-text-muted">Editor builds the football. Library assigns personnel and runs the play.</p>
        </div>
        <div className="flex items-center gap-2">
          {view === "library" && libraryCount > 0 && (
            <Button variant="secondary" onClick={() => setGameDayOpen(true)}><ClipboardList size={16} />Game Day</Button>
          )}
          <Button onClick={() => { setPickerSide("offense"); setNewPlayPickerOpen(true); }}><FilePlus2 size={16} />New Play</Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5 text-xs font-bold">
          <button type="button" onClick={() => setView("editor")} className={`relative min-h-9 px-0.5 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${view === "editor" ? "text-text-primary" : "text-text-muted hover:text-text-primary"}`}>
            Editor <span className="ml-1 text-[10px] text-text-muted">{editorCount}</span>
            {view === "editor" && <span className="absolute inset-x-0 -bottom-[7px] h-0.5 bg-accent" />}
          </button>
          <button type="button" onClick={() => setView("library")} className={`relative min-h-9 px-0.5 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${view === "library" ? "text-text-primary" : "text-text-muted hover:text-text-primary"}`}>
            Library <span className="ml-1 text-[10px] text-text-muted">{libraryCount}</span>
            {view === "library" && <span className="absolute inset-x-0 -bottom-[7px] h-0.5 bg-accent" />}
          </button>
        </div>
        <SegmentedFilter value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-5 flex min-h-[200px] flex-col items-center justify-center py-8 text-center">
          <Route size={24} className="text-text-muted" />
          <h2 className="mt-3 text-sm font-extrabold">{view === "editor" ? "No plays in Editor" : "Library is empty"}</h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-text-muted">
            {view === "editor" ? "New plays start here. Build the structure, then move finished plays to Library." : "Move a finished play here to assign personnel, view it cleanly, and run the animation."}
          </p>
          {view === "editor" && <Button className="mt-4" onClick={() => { setPickerSide("offense"); setNewPlayPickerOpen(true); }}><Plus size={16} />Create play</Button>}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(250px,290px))] justify-start gap-3">
          {filtered.map((play) => (
            <PlayCard
              key={play.id}
              play={play}
              onOpen={() => view === "editor" ? setDraft(structuredClone(play)) : setViewer(structuredClone(play))}
              onMoveToLibrary={view === "editor" ? () => void movePlayToLibrary(play) : undefined}
            />
          ))}
        </div>
      )}

      <div className="mt-5 text-[10px] leading-4 text-text-muted">
        {persistenceMode === "database"
          ? <span><span className="mr-1 text-success">●</span>Saved to team database</span>
          : persistenceMode === "local"
            ? <span title="Changes are cached on this device and will reconcile automatically when the team database reconnects."><span className="mr-1 text-warning">●</span>Saved locally — database unavailable</span>
            : <span>Loading team playbook…</span>}
      </div>

      {newPlayPickerOpen && (
        <FormationPicker
          side={pickerSide}
          onSideChange={setPickerSide}
          onClose={() => setNewPlayPickerOpen(false)}
          onSelect={(formation) => {
            setDraft(newPlay(team.id, formation.id));
            setNewPlayPickerOpen(false);
          }}
        />
      )}
    </section>
  );
}

function snapshot(play: Play): EditorSnapshot {
  return {
    side: play.side,
    formation_id: play.formation_id,
    formation: play.formation,
    diagram: structuredClone(play.diagram),
  };
}

function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function PlayEditor({
  play,
  onCancel,
  onSave,
  onDuplicate,
}: {
  play: Play;
  onCancel: () => void;
  onSave: (play: Play) => void;
  onDuplicate: (play: Play) => void;
}) {
  const [draft, setDraft] = useState<Play>(() => structuredClone(play));
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(draft.diagram.players[0]?.id ?? null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [formationPickerOpen, setFormationPickerOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<PlaySide>(draft.side);
  const dragStartRef = useRef<EditorSnapshot | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const selectedPlayer = draft.diagram.players.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedRoute = selectedPlayer
    ? draft.diagram.assignments.find((assignment) => assignment.player_id === selectedPlayer.id && assignment.kind === "route") ?? null
    : null;
  const selectedMotion = selectedPlayer
    ? draft.diagram.assignments.find((assignment) => assignment.player_id === selectedPlayer.id && assignment.kind === "motion") ?? null
    : null;
  const selectedAssignment = draft.diagram.assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement | SVGGElement | SVGCircleElement>): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  const pushPast = (entry: EditorSnapshot) => {
    setPast((current) => [...current.slice(-29), entry]);
    setFuture([]);
  };

  const commit = (updater: (current: Play) => Play) => {
    const before = snapshot(draft);
    const next = updater(structuredClone(draft));
    const after = snapshot(next);
    if (snapshotsEqual(before, after)) return;
    pushPast(before);
    setDraft(next);
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture((current) => [snapshot(draft), ...current].slice(0, 30));
    setPast((current) => current.slice(0, -1));
    setDraft((current) => ({ ...current, ...structuredClone(previous) }));
    setSelectedAssignmentId(null);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((current) => [...current.slice(-29), snapshot(draft)]);
    setFuture((current) => current.slice(1));
    setDraft((current) => ({ ...current, ...structuredClone(next) }));
    setSelectedAssignmentId(null);
  };

  const updatePlayerLabel = (playerId: string, label: string) => {
    setDraft((current) => ({
      ...current,
      diagram: {
        ...current.diagram,
        players: current.diagram.players.map((player) => player.id === playerId ? { ...player, label: label.slice(0, 4) } : player),
      },
    }));
  };

  const chooseRoute = (template: RouteTemplate) => {
    if (!selectedPlayer) return;
    if (selectedRoute?.template === template) {
      setSelectedAssignmentId(selectedRoute.id);
      return;
    }
    const assignmentId = id("assignment");
    commit((current) => ({
      ...current,
      diagram: replacePlayerRoute(current.diagram, selectedPlayer.id, template, () => assignmentId),
    }));
    setSelectedAssignmentId(assignmentId);
  };

  const toggleMotion = () => {
    if (!selectedPlayer) return;
    if (selectedMotion) {
      commit((current) => ({
        ...current,
        diagram: { ...current.diagram, assignments: current.diagram.assignments.filter((assignment) => assignment.id !== selectedMotion.id) },
      }));
      if (selectedAssignmentId === selectedMotion.id) setSelectedAssignmentId(null);
      return;
    }
    const assignmentId = id("assignment");
    commit((current) => ({ ...current, diagram: replacePlayerMotion(current.diagram, selectedPlayer.id, () => assignmentId) }));
    setSelectedAssignmentId(assignmentId);
  };

  const togglePrimaryTarget = () => {
    if (!selectedPlayer) return;
    commit((current) => ({
      ...current,
      diagram: {
        ...current.diagram,
        primary_target_player_id: current.diagram.primary_target_player_id === selectedPlayer.id ? null : selectedPlayer.id,
      },
    }));
  };

  const clearSelectedAssignments = () => {
    if (!selectedPlayer) return;
    commit((current) => ({
      ...current,
      diagram: {
        ...current.diagram,
        assignments: current.diagram.assignments.filter((assignment) => assignment.player_id !== selectedPlayer.id),
        primary_target_player_id: current.diagram.primary_target_player_id === selectedPlayer.id ? null : current.diagram.primary_target_player_id,
      },
    }));
    setSelectedAssignmentId(null);
  };

  const removeSelectedPlayer = () => {
    if (!selectedPlayer) return;
    commit((current) => ({
      ...current,
      diagram: {
        ...current.diagram,
        players: current.diagram.players.filter((player) => player.id !== selectedPlayer.id),
        assignments: current.diagram.assignments.filter((assignment) => assignment.player_id !== selectedPlayer.id),
        primary_target_player_id: current.diagram.primary_target_player_id === selectedPlayer.id ? null : current.diagram.primary_target_player_id,
      },
    }));
    setSelectedPlayerId(null);
    setSelectedAssignmentId(null);
  };

  const addPlayer = () => {
    const extraIndex = Math.max(0, draft.diagram.players.length - 5);
    const slots = [20, 35, 65, 80, 50];
    const player: DiagramPlayer = {
      id: id("player"),
      label: `P${draft.diagram.players.length + 1}`,
      x: slots[extraIndex % slots.length],
      y: draft.side === "offense" ? 88 : 66,
    };
    commit((current) => ({ ...current, diagram: { ...current.diagram, players: [...current.diagram.players, player] } }));
    setSelectedPlayerId(player.id);
    setSelectedAssignmentId(null);
  };

  const applyFormation = (formation: FormationPreset) => {
    commit((current) => ({
      ...current,
      side: formation.side,
      formation_id: formation.id,
      formation: formation.name,
      diagram: diagramForFormation(formation.id),
    }));
    setSelectedPlayerId(null);
    setSelectedAssignmentId(null);
    setFormationPickerOpen(false);
  };

  const flipCurrentPlay = () => {
    commit((current) => {
      const nextFormationId = mirroredFormationId(current.formation_id);
      return {
        ...current,
        formation_id: nextFormationId,
        formation: formationById(nextFormationId)?.name ?? current.formation,
        diagram: flipDiagram(current.diagram),
      };
    });
  };

  const duplicate = (flip: boolean) => {
    const timestamp = new Date().toISOString();
    const nextFormationId = flip ? mirroredFormationId(draft.formation_id) : draft.formation_id;
    onDuplicate({
      ...structuredClone(draft),
      id: id("play"),
      name: `${draft.name.trim() || "Untitled Play"} Copy`,
      formation_id: nextFormationId,
      formation: formationById(nextFormationId)?.name ?? draft.formation,
      diagram: flip ? flipDiagram(draft.diagram) : structuredClone(draft.diagram),
      created_at: timestamp,
      updated_at: timestamp,
    });
  };

  const handlePlayerPointerDown = (event: ReactPointerEvent<SVGGElement>, playerId: string) => {
    event.stopPropagation();
    setSelectedPlayerId(playerId);
    setSelectedAssignmentId(null);
    dragStartRef.current = snapshot(draft);
    setDragState({ kind: "player", id: playerId });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAssignmentSelect = (event: ReactPointerEvent<SVGPolylineElement>, assignment: DiagramAssignment) => {
    event.stopPropagation();
    setSelectedPlayerId(assignment.player_id);
    setSelectedAssignmentId(assignment.id);
  };

  const handleAssignmentPointPointerDown = (event: ReactPointerEvent<SVGCircleElement>, assignmentId: string, pointIndex: number) => {
    event.stopPropagation();
    const assignment = draft.diagram.assignments.find((candidate) => candidate.id === assignmentId);
    if (assignment) setSelectedPlayerId(assignment.player_id);
    setSelectedAssignmentId(assignmentId);
    dragStartRef.current = snapshot(draft);
    setDragState({ kind: "assignment", id: assignmentId, pointIndex });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const rawPoint = pointFromEvent(event);
    setDraft((current) => {
      if (dragState.kind === "player") {
        const player = current.diagram.players.find((candidate) => candidate.id === dragState.id);
        if (!player) return current;
        const nextPoint = constrainPlayerPoint(current.side, rawPoint);
        const dx = nextPoint.x - player.x;
        const dy = nextPoint.y - player.y;
        return {
          ...current,
          diagram: {
            ...current.diagram,
            players: current.diagram.players.map((candidate) => candidate.id === player.id ? { ...candidate, ...nextPoint } : candidate),
            assignments: current.diagram.assignments.map((assignment) => assignment.player_id === player.id ? shiftAssignment(assignment, dx, dy) : assignment),
          },
        };
      }

      const assignment = current.diagram.assignments.find((candidate) => candidate.id === dragState.id);
      if (!assignment) return current;
      const player = current.diagram.players.find((candidate) => candidate.id === assignment.player_id);
      if (!player) return current;
      const lastPointIndex = assignment.points.length - 1;
      const nextPoint = assignment.kind === "motion" ? constrainPlayerPoint(current.side, rawPoint) : rawPoint;
      let points: Point[];

      if (dragState.pointIndex === lastPointIndex) {
        points = assignment.kind === "motion"
          ? buildMotionPoints(player, nextPoint)
          : assignment.template
            ? buildRoutePoints(assignment.template, player, nextPoint)
            : assignment.points.map((point, index) => index === dragState.pointIndex ? nextPoint : point);
      } else {
        points = assignment.points.map((point, index) => index === dragState.pointIndex ? nextPoint : point);
      }

      return {
        ...current,
        diagram: {
          ...current.diagram,
          assignments: current.diagram.assignments.map((candidate) => candidate.id === assignment.id ? { ...candidate, points } : candidate),
        },
      };
    });
  };

  const handlePointerUp = () => {
    const before = dragStartRef.current;
    if (before) {
      const after = snapshot(draft);
      if (!snapshotsEqual(before, after)) pushPast(before);
    }
    dragStartRef.current = null;
    setDragState(null);
  };

  const save = () => {
    const timestamp = new Date().toISOString();
    onSave({
      ...draft,
      name: draft.name.trim() || "Untitled Play",
      formation: draft.formation.trim(),
      concept: draft.concept.trim(),
      notes: draft.notes.trim(),
      updated_at: timestamp,
    });
  };

  return (
    <section className="mx-auto max-w-[1320px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary"><ArrowLeft size={16} />Playbook</button>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!past.length} className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-35" aria-label="Undo" title="Undo"><Undo2 size={16} /></button>
          <button type="button" onClick={redo} disabled={!future.length} className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-35" aria-label="Redo" title="Redo"><Redo2 size={16} /></button>
          <Button onClick={save}><Save size={16} /><span className="hidden sm:inline">Save Play</span><span className="sm:hidden">Save</span></Button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
          Play name
          <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="h-11 rounded-lg border border-border bg-surface px-3 text-sm font-bold normal-case tracking-normal text-text-primary outline-none focus:border-accent" />
        </label>
        <div className="grid gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Formation</span>
          <button type="button" onClick={() => { setPickerSide(draft.side); setFormationPickerOpen(true); }} className="flex h-11 min-w-[190px] items-center justify-between rounded-lg border border-border bg-surface px-3 text-left text-sm font-bold text-text-primary hover:bg-surface-elevated">
            <span>{draft.formation || "Custom"}</span><span className="ml-3 text-[10px] font-bold uppercase text-text-muted">Change</span>
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={flipCurrentPlay}><FlipHorizontal2 size={15} />Flip</Button>
        <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => duplicate(false)}><Copy size={15} />Duplicate</Button>
        <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => duplicate(true)}><FlipHorizontal2 size={15} />Duplicate + Flip</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <div className="relative aspect-[4/5] max-h-[760px] min-h-[500px] overflow-hidden rounded-lg border border-border bg-background sm:aspect-[5/4] xl:aspect-[4/3]">
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              className="h-full w-full touch-none select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              role="img"
              aria-label="Play editor field"
            >
              <FieldLines />
              <AssignmentLines
                diagram={draft.diagram}
                markerPrefix="editor"
                selectedAssignmentId={selectedAssignmentId}
                onAssignmentSelect={handleAssignmentSelect}
              />
              {selectedAssignment?.points.map((point, pointIndex) => {
                if (pointIndex === 0) return null;
                const player = playerForAssignment(draft.diagram, selectedAssignment.player_id);
                const primary = player ? isPrimaryPlayer(draft.diagram, player.id) : false;
                const color = player ? playerColor(player, primary) : "var(--text-primary)";
                const endpoint = pointIndex === selectedAssignment.points.length - 1;
                return (
                  <circle
                    key={`handle-${selectedAssignment.id}-${pointIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={endpoint ? 2.65 : 2.15}
                    fill={endpoint ? "var(--background)" : color}
                    stroke={color}
                    className="cursor-grab active:cursor-grabbing"
                    strokeWidth="0.95"
                    onPointerDown={(event) => handleAssignmentPointPointerDown(event, selectedAssignment.id, pointIndex)}
                  />
                );
              })}
              {draft.diagram.players.map((player) => {
                const selected = player.id === selectedPlayerId;
                const primary = isPrimaryPlayer(draft.diagram, player.id);
                const color = playerColor(player, primary);
                return (
                  <g key={player.id} onPointerDown={(event) => handlePlayerPointerDown(event, player.id)} className="cursor-grab active:cursor-grabbing">
                    {selected && <circle cx={player.x} cy={player.y} r="5.25" fill="none" className="stroke-text-primary" strokeWidth="0.85" opacity="0.82" />}
                    <circle cx={player.x} cy={player.y} r="3.95" fill={color} className="stroke-background" strokeWidth="0.95" />
                    <text x={player.x} y={player.y + 1.03} textAnchor="middle" fill={playerTextColor(primary)} className="text-[2.85px] font-black">{player.label}</text>
                  </g>
                );
              })}
            </svg>

            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-surface/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted backdrop-blur">
              Drag players behind LOS · tap a route line to adjust handles
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-border bg-surface p-3 xl:hidden">
            <PlayerControls
              side={draft.side}
              player={selectedPlayer}
              route={selectedRoute}
              motion={selectedMotion}
              primary={selectedPlayer ? draft.diagram.primary_target_player_id === selectedPlayer.id : false}
              onLabelChange={updatePlayerLabel}
              onChooseRoute={chooseRoute}
              onSelectAssignment={setSelectedAssignmentId}
              onToggleMotion={toggleMotion}
              onTogglePrimary={togglePrimaryTarget}
              onClear={clearSelectedAssignments}
              onRemove={removeSelectedPlayer}
              onAddPlayer={addPlayer}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <section className="hidden rounded-xl border border-border bg-surface p-4 xl:block">
            <PlayerControls
              side={draft.side}
              player={selectedPlayer}
              route={selectedRoute}
              motion={selectedMotion}
              primary={selectedPlayer ? draft.diagram.primary_target_player_id === selectedPlayer.id : false}
              onLabelChange={updatePlayerLabel}
              onChooseRoute={chooseRoute}
              onSelectAssignment={setSelectedAssignmentId}
              onToggleMotion={toggleMotion}
              onTogglePrimary={togglePrimaryTarget}
              onClear={clearSelectedAssignments}
              onRemove={removeSelectedPlayer}
              onAddPlayer={addPlayer}
            />
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Play setup</div>
            </div>
            <div className="mt-1 text-[10px] text-text-muted">Type, concept and situation</div>

            <div className="mt-4 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Type</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {PLAY_TYPES.map((option) => (
                <button key={option.value} type="button" onClick={() => setDraft((current) => ({ ...current, play_type: option.value }))} className={`min-h-8 rounded-md border text-[10px] font-extrabold ${draft.play_type === option.value ? "border-[rgba(124,58,237,0.45)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]" : "border-border bg-background text-text-secondary"}`}>
                  {option.label}
                </button>
              ))}
            </div>

            <label className="mt-3 grid gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Concept
              <input value={draft.concept} onChange={(event) => setDraft((current) => ({ ...current, concept: event.target.value.slice(0, 80) }))} placeholder="Flood, Mesh, Slant…" className="h-9 rounded-md border border-border bg-background px-3 text-sm font-semibold normal-case tracking-normal text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
            </label>

            <div className="mt-3 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">Situation</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SITUATIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setDraft((current) => ({ ...current, situation: option.value }))} className={`min-h-8 rounded-md border px-2 text-[10px] font-bold ${draft.situation === option.value ? "border-[rgba(124,58,237,0.45)] bg-[rgba(124,58,237,0.12)] text-[#c4b5fd]" : "border-border bg-background text-text-secondary"}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Coaching</div>
            <div className="mt-1 text-sm font-extrabold">Notes</div>
            <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Read, progression, coaching point…" rows={4} className="mt-3 w-full resize-none rounded-md border border-border bg-background p-3 text-sm leading-5 text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
          </section>
        </aside>
      </div>

      {formationPickerOpen && (
        <FormationPicker
          side={pickerSide}
          onSideChange={setPickerSide}
          onClose={() => setFormationPickerOpen(false)}
          onSelect={applyFormation}
          title="Change formation"
        />
      )}
    </section>
  );
}

const ROUTE_GLYPHS: Record<RouteTemplate, { line: string; arrow: string }> = {
  go: { line: "8,27 8,7", arrow: "M4 12 L8 6 L12 12" },
  slant: { line: "7,27 21,8", arrow: "M14 9 L22 7 L19 14" },
  out: { line: "8,27 8,15 25,15", arrow: "M19 11 L26 15 L19 19" },
  in: { line: "25,27 25,15 8,15", arrow: "M14 11 L7 15 L14 19" },
  post: { line: "8,27 8,18 21,7", arrow: "M14 9 L22 6 L19 14" },
  corner: { line: "22,27 22,18 9,7", arrow: "M16 9 L8 6 L11 14" },
  hitch: { line: "8,27 8,10 13,15", arrow: "M8 14 L14 16 L12 10" },
  drag: { line: "7,27 7,22 25,22", arrow: "M19 18 L26 22 L19 26" },
};

function RouteGlyph({ template }: { template: RouteTemplate }) {
  const glyph = ROUTE_GLYPHS[template];
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
      <circle cx="7" cy="27" r="1.5" fill="currentColor" opacity="0.8" />
      <polyline points={glyph.line} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={glyph.arrow} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayerControls({
  side,
  player,
  route,
  motion,
  primary,
  onLabelChange,
  onChooseRoute,
  onSelectAssignment,
  onToggleMotion,
  onTogglePrimary,
  onClear,
  onRemove,
  onAddPlayer,
}: {
  side: PlaySide;
  player: DiagramPlayer | null;
  route: DiagramAssignment | null;
  motion: DiagramAssignment | null;
  primary: boolean;
  onLabelChange: (playerId: string, label: string) => void;
  onChooseRoute: (template: RouteTemplate) => void;
  onSelectAssignment: (assignmentId: string | null) => void;
  onToggleMotion: () => void;
  onTogglePrimary: () => void;
  onClear: () => void;
  onRemove: () => void;
  onAddPlayer: () => void;
}) {
  if (!player) {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm font-extrabold"><CircleDot size={16} />Select a player</div>
        <p className="mt-2 text-xs leading-5 text-text-muted">Tap a player marker to assign a route, motion, or primary target.</p>
        <Button variant="secondary" className="mt-3 w-full" onClick={onAddPlayer}><Plus size={15} />Add player</Button>
      </div>
    );
  }

  const color = playerColor(player, primary);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background text-[10px] font-black" style={{ backgroundColor: color, color: playerTextColor(primary) }}>{player.label}</span>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Selected player</div>
            <div className="truncate text-sm font-extrabold">{player.label}</div>
          </div>
        </div>
        <button type="button" onClick={onRemove} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted hover:text-danger" aria-label="Remove player"><Trash2 size={15} /></button>
      </div>

      <label className="mt-3 grid gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">
        Position label
        <input value={player.label} onChange={(event) => onLabelChange(player.id, event.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm font-black normal-case tracking-normal text-text-primary outline-none focus:border-accent" />
      </label>

      {side === "offense" ? (
        <>
          <section className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Route</div>
              </div>
              <div className="text-[9px] text-text-muted">Tap line to edit handles</div>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {ROUTE_TEMPLATES.map((template) => {
                const active = route?.template === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onChooseRoute(template.id)}
                    aria-label={template.label}
                    title={template.label}
                    className="flex min-h-[54px] flex-col items-center justify-center rounded-md border bg-background transition-colors hover:bg-surface-elevated"
                    style={active
                      ? { borderColor: color, backgroundColor: `${color}14`, color }
                      : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    <RouteGlyph template={template.id} />
                    <span className="mt-0.5 text-[8px] font-bold">{template.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 border-t border-border pt-4">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Pre-snap + read</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleMotion}
                className="flex min-h-12 items-center gap-2 rounded-md border bg-background px-3 text-left transition-colors hover:bg-surface-elevated"
                style={motion ? { borderColor: color, backgroundColor: `${color}10`, color } : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                <MoveRight size={17} />
                <span>
                  <span className="block text-[10px] font-extrabold">Motion</span>
                  <span className="block text-[8px] opacity-70">{motion ? "On · tap line to adjust" : "Add pre-snap"}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={onTogglePrimary}
                className="flex min-h-12 items-center gap-2 rounded-md border bg-background px-3 text-left transition-colors hover:bg-surface-elevated"
                style={primary
                  ? { borderColor: "#7C3AED", backgroundColor: "rgba(124,58,237,0.12)", color: "#c4b5fd" }
                  : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                <Target size={17} />
                <span>
                  <span className="block text-[10px] font-extrabold">Primary</span>
                  <span className="block text-[8px] opacity-70">{primary ? "Primary target" : "Set target"}</span>
                </span>
              </button>
            </div>
            {motion && (
              <button type="button" onClick={() => onSelectAssignment(motion.id)} className="mt-2 text-[9px] font-bold text-text-muted hover:text-text-primary">
                Select motion handles
              </button>
            )}
          </section>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-text-muted">
          Defensive placement stays on the defensive side of the LOS. Man/zone/rush assignment tools come next.
        </div>
      )}

      <section className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
        <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={onClear}><Eraser size={15} />Clear player</Button>
        <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={onAddPlayer}><Plus size={15} />Add player</Button>
      </section>
    </div>
  );
}
