import { useMemo, useRef, useState, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  CircleDot,
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
import { PlayViewer } from "@/features/playbook/play-viewer";
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
  ROUTE_TEMPLATES,
  assignmentEnd,
  buildMotionPoints,
  buildRoutePoints,
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
type LibraryView = "active" | "library";
type PersistenceMode = "loading" | "database" | "local";
type EditorSnapshot = Pick<Play, "side" | "formation_id" | "formation" | "diagram">;
type DragState = { kind: "player" | "assignment"; id: string } | null;

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
      <rect x="3" y="3" width="94" height="94" rx="1.5" fill="none" className="stroke-border" strokeWidth="0.6" opacity="0.76" />
      {guides.map((guide) => (
        <g key={guide.y}>
          <line x1="3" y1={guide.y} x2="97" y2={guide.y} className="stroke-border" strokeWidth="0.38" opacity="0.5" />
          <text x="5" y={guide.y - 1.35} className="fill-text-muted text-[2.05px] font-bold" opacity="0.68">{guide.label}</text>
        </g>
      ))}
      <line x1="3" y1="55" x2="97" y2="55" className="stroke-text-muted" strokeWidth="0.42" strokeDasharray="1.8 1.8" opacity="0.46" />
      <text x="95" y="53.3" textAnchor="end" className="fill-text-muted text-[2px] font-bold" opacity="0.68">7YD RUSH</text>
      <line x1="3" y1="76" x2="97" y2="76" className="stroke-text-secondary" strokeWidth="0.78" opacity="0.82" />
      <text x="5" y="74.1" className="fill-text-muted text-[2.2px] font-bold">LOS</text>
    </>
  );
}

