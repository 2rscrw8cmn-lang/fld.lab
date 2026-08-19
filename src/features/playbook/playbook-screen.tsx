import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleDot,
  Eraser,
  FilePlus2,
  MoveRight,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Team } from "@/lib/api";

type PlaySide = "offense" | "defense";
type PathKind = "route" | "motion";

type Point = { x: number; y: number };
type DiagramPlayer = Point & { id: string; label: string };
type DiagramPath = {
  id: string;
  player_id: string;
  kind: PathKind;
  points: Point[];
};

type PlayDiagram = {
  schema_version: 1;
  players: DiagramPlayer[];
  paths: DiagramPath[];
};

type Play = {
  id: string;
  team_id: string;
  name: string;
  side: PlaySide;
  formation: string;
  notes: string;
  diagram: PlayDiagram;
  created_at: string;
  updated_at: string;
};

type Filter = "all" | PlaySide;

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const clamp = (value: number) => Math.max(4, Math.min(96, value));

function storageKey(teamId: string) {
  return `fld-lab:playbook:${teamId}`;
}

function defaultPlayers(side: PlaySide): DiagramPlayer[] {
  if (side === "defense") {
    return [
      { id: id("player"), label: "L", x: 18, y: 52 },
      { id: id("player"), label: "M", x: 38, y: 46 },
      { id: id("player"), label: "S", x: 62, y: 46 },
      { id: id("player"), label: "R", x: 82, y: 52 },
      { id: id("player"), label: "D", x: 50, y: 30 },
    ];
  }

  return [
    { id: id("player"), label: "X", x: 15, y: 71 },
    { id: id("player"), label: "C", x: 50, y: 71 },
    { id: id("player"), label: "Z", x: 85, y: 71 },
    { id: id("player"), label: "Y", x: 70, y: 81 },
    { id: id("player"), label: "QB", x: 50, y: 86 },
  ];
}

