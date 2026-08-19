import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ClipboardList,
  Printer,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LOS_Y, type DiagramAssignment, type DiagramPlayer, type PlayDiagram, type Point } from "@/features/playbook/playbook-model";
import {
  isPrimaryPlayer,
  playerColor,
  playerForAssignment,
  playerTextColor,
} from "@/features/playbook/playbook-visuals";
import type { Team } from "@/lib/api";
import {
  getPlayPersonnel,
  type PlayPersonnelAssignment,
} from "@/lib/playbook-personnel-api";
import type { PlaySituation, PlayType } from "@/lib/playbook-api";

export type PlaybookGameDayPlay = {
  id: string;
  team_id: string;
  name: string;
  side: "offense" | "defense";
  formation: string;
  play_type: PlayType;
  concept: string;
  situation: PlaySituation;
  notes: string;
  diagram: PlayDiagram;
};

type Props = {
  team: Team;
  plays: PlaybookGameDayPlay[];
  onBack: () => void;
};

type OutputMode = "call-sheet" | "wristbands";
type LabelMode = "positions" | "players";
type PersonnelMap = Record<string, PlayPersonnelAssignment[]>;

const SITUATION_LABELS: Record<PlaySituation, string> = {
  any: "Any",
  short: "Short",
  medium: "Medium",
  deep: "Deep",
  "no-run": "No-run",
  "goal-line": "Goal line",
  conversion: "Conversion",
};

function polylinePoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
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

function renderedAssignmentPoints(diagram: PlayDiagram, assignment: DiagramAssignment): Point[] {
  if (assignment.kind !== "route") return assignment.points;
  const motion = assignmentFor(diagram, assignment.player_id, "motion");
  if (!motion) return assignment.points;
  const motionEnd = motion.points[motion.points.length - 1];
  return motionEnd ? translatedRoute(assignment, motionEnd) : assignment.points;
}

function playerMarkerLabel(
  player: DiagramPlayer,
  assignment: PlayPersonnelAssignment | undefined,
  mode: LabelMode,
) {
  if (mode === "positions" || !assignment) return player.label;
  const jersey = assignment.membership.jersey_number?.trim();
  if (jersey) return jersey.slice(0, 3);
  return `${assignment.athlete.first_name[0] ?? ""}${assignment.athlete.last_name[0] ?? ""}`.toUpperCase() || player.label;
}