function AssignmentLines({
  diagram,
  markerPrefix,
  compact = false,
  selectedAssignmentId = null,
}: {
  diagram: PlayDiagram;
  markerPrefix: string;
  compact?: boolean;
  selectedAssignmentId?: string | null;
}) {
  return (
    <>
      <defs>
        <marker id={`${markerPrefix}-route`} viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth={compact ? "2.7" : "3.1"} markerHeight={compact ? "2.7" : "3.1"} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-text-secondary" />
        </marker>
        <marker id={`${markerPrefix}-route-selected`} viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-accent" />
        </marker>
        <marker id={`${markerPrefix}-motion`} viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth={compact ? "2.4" : "2.8"} markerHeight={compact ? "2.4" : "2.8"} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-text-muted" />
        </marker>
      </defs>
      {diagram.assignments.map((assignment) => {
        const selected = assignment.id === selectedAssignmentId;
        const isRoute = assignment.kind === "route";
        const marker = selected && isRoute ? `${markerPrefix}-route-selected` : `${markerPrefix}-${assignment.kind}`;
        return (
          <polyline
            key={assignment.id}
            points={polylinePoints(assignment.points)}
            fill="none"
            markerEnd={`url(#${marker})`}
            className={selected ? "stroke-accent" : isRoute ? "stroke-text-secondary" : "stroke-text-muted"}
            strokeWidth={compact ? (isRoute ? 0.72 : 0.54) : selected ? 1.05 : isRoute ? 0.9 : 0.68}
            strokeDasharray={assignment.kind === "motion" ? "2.4 1.9" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={selected ? 1 : isRoute ? 0.9 : 0.72}
          />
        );
      })}
    </>
  );
}

function FieldDiagram({ diagram, compact = false, markerPrefix = "play" }: { diagram: PlayDiagram; compact?: boolean; markerPrefix?: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden={true}>
      <FieldLines />
      <AssignmentLines diagram={diagram} compact={compact} markerPrefix={markerPrefix} />
      {diagram.players.map((player) => {
        const primary = diagram.primary_target_player_id === player.id;
        return (
          <g key={player.id}>
            {primary && <circle cx={player.x} cy={player.y} r={compact ? 4.35 : 5.45} fill="none" className="stroke-accent" strokeWidth={compact ? 0.62 : 0.78} opacity="0.82" />}
            <circle cx={player.x} cy={player.y} r={compact ? 2.85 : 3.85} className="fill-surface stroke-text-secondary" strokeWidth={compact ? 0.78 : 0.9} />
            {!compact && <text x={player.x} y={player.y + 1.05} textAnchor="middle" className="fill-text-primary text-[2.85px] font-black">{player.label}</text>}
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

function PlayCard({ play, onOpen }: { play: Play; onOpen: () => void }) {
  const details = [
    play.play_type.charAt(0).toUpperCase() + play.play_type.slice(1),
    play.concept || null,
    play.situation !== "any" ? situationLabel(play.situation) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <button type="button" onClick={onOpen} className="group overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-text-muted hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <div className="aspect-[4/3] bg-background p-3">
        <FieldDiagram diagram={play.diagram} compact markerPrefix={`card-${play.id}`} />
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
  const [view, setView] = useState<LibraryView>("active");
  const [viewer, setViewer] = useState<Play | null>(null);
  const [draft, setDraft] = useState<Play | null>(null);
  const [newPlayPickerOpen, setNewPlayPickerOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<PlaySide>("offense");
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("loading");

  useEffect(() => {
    let cancelled = false;
    setViewer(null);
    setDraft(null);
    setFilter("all");
    setView("active");
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
      setView(saved.active_play ? "active" : "library");
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
      setView(persisted.active_play ? "active" : "library");
    } catch {
      persistLocal(localNext);
      setPersistenceMode("local");
      setDraft(null);
      setView(saved.active_play ? "active" : "library");
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
      .filter((play) => view === "active" ? play.active_play : !play.active_play)
      .filter((play) => filter === "all" || play.side === filter)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [filter, plays, view],
  );

  const activeCount = plays.filter((play) => play.active_play).length;
  const libraryCount = plays.length - activeCount;

  if (!team) {
    return <section className="p-6 text-sm text-text-muted">Create or select a team to build a playbook.</section>;
  }

  if (viewer) {
    return (
      <PlayViewer
        key={`viewer-${viewer.id}`}
        play={viewer}
        onBack={() => setViewer(null)}
        onEdit={viewer.active_play ? () => {
          setViewer(null);
          setDraft(structuredClone(viewer));
        } : undefined}
        onMoveToActive={!viewer.active_play ? () => {
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
          <p className="mt-1.5 text-[12px] text-text-muted">Current install up front. Everything else stays in the Library.</p>
        </div>
        <Button onClick={() => { setPickerSide("offense"); setNewPlayPickerOpen(true); }}><FilePlus2 size={16} />New Play</Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5 text-xs font-bold">
          <button type="button" onClick={() => setView("active")} className={`relative min-h-9 px-0.5 ${view === "active" ? "text-text-primary" : "text-text-muted hover:text-text-primary"}`}>
            Active <span className="ml-1 text-[10px] text-text-muted">{activeCount}</span>
            {view === "active" && <span className="absolute inset-x-0 -bottom-[7px] h-0.5 bg-accent" />}
          </button>
          <button type="button" onClick={() => setView("library")} className={`relative min-h-9 px-0.5 ${view === "library" ? "text-text-primary" : "text-text-muted hover:text-text-primary"}`}>
            Library <span className="ml-1 text-[10px] text-text-muted">{libraryCount}</span>
            {view === "library" && <span className="absolute inset-x-0 -bottom-[7px] h-0.5 bg-accent" />}
          </button>
        </div>
        <SegmentedFilter value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 flex min-h-[280px] flex-col items-center justify-center border border-dashed border-border bg-surface/40 p-8 text-center">
          <Route size={30} className="text-text-muted" />
          <h2 className="mt-3 text-base font-extrabold">{view === "active" ? "No active plays yet" : "Library is empty"}</h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-text-muted">
            {view === "active" ? "New plays start active. Move plays to the Library when they leave the current install." : "Move an active play to the Library when it is not in the current install."}
          </p>
          {view === "active" && <Button className="mt-4" onClick={() => { setPickerSide("offense"); setNewPlayPickerOpen(true); }}><Plus size={16} />Create first play</Button>}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((play) => <PlayCard key={play.id} play={play} onOpen={() => setViewer(structuredClone(play))} />)}
        </div>
      )}

      <div className={`mt-5 border-t border-border pt-3 text-[10px] leading-4 ${persistenceMode === "local" ? "text-warning" : "text-text-muted"}`}>
        {persistenceMode === "database"
          ? "Saved to the team database · available on signed-in team devices"
          : persistenceMode === "local"
            ? "Team database unavailable · changes are cached on this device and will reconcile when it reconnects"
            : "Loading team playbook…"}
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
    const player: DiagramPlayer = { id: id("player"), label: `P${draft.diagram.players.length + 1}`, x: 50, y: 88 };
    commit((current) => ({ ...current, diagram: { ...current.diagram, players: [...current.diagram.players, player] } }));
    setSelectedPlayerId(player.id);
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

  const handleAssignmentPointerDown = (event: ReactPointerEvent<SVGCircleElement>, assignmentId: string) => {
    event.stopPropagation();
    setSelectedAssignmentId(assignmentId);
    dragStartRef.current = snapshot(draft);
    setDragState({ kind: "assignment", id: assignmentId });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const nextPoint = pointFromEvent(event);
    setDraft((current) => {
      if (dragState.kind === "player") {
        const player = current.diagram.players.find((candidate) => candidate.id === dragState.id);
        if (!player) return current;
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
      const points = assignment.kind === "motion"
        ? buildMotionPoints(player, nextPoint)
        : assignment.template
          ? buildRoutePoints(assignment.template, player, nextPoint)
          : [...assignment.points.slice(0, -1), nextPoint];
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
              <AssignmentLines diagram={draft.diagram} markerPrefix="editor" selectedAssignmentId={selectedAssignmentId} />
              {draft.diagram.assignments.map((assignment) => {
                if (assignment.id !== selectedAssignmentId) return null;
                const end = assignmentEnd(assignment);
                return (
                  <circle
                    key={`handle-${assignment.id}`}
                    cx={end.x}
                    cy={end.y}
                    r="2.6"
                    className="fill-background stroke-accent cursor-grab active:cursor-grabbing"
                    strokeWidth="1"
                    onPointerDown={(event) => handleAssignmentPointerDown(event, assignment.id)}
                  />
                );
              })}
              {draft.diagram.players.map((player) => {
                const selected = player.id === selectedPlayerId;
                const primary = draft.diagram.primary_target_player_id === player.id;
                return (
                  <g key={player.id} onPointerDown={(event) => handlePlayerPointerDown(event, player.id)} className="cursor-grab active:cursor-grabbing">
                    {primary && <circle cx={player.x} cy={player.y} r="6.1" fill="none" className="stroke-accent" strokeWidth="0.82" strokeDasharray="2 1.5" opacity="0.9" />}
                    {selected && <circle cx={player.x} cy={player.y} r="5.25" fill="none" className="stroke-accent" strokeWidth="1" opacity="0.82" />}
                    <circle cx={player.x} cy={player.y} r="4" className={selected ? "fill-accent stroke-background" : "fill-surface stroke-text-secondary"} strokeWidth="1" />
                    <text x={player.x} y={player.y + 1.05} textAnchor="middle" className={selected ? "fill-white text-[2.9px] font-black" : "fill-text-primary text-[2.9px] font-black"}>{player.label}</text>
                  </g>
                );
              })}
            </svg>

            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-surface/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted backdrop-blur">
              Drag players · route handles adjust depth
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

        <aside className="space-y-3">
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">Play details</div>
                <div className="mt-0.5 text-[10px] text-text-muted">Used to keep the playbook small and game-ready.</div>
              </div>
              <button type="button" onClick={() => setDraft((current) => ({ ...current, active_play: !current.active_play }))} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-extrabold ${draft.active_play ? "border-[rgba(124,58,237,0.5)] bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "border-border bg-background text-text-muted"}`}>
                {draft.active_play ? "ACTIVE PLAY" : "IN LIBRARY"}
              </button>
            </div>

            <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Type</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {PLAY_TYPES.map((option) => (
                <button key={option.value} type="button" onClick={() => setDraft((current) => ({ ...current, play_type: option.value }))} className={`min-h-9 rounded-lg border text-[10px] font-extrabold ${draft.play_type === option.value ? "border-[rgba(124,58,237,0.5)] bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "border-border bg-background text-text-secondary"}`}>
                  {option.label}
                </button>
              ))}
            </div>

            <label className="mt-3 grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Concept
              <input value={draft.concept} onChange={(event) => setDraft((current) => ({ ...current, concept: event.target.value.slice(0, 80) }))} placeholder="Flood, Mesh, Slant…" className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold normal-case tracking-normal text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
            </label>

            <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Situation</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SITUATIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setDraft((current) => ({ ...current, situation: option.value }))} className={`min-h-9 rounded-lg border px-2 text-[10px] font-bold ${draft.situation === option.value ? "border-[rgba(124,58,237,0.5)] bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "border-border bg-background text-text-secondary"}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm font-extrabold">Notes</div>
            <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Read, progression, coaching point…" rows={5} className="mt-3 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm leading-5 text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 text-xs leading-5 text-text-muted">
            <strong className="text-text-primary">Smart routes:</strong> select a player, tap a route, then drag the route endpoint. fld.LAB keeps the route geometry clean while you change depth and direction.
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-extrabold"><CircleDot size={16} /><span className="truncate">Selected · {player.label}</span></div>
        <button type="button" onClick={onRemove} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-muted hover:text-danger" aria-label="Remove player"><Trash2 size={15} /></button>
      </div>

      <label className="mt-3 grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
        Position label
        <input value={player.label} onChange={(event) => onLabelChange(player.id, event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-black normal-case tracking-normal text-text-primary outline-none focus:border-accent" />
      </label>

      {side === "offense" ? (
        <>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Route</div>
            {route && <button type="button" onClick={() => onSelectAssignment(route.id)} className="text-[10px] font-bold text-[#c4b5fd]">Adjust endpoint</button>}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {ROUTE_TEMPLATES.map((template) => {
              const active = route?.template === template.id;
              return (
                <button key={template.id} type="button" onClick={() => onChooseRoute(template.id)} className={`min-h-11 rounded-lg border px-1 text-[10px] font-extrabold transition-colors ${active ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.18)] text-[#c4b5fd]" : "border-border bg-background text-text-secondary hover:bg-surface-elevated"}`}>
                  {template.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant={motion ? "default" : "secondary"} className="min-h-10 px-3 text-xs" onClick={onToggleMotion}><MoveRight size={15} />{motion ? "Motion on" : "Motion"}</Button>
            <Button variant={primary ? "default" : "secondary"} className="min-h-10 px-3 text-xs" onClick={onTogglePrimary}><Target size={15} />{primary ? "Primary" : "Set primary"}</Button>
          </div>
          {motion && <button type="button" onClick={() => onSelectAssignment(motion.id)} className="mt-2 w-full text-center text-[10px] font-bold text-text-muted hover:text-text-primary">Adjust motion endpoint</button>}
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-text-muted">
          Defensive placement is preserved here; man/zone/rush assignment tools are the next Playbook phase.
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="min-h-10 px-3 text-xs" onClick={onClear}><Eraser size={15} />Clear</Button>
        <Button variant="secondary" className="min-h-10 px-3 text-xs" onClick={onAddPlayer}><Plus size={15} />Player</Button>
      </div>
    </div>
  );
}