function newPlay(teamId: string): Play {
  const timestamp = new Date().toISOString();
  return {
    id: id("play"),
    team_id: teamId,
    name: "New Play",
    side: "offense",
    formation: "",
    notes: "",
    diagram: { schema_version: 1, players: defaultPlayers("offense"), paths: [] },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function parseStoredPlays(teamId: string): Play[] {
  try {
    const raw = window.localStorage.getItem(storageKey(teamId));
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((candidate): candidate is Play => {
      if (!candidate || typeof candidate !== "object") return false;
      const play = candidate as Partial<Play>;
      return play.team_id === teamId && typeof play.id === "string" && typeof play.name === "string" && Boolean(play.diagram);
    });
  } catch {
    return [];
  }
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function polylinePoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function FieldDiagram({ diagram, compact = false }: { diagram: PlayDiagram; compact?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={compact ? "h-full w-full" : "h-full w-full"} aria-hidden={true}>
      <defs>
        <marker id={compact ? "preview-route-arrow" : "field-route-arrow"} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-accent" />
        </marker>
        <marker id={compact ? "preview-motion-arrow" : "field-motion-arrow"} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-text-muted" />
        </marker>
      </defs>
      <FieldLines />
      {diagram.paths.map((path) => (
        <polyline
          key={path.id}
          points={polylinePoints(path.points)}
          fill="none"
          markerEnd={`url(#${compact ? "preview" : "field"}-${path.kind}-arrow)`}
          className={path.kind === "route" ? "stroke-accent" : "stroke-text-muted"}
          strokeWidth={compact ? 1.25 : 1.6}
          strokeDasharray={path.kind === "motion" ? "3 2" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {diagram.players.map((player) => (
        <g key={player.id}>
          <circle cx={player.x} cy={player.y} r={compact ? 3.2 : 4.2} className="fill-surface stroke-text-secondary" strokeWidth="1.1" />
          {!compact && <text x={player.x} y={player.y + 1.15} textAnchor="middle" className="fill-text-primary text-[3.2px] font-black">{player.label}</text>}
        </g>
      ))}
    </svg>
  );
}

function FieldLines() {
  return (
    <>
      <rect x="3" y="3" width="94" height="94" rx="2" fill="none" className="stroke-border" strokeWidth="0.9" />
      {[20, 35, 50, 65, 80].map((y) => (
        <line key={y} x1="3" y1={y} x2="97" y2={y} className="stroke-border" strokeWidth="0.55" opacity="0.75" />
      ))}
      <line x1="3" y1="70" x2="97" y2="70" className="stroke-text-secondary" strokeWidth="1.3" />
      <text x="5" y="68" className="fill-text-muted text-[2.5px] font-bold">LOS</text>
    </>
  );
}

function PlayCard({ play, onOpen }: { play: Play; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="overflow-hidden rounded-xl border border-border bg-surface text-left transition-colors hover:border-[rgba(124,58,237,0.5)] hover:bg-surface-elevated">
      <div className="aspect-[4/3] bg-background p-2">
        <FieldDiagram diagram={play.diagram} compact />
      </div>
      <div className="border-t border-border px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold">{play.name}</div>
            <div className="mt-0.5 truncate text-[10px] text-text-muted">{play.formation || (play.side === "offense" ? "Offense" : "Defense")}</div>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted">{play.side}</span>
        </div>
        <div className="mt-2 text-[9px] text-text-muted">Updated {formatUpdated(play.updated_at)}</div>
      </div>
    </button>
  );
}

function SegmentedFilter({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div className="inline-grid grid-cols-3 rounded-lg border border-border bg-background p-1 text-[11px] font-bold">
      {(["all", "offense", "defense"] as Filter[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-h-8 rounded-md px-3 capitalize transition-colors ${value === option ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function PlaybookScreen({ team }: { team: Team | null }) {
  const [plays, setPlays] = useState<Play[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<Play | null>(null);

  useEffect(() => {
    setDraft(null);
    setFilter("all");
    setPlays(team ? parseStoredPlays(team.id) : []);
  }, [team?.id]);

  const persist = (next: Play[]) => {
    setPlays(next);
    if (team) window.localStorage.setItem(storageKey(team.id), JSON.stringify(next));
  };

  const filtered = useMemo(
    () => plays.filter((play) => filter === "all" || play.side === filter).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [filter, plays],
  );

  if (!team) {
    return <section className="p-6 text-sm text-text-muted">Create or select a team to build a playbook.</section>;
  }

  if (draft) {
    return (
      <PlayEditor
        play={draft}
        onCancel={() => setDraft(null)}
        onSave={(saved) => {
          const next = plays.some((play) => play.id === saved.id)
            ? plays.map((play) => play.id === saved.id ? saved : play)
            : [saved, ...plays];
          persist(next);
          setDraft(null);
        }}
      />
    );
  }

  return (
    <section className="mx-auto max-w-[1220px] px-3 pb-8 pt-[18px] sm:px-4 md:px-6 md:pt-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold leading-none tracking-[-0.035em] md:text-[30px]">Playbook</h1>
          <p className="mt-1.5 text-[13px] text-text-muted">Draw and organize plays for {team.name}.</p>
        </div>
        <Button onClick={() => setDraft(newPlay(team.id))}><FilePlus2 size={16} />New Play</Button>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <SegmentedFilter value={filter} onChange={setFilter} />
        <span className="text-[10px] font-bold text-text-muted">{filtered.length} play{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <Route size={34} className="text-text-muted" />
          <h2 className="mt-4 text-lg font-extrabold">{plays.length ? `No ${filter} plays yet` : "Start the playbook"}</h2>
          <p className="mt-1 max-w-sm text-sm leading-5 text-text-muted">Drag players into formation, draw routes, and keep the diagram ready for practice.</p>
          <Button className="mt-5" onClick={() => setDraft(newPlay(team.id))}><Plus size={16} />Create first play</Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((play) => <PlayCard key={play.id} play={play} onOpen={() => setDraft(structuredClone(play))} />)}
        </div>
      )}

      <div className="mt-5 rounded-lg border border-border bg-surface px-3 py-2.5 text-[10px] leading-4 text-text-muted">
        Prototype storage is local to this browser for now. Once the editor interaction feels right, plays will move to the team database.
      </div>
    </section>
  );
}

function PlayEditor({ play, onCancel, onSave }: { play: Play; onCancel: () => void; onSave: (play: Play) => void }) {
  const [draft, setDraft] = useState<Play>(() => structuredClone(play));
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(draft.diagram.players[0]?.id ?? null);
  const [drawingKind, setDrawingKind] = useState<PathKind | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const selectedPlayer = draft.diagram.players.find((player) => player.id === selectedPlayerId) ?? null;

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement | SVGGElement>): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  const updateDiagram = (updater: (diagram: PlayDiagram) => PlayDiagram) => {
    setDraft((current) => ({ ...current, diagram: updater(current.diagram) }));
  };

  const updatePlayer = (playerId: string, patch: Partial<DiagramPlayer>) => {
    updateDiagram((diagram) => ({
      ...diagram,
      players: diagram.players.map((player) => player.id === playerId ? { ...player, ...patch } : player),
    }));
  };

  const changeSide = (side: PlaySide) => {
    setDraft((current) => {
      if (current.side === side) return current;
      return {
        ...current,
        side,
        diagram: { schema_version: 1, players: defaultPlayers(side), paths: [] },
      };
    });
    setDrawingKind(null);
    setDrawingPoints([]);
    setSelectedPlayerId(null);
  };

  const clearSelectedPaths = () => {
    if (!selectedPlayerId) return;
    updateDiagram((diagram) => ({ ...diagram, paths: diagram.paths.filter((path) => path.player_id !== selectedPlayerId) }));
  };

  const removeSelectedPlayer = () => {
    if (!selectedPlayerId) return;
    updateDiagram((diagram) => ({
      ...diagram,
      players: diagram.players.filter((player) => player.id !== selectedPlayerId),
      paths: diagram.paths.filter((path) => path.player_id !== selectedPlayerId),
    }));
    setSelectedPlayerId(null);
    setDrawingKind(null);
  };

  const addPlayer = () => {
    const player: DiagramPlayer = { id: id("player"), label: `P${draft.diagram.players.length + 1}`, x: 50, y: 82 };
    updateDiagram((diagram) => ({ ...diagram, players: [...diagram.players, player] }));
    setSelectedPlayerId(player.id);
  };

  const handlePlayerPointerDown = (event: React.PointerEvent<SVGGElement>, playerId: string) => {
    event.stopPropagation();
    setSelectedPlayerId(playerId);
    setDraggingPlayerId(playerId);
    setDrawingPoints([]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingKind || !selectedPlayer) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    setDrawingPoints([{ x: selectedPlayer.x, y: selectedPlayer.y }, point]);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (draggingPlayerId) {
      const point = pointFromEvent(event);
      updatePlayer(draggingPlayerId, point);
      return;
    }
    if (!drawingKind || drawingPoints.length === 0) return;
    const point = pointFromEvent(event);
    setDrawingPoints((current) => {
      const previous = current[current.length - 1];
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      return distance >= 1.25 ? [...current, point] : current;
    });
  };

  const handlePointerUp = () => {
    setDraggingPlayerId(null);
    if (!drawingKind || !selectedPlayerId || drawingPoints.length < 2) {
      setDrawingPoints([]);
      return;
    }
    const path: DiagramPath = { id: id("path"), player_id: selectedPlayerId, kind: drawingKind, points: drawingPoints };
    updateDiagram((diagram) => ({ ...diagram, paths: [...diagram.paths, path] }));
    setDrawingPoints([]);
    setDrawingKind(null);
  };

  const save = () => {
    const timestamp = new Date().toISOString();
    onSave({
      ...draft,
      name: draft.name.trim() || "Untitled Play",
      formation: draft.formation.trim(),
      notes: draft.notes.trim(),
      updated_at: timestamp,
    });
  };

  return (
    <section className="mx-auto max-w-[1320px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary"><ArrowLeft size={16} />Playbook</button>
        <Button onClick={save}><Save size={16} />Save Play</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_190px]">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Play name
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="h-11 rounded-lg border border-border bg-surface px-3 text-sm font-bold normal-case tracking-normal text-text-primary outline-none focus:border-accent" />
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Side
              <div className="grid h-11 grid-cols-2 rounded-lg border border-border bg-surface p-1 normal-case tracking-normal">
                {(["offense", "defense"] as PlaySide[]).map((side) => <button key={side} type="button" onClick={() => changeSide(side)} className={`rounded-md text-[11px] font-bold capitalize ${draft.side === side ? "bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "text-text-muted"}`}>{side}</button>)}
              </div>
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Formation
              <input value={draft.formation} onChange={(event) => setDraft((current) => ({ ...current, formation: event.target.value }))} placeholder="Trips, Bunch, Spread…" className="h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold normal-case tracking-normal text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
            </label>
          </div>

          <div className="relative aspect-[4/5] max-h-[760px] min-h-[520px] overflow-hidden rounded-xl border border-border bg-background sm:aspect-[5/4] xl:aspect-[4/3]">
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              className={`h-full w-full touch-none select-none ${drawingKind ? "cursor-crosshair" : "cursor-default"}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              role="img"
              aria-label="Play drawing field"
            >
              <defs>
                <marker id="editor-route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="fill-accent" /></marker>
                <marker id="editor-motion-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="fill-text-muted" /></marker>
              </defs>
              <FieldLines />
              {draft.diagram.paths.map((path) => (
                <polyline key={path.id} points={polylinePoints(path.points)} fill="none" markerEnd={`url(#editor-${path.kind}-arrow)`} className={path.kind === "route" ? "stroke-accent" : "stroke-text-muted"} strokeWidth="1.8" strokeDasharray={path.kind === "motion" ? "3 2" : undefined} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {drawingPoints.length > 1 && <polyline points={polylinePoints(drawingPoints)} fill="none" className={drawingKind === "motion" ? "stroke-text-muted" : "stroke-accent"} strokeWidth="1.8" strokeDasharray={drawingKind === "motion" ? "3 2" : undefined} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />}
              {draft.diagram.players.map((player) => {
                const selected = player.id === selectedPlayerId;
                return (
                  <g key={player.id} onPointerDown={(event) => handlePlayerPointerDown(event, player.id)} className="cursor-grab active:cursor-grabbing">
                    {selected && <circle cx={player.x} cy={player.y} r="6" fill="none" className="stroke-accent" strokeWidth="1.1" opacity="0.75" />}
                    <circle cx={player.x} cy={player.y} r="4.4" className={selected ? "fill-accent stroke-background" : "fill-surface stroke-text-secondary"} strokeWidth="1.2" />
                    <text x={player.x} y={player.y + 1.15} textAnchor="middle" className={selected ? "fill-white text-[3.2px] font-black" : "fill-text-primary text-[3.2px] font-black"}>{player.label}</text>
                  </g>
                );
              })}
            </svg>

            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-surface/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-text-muted backdrop-blur">
              {drawingKind ? `Draw ${drawingKind}` : "Drag players · select to draw"}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
            <Button variant={drawingKind === "route" ? "default" : "secondary"} className="min-h-11 px-2 sm:px-4" disabled={!selectedPlayer} onClick={() => setDrawingKind((current) => current === "route" ? null : "route")}><Route size={16} /><span className="hidden sm:inline">Route</span></Button>
            <Button variant={drawingKind === "motion" ? "default" : "secondary"} className="min-h-11 px-2 sm:px-4" disabled={!selectedPlayer} onClick={() => setDrawingKind((current) => current === "motion" ? null : "motion")}><MoveRight size={16} /><span className="hidden sm:inline">Motion</span></Button>
            <Button variant="secondary" className="min-h-11 px-2 sm:px-4" disabled={!selectedPlayer} onClick={clearSelectedPaths}><Eraser size={16} /><span className="hidden sm:inline">Clear routes</span></Button>
            <Button variant="secondary" className="min-h-11 px-2 sm:px-4" onClick={addPlayer}><Plus size={16} /><span className="hidden sm:inline">Player</span></Button>
          </div>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold"><CircleDot size={16} />Selected player</div>
            {!selectedPlayer ? (
              <p className="mt-3 text-xs leading-5 text-text-muted">Tap a player on the field to edit or draw from it.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                  Label
                  <input value={selectedPlayer.label} onChange={(event) => updatePlayer(selectedPlayer.id, { label: event.target.value.slice(0, 4) })} className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-black normal-case tracking-normal text-text-primary outline-none focus:border-accent" />
                </label>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-text-muted">
                  <div className="rounded-lg border border-border bg-background p-2.5"><span className="block font-bold uppercase tracking-[0.06em]">X</span><strong className="mt-1 block text-sm text-text-primary">{selectedPlayer.x.toFixed(0)}</strong></div>
                  <div className="rounded-lg border border-border bg-background p-2.5"><span className="block font-bold uppercase tracking-[0.06em]">Y</span><strong className="mt-1 block text-sm text-text-primary">{selectedPlayer.y.toFixed(0)}</strong></div>
                </div>
                <Button variant="secondary" className="w-full text-danger" onClick={removeSelectedPlayer}><Trash2 size={15} />Remove player</Button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm font-extrabold">Notes</div>
            <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Read, progression, coaching point…" rows={5} className="mt-3 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm leading-5 text-text-primary outline-none placeholder:text-text-muted focus:border-accent" />
          </section>

          <section className="rounded-xl border border-border bg-surface p-4 text-xs leading-5 text-text-muted">
            <strong className="text-text-primary">How to draw:</strong> tap a player, choose Route or Motion, then drag across the field. Routes are solid; motion is dashed.
          </section>
        </aside>
      </div>
    </section>
  );
}