function StaticPlayDiagram({
  play,
  personnel,
  labelMode,
  markerPrefix,
}: {
  play: PlaybookGameDayPlay;
  personnel: PlayPersonnelAssignment[];
  labelMode: LabelMode;
  markerPrefix: string;
}) {
  const personnelByPlayer = new Map(personnel.map((assignment) => [assignment.player_id, assignment]));
  const guides = [16, 31, 46, 61];

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`${play.name} play diagram`}>
      <rect x="3" y="3" width="94" height="94" rx="1.5" fill="none" className="stroke-border" strokeWidth="0.55" opacity="0.72" />
      {guides.map((y) => <line key={y} x1="3" y1={y} x2="97" y2={y} className="stroke-border" strokeWidth="0.32" opacity="0.42" />)}
      <line x1="3" y1="55" x2="97" y2="55" className="stroke-text-muted" strokeWidth="0.35" strokeDasharray="1.8 1.8" opacity="0.38" />
      <line x1="3" y1={LOS_Y} x2="97" y2={LOS_Y} className="stroke-text-secondary" strokeWidth="0.72" opacity="0.82" />
      <text x="5" y={LOS_Y - 1.8} className="fill-text-muted text-[2.15px] font-bold">LOS</text>

      <defs>
        {play.diagram.assignments.map((assignment) => {
          const player = playerForAssignment(play.diagram, assignment.player_id);
          const primary = player ? isPrimaryPlayer(play.diagram, player.id) : false;
          const color = player ? playerColor(player, primary) : "var(--text-secondary)";
          return (
            <marker
              key={assignment.id}
              id={`${markerPrefix}-${assignment.id}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={assignment.kind === "route" ? "4.1" : "3.5"}
              markerHeight={assignment.kind === "route" ? "4.1" : "3.5"}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          );
        })}
      </defs>

      {play.diagram.assignments.map((assignment) => {
        const player = playerForAssignment(play.diagram, assignment.player_id);
        const primary = player ? isPrimaryPlayer(play.diagram, player.id) : false;
        const color = player ? playerColor(player, primary) : "var(--text-secondary)";
        return (
          <polyline
            key={assignment.id}
            points={polylinePoints(renderedAssignmentPoints(play.diagram, assignment))}
            fill="none"
            stroke={color}
            strokeWidth={assignment.kind === "route" ? 0.82 : 0.58}
            strokeDasharray={assignment.kind === "motion" ? "2.3 1.9" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={assignment.kind === "route" ? 0.9 : 0.58}
            markerEnd={`url(#${markerPrefix}-${assignment.id})`}
          />
        );
      })}

      {play.diagram.players.map((player) => {
        const primary = isPrimaryPlayer(play.diagram, player.id);
        const assignment = personnelByPlayer.get(player.id);
        return (
          <g key={player.id}>
            <circle cx={player.x} cy={player.y} r="3.9" fill={playerColor(player, primary)} className="stroke-background" strokeWidth="0.9" />
            <text x={player.x} y={player.y + 1.02} textAnchor="middle" fill={playerTextColor(primary)} className="text-[2.75px] font-black">
              {playerMarkerLabel(player, assignment, labelMode)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function movePlay(order: string[], playId: string, direction: -1 | 1) {
  const index = order.indexOf(playId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return order;
  const next = [...order];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function personnelCount(play: PlaybookGameDayPlay, personnel: PlayPersonnelAssignment[]) {
  const validPlayerIds = new Set(play.diagram.players.map((player) => player.id));
  return personnel.filter((assignment) => validPlayerIds.has(assignment.player_id)).length;
}

function PrintStyles() {
  return (
    <style>{`
      @page callSheet { size: landscape; margin: 0.34in; }
      @page wristbands { size: portrait; margin: 0.34in; }

      @media print {
        body { background: #fff !important; }
        body * { visibility: hidden !important; }
        .playbook-gameday-print-root,
        .playbook-gameday-print-root * { visibility: visible !important; }
        .playbook-gameday-print-root {
          --background: #ffffff;
          --surface: #ffffff;
          --surface-elevated: #f8fafc;
          --border: #cbd5e1;
          --text-primary: #0f172a;
          --text-secondary: #334155;
          --text-muted: #64748b;
          position: absolute !important;
          inset: 0 auto auto 0 !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .playbook-call-sheet-print { page: callSheet; }
        .playbook-wristband-print { page: wristbands; }
        .playbook-print-card { break-inside: avoid; page-break-inside: avoid; }
      }
    `}</style>
  );
}

export function PlaybookGameDay({ team, plays, onBack }: Props) {
  const [mode, setMode] = useState<OutputMode>("call-sheet");
  const [labelMode, setLabelMode] = useState<LabelMode>("positions");
  const [order, setOrder] = useState<string[]>(() => plays.map((play) => play.id));
  const [included, setIncluded] = useState<Set<string>>(() => new Set(plays.map((play) => play.id)));
  const [personnelByPlay, setPersonnelByPlay] = useState<PersonnelMap>({});
  const [personnelLoading, setPersonnelLoading] = useState(true);

  useEffect(() => {
    const playIds = new Set(plays.map((play) => play.id));
    setOrder((current) => [
      ...current.filter((playId) => playIds.has(playId)),
      ...plays.map((play) => play.id).filter((playId) => !current.includes(playId)),
    ]);
    setIncluded((current) => new Set([
      ...[...current].filter((playId) => playIds.has(playId)),
      ...plays.map((play) => play.id).filter((playId) => !current.has(playId)),
    ]));
  }, [plays]);

  useEffect(() => {
    let cancelled = false;
    setPersonnelLoading(true);
    void Promise.all(
      plays.map(async (play) => [play.id, await getPlayPersonnel(play.team_id, play.id)] as const),
    )
      .then((entries) => {
        if (cancelled) return;
        setPersonnelByPlay(Object.fromEntries(entries));
      })
      .catch(() => {
        if (cancelled) return;
        setPersonnelByPlay({});
        setLabelMode("positions");
      })
      .finally(() => {
        if (!cancelled) setPersonnelLoading(false);
      });
    return () => { cancelled = true; };
  }, [plays]);

  const playById = useMemo(() => new Map(plays.map((play) => [play.id, play])), [plays]);
  const selectedPlays = useMemo(
    () => order.flatMap((playId) => included.has(playId) && playById.has(playId) ? [playById.get(playId)!] : []),
    [included, order, playById],
  );
  const hasAnyPersonnel = Object.values(personnelByPlay).some((assignments) => assignments.length > 0);

  const toggleIncluded = (playId: string) => {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(playId)) next.delete(playId);
      else next.add(playId);
      return next;
    });
  };

  const teamSubtitle = [team.age_group, team.season_label].filter(Boolean).join(" · ");

  return (
    <section className="mx-auto max-w-[1280px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <PrintStyles />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex min-h-10 shrink-0 items-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary">
            <ArrowLeft size={16} />Playbook
          </button>
          <div className="h-7 w-px bg-border" />
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.11em] text-text-muted">Game Day</div>
            <h1 className="truncate text-xl font-extrabold tracking-[-0.025em]">Call sheet + wristbands</h1>
          </div>
        </div>
        <Button onClick={() => window.print()} disabled={!selectedPlays.length}>
          <Printer size={16} />Print / Save PDF
        </Button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Output</div>
            <div className="mt-2 grid grid-cols-2 rounded-md border border-border bg-background p-0.5 text-[10px] font-bold">
              <button type="button" onClick={() => setMode("call-sheet")} className={`min-h-8 rounded-[5px] px-2 ${mode === "call-sheet" ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"}`}>Call Sheet</button>
              <button type="button" onClick={() => setMode("wristbands")} className={`min-h-8 rounded-[5px] px-2 ${mode === "wristbands" ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"}`}>Wristbands</button>
            </div>

            <div className="mt-4 text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Player labels</div>
            <div className="mt-2 grid grid-cols-2 rounded-md border border-border bg-background p-0.5 text-[10px] font-bold">
              <button type="button" onClick={() => setLabelMode("positions")} className={`min-h-8 rounded-[5px] px-2 ${labelMode === "positions" ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"}`}>Positions</button>
              <button type="button" disabled={personnelLoading || !hasAnyPersonnel} onClick={() => setLabelMode("players")} className={`min-h-8 rounded-[5px] px-2 ${labelMode === "players" ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"} disabled:opacity-35`}>Players</button>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-text-muted">
              Players uses saved jersey numbers or initials. Unassigned roles keep their football label.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Play set</div>
                <div className="mt-1 text-xs font-extrabold">{selectedPlays.length} of {plays.length} included</div>
              </div>
              <button type="button" onClick={() => setIncluded(new Set(plays.map((play) => play.id)))} className="text-[9px] font-bold text-text-muted hover:text-text-primary">All</button>
            </div>

            <div className="mt-3 space-y-1.5">
              {order.flatMap((playId, orderIndex) => {
                const play = playById.get(playId);
                if (!play) return [];
                const active = included.has(playId);
                return [(
                  <div key={play.id} className={`grid grid-cols-[28px_minmax(0,1fr)_52px] items-center gap-2 rounded-md border px-2 py-2 ${active ? "border-border bg-background" : "border-border/60 bg-background/45 opacity-55"}`}>
                    <button type="button" onClick={() => toggleIncluded(play.id)} className={`flex h-7 w-7 items-center justify-center rounded-md ${active ? "bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "text-text-muted"}`} aria-label={`${active ? "Exclude" : "Include"} ${play.name}`}>
                      {active ? <Check size={14} /> : <Square size={13} />}
                    </button>
                    <button type="button" onClick={() => toggleIncluded(play.id)} className="min-w-0 text-left">
                      <span className="block truncate text-[10px] font-extrabold text-text-primary">{play.name}</span>
                      <span className="mt-0.5 block truncate text-[8px] text-text-muted">{play.formation || "Custom"}</span>
                    </button>
                    <div className="grid grid-cols-2 gap-0.5">
                      <button type="button" disabled={orderIndex === 0} onClick={() => setOrder((current) => movePlay(current, play.id, -1))} className="flex h-7 items-center justify-center rounded text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-20" aria-label={`Move ${play.name} up`}><ArrowUp size={13} /></button>
                      <button type="button" disabled={orderIndex === order.length - 1} onClick={() => setOrder((current) => movePlay(current, play.id, 1))} className="flex h-7 items-center justify-center rounded text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-20" aria-label={`Move ${play.name} down`}><ArrowDown size={13} /></button>
                    </div>
                  </div>
                )];
              })}
            </div>
          </section>
        </aside>

        <div className="min-w-0">
          {!selectedPlays.length ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
              <ClipboardList size={28} className="text-text-muted" />
              <div className="mt-3 text-sm font-extrabold">Choose at least one play</div>
              <div className="mt-1 max-w-sm text-xs leading-5 text-text-muted">Included Library plays are numbered in the order shown at left.</div>
            </div>
          ) : mode === "call-sheet" ? (
            <div className="playbook-gameday-print-root playbook-call-sheet-print rounded-xl border border-border bg-surface p-4 md:p-5">
              <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-text-muted">fld.LAB · Coach Call Sheet</div>
                  <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">{team.name}</h2>
                  {teamSubtitle && <div className="mt-1 text-[10px] text-text-muted">{teamSubtitle}</div>}
                </div>
                <div className="text-right text-[10px] text-text-muted">{selectedPlays.length} plays · numbered 1–{selectedPlays.length}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 print:grid-cols-2">
                {selectedPlays.map((play, index) => {
                  const personnel = personnelByPlay[play.id] ?? [];
                  const assigned = personnelCount(play, personnel);
                  return (
                    <article key={play.id} className="playbook-print-card grid min-h-[146px] grid-cols-[52px_minmax(0,1fr)_150px] overflow-hidden rounded-lg border border-border bg-background">
                      <div className="flex flex-col items-center border-r border-border px-2 py-3">
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Play</div>
                        <div className="mt-1 text-[28px] font-black leading-none text-text-primary">{index + 1}</div>
                        <div className="mt-auto text-[8px] font-bold uppercase text-text-muted">{play.side}</div>
                      </div>
                      <div className="min-w-0 p-3">
                        <div className="truncate text-sm font-extrabold text-text-primary">{play.name}</div>
                        <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.05em] text-text-muted">{play.formation || "Custom"}</div>
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-text-secondary">
                          <span className="font-bold capitalize">{play.play_type}</span>
                          {play.concept && <span>{play.concept}</span>}
                          {play.situation !== "any" && <span>{SITUATION_LABELS[play.situation]}</span>}
                        </div>
                        <div className="mt-3 text-[8px] text-text-muted">Personnel {assigned}/{play.diagram.players.length}</div>
                        {play.notes && <div className="mt-2 line-clamp-2 text-[8px] leading-3 text-text-muted">{play.notes}</div>}
                      </div>
                      <div className="border-l border-border bg-surface p-1.5">
                        <StaticPlayDiagram play={play} personnel={personnel} labelMode={labelMode} markerPrefix={`call-${play.id}`} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="playbook-gameday-print-root playbook-wristband-print rounded-xl border border-border bg-surface p-4 md:p-5">
              <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-text-muted">fld.LAB · Wristband Cards</div>
                  <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">{team.name}</h2>
                  {teamSubtitle && <div className="mt-1 text-[10px] text-text-muted">{teamSubtitle}</div>}
                </div>
                <div className="text-right text-[10px] text-text-muted">Cut cards after printing</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
                {selectedPlays.map((play, index) => {
                  const personnel = personnelByPlay[play.id] ?? [];
                  return (
                    <article key={play.id} className="playbook-print-card grid aspect-[1.78/1] min-h-[170px] grid-cols-[74px_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-background">
                      <div className="flex flex-col border-r border-border p-3">
                        <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-muted">Play</div>
                        <div className="mt-0.5 text-[30px] font-black leading-none text-text-primary">{index + 1}</div>
                        <div className="mt-3 text-[10px] font-extrabold leading-tight text-text-primary">{play.name}</div>
                        <div className="mt-1 text-[8px] font-bold uppercase leading-3 text-text-muted">{play.formation || "Custom"}</div>
                        <div className="mt-auto text-[8px] text-text-muted">{play.concept || play.play_type}</div>
                      </div>
                      <div className="min-w-0 bg-surface p-1.5">
                        <StaticPlayDiagram play={play} personnel={personnel} labelMode={labelMode} markerPrefix={`wrist-${play.id}`} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
