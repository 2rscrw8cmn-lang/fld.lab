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
type WristbandDensity = 6 | 8 | 12;
type PersonnelMap = Record<string, PlayPersonnelAssignment[]>;

type DiagramBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CALL_SHEET_PAGE_SIZE = 12;
const WRISTBAND_COPIES_PER_PAGE = 8;

const SITUATION_LABELS: Record<PlaySituation, string> = {
  any: "Any",
  short: "Short",
  medium: "Medium",
  deep: "Deep",
  "no-run": "No-run",
  "goal-line": "Goal line",
  conversion: "Conversion",
};

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

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

function expandAxis(minValue: number, maxValue: number, minimumSize: number) {
  let min = minValue;
  let max = maxValue;
  const currentSize = max - min;
  if (currentSize < minimumSize) {
    const padding = (minimumSize - currentSize) / 2;
    min -= padding;
    max += padding;
  }
  if (min < 0) {
    max -= min;
    min = 0;
  }
  if (max > 100) {
    min -= max - 100;
    max = 100;
  }
  return { min: Math.max(0, min), max: Math.min(100, max) };
}

function diagramBounds(play: PlaybookGameDayPlay): DiagramBounds {
  const points: Point[] = [
    ...play.diagram.players.map((player) => ({ x: player.x, y: player.y })),
    ...play.diagram.assignments.flatMap((assignment) => renderedAssignmentPoints(play.diagram, assignment)),
    { x: 50, y: LOS_Y },
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xAxis = expandAxis(Math.min(...xs) - 5, Math.max(...xs) + 5, 48);
  const yAxis = expandAxis(Math.min(...ys) - 5, Math.max(...ys) + 5, 48);
  return {
    x: xAxis.min,
    y: yAxis.min,
    width: xAxis.max - xAxis.min,
    height: yAxis.max - yAxis.min,
  };
}

function CompactPlayDiagram({
  play,
  personnel,
  labelMode,
  markerPrefix,
  tiny = false,
}: {
  play: PlaybookGameDayPlay;
  personnel: PlayPersonnelAssignment[];
  labelMode: LabelMode;
  markerPrefix: string;
  tiny?: boolean;
}) {
  const personnelByPlayer = new Map(personnel.map((assignment) => [assignment.player_id, assignment]));
  const bounds = diagramBounds(play);
  const viewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
  const labelX = bounds.x + 1.6;

  return (
    <svg viewBox={viewBox} className="h-full w-full" role="img" aria-label={`${play.name} play diagram`} preserveAspectRatio="xMidYMid meet">
      <line
        x1={bounds.x}
        y1={LOS_Y}
        x2={bounds.x + bounds.width}
        y2={LOS_Y}
        stroke="#64748b"
        strokeWidth={tiny ? 0.68 : 0.78}
        opacity="0.82"
      />
      <text x={labelX} y={LOS_Y - 1.5} fill="#64748b" fontSize={tiny ? 2.1 : 2.35} fontWeight="800">LOS</text>
      {bounds.y <= 55 && bounds.y + bounds.height >= 55 && (
        <line
          x1={bounds.x}
          y1="55"
          x2={bounds.x + bounds.width}
          y2="55"
          stroke="#cbd5e1"
          strokeWidth="0.4"
          strokeDasharray="2 2"
        />
      )}

      <defs>
        {play.diagram.assignments.map((assignment) => {
          const player = playerForAssignment(play.diagram, assignment.player_id);
          const primary = player ? isPrimaryPlayer(play.diagram, player.id) : false;
          const color = player ? playerColor(player, primary) : "#64748b";
          const markerSize = tiny ? (assignment.kind === "route" ? 3.5 : 3) : assignment.kind === "route" ? 4.1 : 3.4;
          return (
            <marker
              key={assignment.id}
              id={`${markerPrefix}-${assignment.id}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={markerSize}
              markerHeight={markerSize}
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
        const color = player ? playerColor(player, primary) : "#64748b";
        return (
          <polyline
            key={assignment.id}
            points={polylinePoints(renderedAssignmentPoints(play.diagram, assignment))}
            fill="none"
            stroke={color}
            strokeWidth={tiny ? (assignment.kind === "route" ? 0.82 : 0.58) : assignment.kind === "route" ? 0.95 : 0.65}
            strokeDasharray={assignment.kind === "motion" ? "2.2 1.7" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={assignment.kind === "route" ? 0.96 : 0.62}
            markerEnd={`url(#${markerPrefix}-${assignment.id})`}
          />
        );
      })}

      {play.diagram.players.map((player) => {
        const primary = isPrimaryPlayer(play.diagram, player.id);
        const assignment = personnelByPlayer.get(player.id);
        const radius = tiny ? 2.8 : 3.2;
        return (
          <g key={player.id}>
            <circle cx={player.x} cy={player.y} r={radius} fill={playerColor(player, primary)} stroke="#ffffff" strokeWidth={tiny ? 0.72 : 0.8} />
            <text
              x={player.x}
              y={player.y + (tiny ? 0.78 : 0.88)}
              textAnchor="middle"
              fill={playerTextColor(primary)}
              fontSize={tiny ? 2.15 : 2.35}
              fontWeight="900"
            >
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

function BrandMark({ className = "h-6" }: { className?: string }) {
  return <img src="/brand/fld-lab-horizontal-print.svg" alt="fld.LAB" className={`${className} w-auto`} />;
}

function PrintStyles() {
  return (
    <style>{`
      @page callSheet { size: letter landscape; margin: 0.22in; }
      @page wristbands { size: letter portrait; margin: 0.28in; }

      @media print {
        body { background: #fff !important; }
        body * { visibility: hidden !important; }
        .playbook-gameday-print-root,
        .playbook-gameday-print-root * { visibility: visible !important; }
        .playbook-gameday-print-root {
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
        .playbook-call-page {
          page: callSheet;
          break-after: page;
          box-shadow: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          padding: 0 !important;
        }
        .playbook-call-page:last-child { break-after: auto; }
        .playbook-wristband-page {
          page: wristbands;
          break-after: page;
          box-shadow: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          padding: 0 !important;
        }
        .playbook-wristband-page:last-child { break-after: auto; }
        .playbook-print-card,
        .playbook-wristband-insert { break-inside: avoid; page-break-inside: avoid; }
        .playbook-wristband-insert { aspect-ratio: 1.62 / 1; }
      }
    `}</style>
  );
}

function CallSheetHeader({ team, teamSubtitle, playCount, page, pageCount }: {
  team: Team;
  teamSubtitle: string;
  playCount: number;
  page: number;
  pageCount: number;
}) {
  return (
    <header className="flex items-center justify-between gap-5 border-b-2 border-[#7c3aed] pb-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark className="h-[25px]" />
        <div className="h-8 w-px bg-[#cbd5e1]" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-black tracking-[-0.02em] text-[#0f172a]">{team.name}</div>
          {teamSubtitle && <div className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#64748b]">{teamSubtitle}</div>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[8px] font-black uppercase tracking-[0.14em] text-[#7c3aed]">Coach Call Sheet</div>
        <div className="mt-1 text-[7px] font-semibold text-[#64748b]">{playCount} plays{pageCount > 1 ? ` · page ${page}/${pageCount}` : ""}</div>
      </div>
    </header>
  );
}

function CallSheetCard({
  play,
  number,
  personnel,
  labelMode,
}: {
  play: PlaybookGameDayPlay;
  number: number;
  personnel: PlayPersonnelAssignment[];
  labelMode: LabelMode;
}) {
  const meta = [
    play.formation || "Custom",
    play.play_type.charAt(0).toUpperCase() + play.play_type.slice(1),
    play.concept || null,
    play.situation !== "any" ? SITUATION_LABELS[play.situation] : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <article className="playbook-print-card grid min-h-[142px] grid-cols-[34px_minmax(0,1fr)_112px] overflow-hidden rounded-[6px] border border-[#cbd5e1] bg-white text-[#0f172a]">
      <div className="flex flex-col items-center border-r border-[#e2e8f0] bg-[#f8fafc] px-1 py-2">
        <div className="text-[6px] font-black uppercase tracking-[0.12em] text-[#7c3aed]">Play</div>
        <div className="mt-0.5 text-[22px] font-black leading-none text-[#0f172a]">{number}</div>
        <div className="mt-auto text-[5.5px] font-black uppercase tracking-[0.05em] text-[#64748b]">{play.side === "offense" ? "OFF" : "DEF"}</div>
      </div>
      <div className="min-w-0 p-2.5">
        <div className="truncate text-[11px] font-black leading-tight text-[#0f172a]">{play.name}</div>
        <div className="mt-1 line-clamp-2 text-[6.5px] font-bold uppercase leading-[1.35] tracking-[0.045em] text-[#64748b]">{meta.join(" · ")}</div>
        {play.notes ? (
          <div className="mt-2 border-t border-[#e2e8f0] pt-1.5 text-[6.5px] font-medium leading-[1.35] text-[#475569] line-clamp-3">{play.notes}</div>
        ) : (
          <div className="mt-2 border-t border-[#e2e8f0] pt-1.5 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">No coaching note</div>
        )}
      </div>
      <div className="min-w-0 border-l border-[#e2e8f0] bg-[#f8fafc] p-1.5">
        <CompactPlayDiagram play={play} personnel={personnel} labelMode={labelMode} markerPrefix={`call-${play.id}-${number}`} />
      </div>
    </article>
  );
}

function CallSheetOutput({
  team,
  teamSubtitle,
  plays,
  personnelByPlay,
  labelMode,
}: {
  team: Team;
  teamSubtitle: string;
  plays: PlaybookGameDayPlay[];
  personnelByPlay: PersonnelMap;
  labelMode: LabelMode;
}) {
  const pages = chunk(plays, CALL_SHEET_PAGE_SIZE);
  return (
    <div className="playbook-gameday-print-root space-y-4">
      {pages.map((pagePlays, pageIndex) => (
        <section key={`call-page-${pageIndex}`} className="playbook-call-page rounded-lg border border-[#cbd5e1] bg-white p-4 text-[#0f172a] shadow-sm">
          <CallSheetHeader team={team} teamSubtitle={teamSubtitle} playCount={plays.length} page={pageIndex + 1} pageCount={pages.length} />
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {pagePlays.map((play, index) => (
              <CallSheetCard
                key={play.id}
                play={play}
                number={(pageIndex * CALL_SHEET_PAGE_SIZE) + index + 1}
                personnel={personnelByPlay[play.id] ?? []}
                labelMode={labelMode}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function wristbandGridClass(density: WristbandDensity) {
  if (density === 12) return "grid-cols-3 grid-rows-4";
  if (density === 8) return "grid-cols-2 grid-rows-4";
  return "grid-cols-2 grid-rows-3";
}

function WristbandPlayCell({
  play,
  number,
  personnel,
  labelMode,
  density,
  copyIndex,
}: {
  play: PlaybookGameDayPlay | null;
  number: number;
  personnel: PlayPersonnelAssignment[];
  labelMode: LabelMode;
  density: WristbandDensity;
  copyIndex: number;
}) {
  if (!play) return <div className="border border-[#e2e8f0] bg-[#f8fafc]/40" />;
  const compactText = density === 12;
  return (
    <article className="min-h-0 overflow-hidden border border-[#cbd5e1] bg-white">
      <div className="flex h-[22%] min-h-[13px] items-center gap-1 border-b border-[#e2e8f0] px-1">
        <span className={`flex shrink-0 items-center justify-center rounded-[2px] bg-[#7c3aed] font-black leading-none text-white ${compactText ? "h-3.5 min-w-3.5 px-0.5 text-[5px]" : "h-4 min-w-4 px-0.5 text-[6px]"}`}>{number}</span>
        <span className={`min-w-0 flex-1 truncate font-black text-[#0f172a] ${compactText ? "text-[5.5px]" : "text-[6.5px]"}`}>{play.name}</span>
        <span className={`shrink-0 truncate font-bold uppercase text-[#64748b] ${compactText ? "max-w-[32%] text-[4.5px]" : "max-w-[34%] text-[5px]"}`}>{play.formation || "Custom"}</span>
      </div>
      <div className="h-[78%] min-h-0 p-0.5">
        <CompactPlayDiagram
          play={play}
          personnel={personnel}
          labelMode={labelMode}
          markerPrefix={`wrist-${play.id}-${number}-${copyIndex}`}
          tiny
        />
      </div>
    </article>
  );
}

function WristbandInsert({
  team,
  teamSubtitle,
  plays,
  startNumber,
  personnelByPlay,
  labelMode,
  density,
  setNumber,
  setCount,
  copyIndex,
}: {
  team: Team;
  teamSubtitle: string;
  plays: PlaybookGameDayPlay[];
  startNumber: number;
  personnelByPlay: PersonnelMap;
  labelMode: LabelMode;
  density: WristbandDensity;
  setNumber: number;
  setCount: number;
  copyIndex: number;
}) {
  const slots = Array.from({ length: density }, (_, index) => plays[index] ?? null);
  const endNumber = startNumber + plays.length - 1;
  return (
    <section className="playbook-wristband-insert flex aspect-[1.62/1] min-h-0 flex-col overflow-hidden rounded-[5px] border border-dashed border-[#94a3b8] bg-white p-1.5 text-[#0f172a]">
      <header className="flex h-[20px] shrink-0 items-center justify-between gap-2 border-b border-[#cbd5e1] pb-1">
        <BrandMark className="h-[14px]" />
        <div className="min-w-0 text-right">
          <div className="truncate text-[6px] font-black uppercase tracking-[0.06em] text-[#0f172a]">{team.name}</div>
          <div className="text-[4.5px] font-bold uppercase tracking-[0.06em] text-[#64748b]">
            {teamSubtitle ? `${teamSubtitle} · ` : ""}{setCount > 1 ? `Set ${setNumber}/${setCount} · ` : ""}{startNumber}–{endNumber}
          </div>
        </div>
      </header>
      <div className={`mt-1 grid min-h-0 flex-1 ${wristbandGridClass(density)}`}>
        {slots.map((play, index) => (
          <WristbandPlayCell
            key={`${copyIndex}-${index}-${play?.id ?? "blank"}`}
            play={play}
            number={startNumber + index}
            personnel={play ? personnelByPlay[play.id] ?? [] : []}
            labelMode={labelMode}
            density={density}
            copyIndex={copyIndex}
          />
        ))}
      </div>
    </section>
  );
}

function WristbandOutput({
  team,
  teamSubtitle,
  plays,
  personnelByPlay,
  labelMode,
  density,
}: {
  team: Team;
  teamSubtitle: string;
  plays: PlaybookGameDayPlay[];
  personnelByPlay: PersonnelMap;
  labelMode: LabelMode;
  density: WristbandDensity;
}) {
  const sets = chunk(plays, density);
  return (
    <div className="playbook-gameday-print-root space-y-4">
      {sets.map((setPlays, setIndex) => (
        <section key={`wrist-page-${setIndex}`} className="playbook-wristband-page grid grid-cols-2 gap-2 rounded-lg border border-[#cbd5e1] bg-white p-3 shadow-sm">
          {Array.from({ length: WRISTBAND_COPIES_PER_PAGE }, (_, copyIndex) => (
            <WristbandInsert
              key={`wrist-copy-${setIndex}-${copyIndex}`}
              team={team}
              teamSubtitle={teamSubtitle}
              plays={setPlays}
              startNumber={(setIndex * density) + 1}
              personnelByPlay={personnelByPlay}
              labelMode={labelMode}
              density={density}
              setNumber={setIndex + 1}
              setCount={sets.length}
              copyIndex={copyIndex}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export function PlaybookGameDay({ team, plays, onBack }: Props) {
  const [mode, setMode] = useState<OutputMode>("call-sheet");
  const [labelMode, setLabelMode] = useState<LabelMode>("positions");
  const [wristbandDensity, setWristbandDensity] = useState<WristbandDensity>(6);
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
  const selectedNumberById = useMemo(() => new Map(selectedPlays.map((play, index) => [play.id, index + 1])), [selectedPlays]);
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
    <section className="mx-auto max-w-[1440px] px-3 pb-8 pt-3 sm:px-4 md:px-6 md:pt-5">
      <PrintStyles />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex min-h-10 shrink-0 items-center gap-2 text-xs font-bold text-text-muted hover:text-text-primary">
            <ArrowLeft size={16} />Playbook
          </button>
          <div className="h-7 w-px bg-border" />
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.11em] text-text-muted">Game Day</div>
            <h1 className="truncate text-xl font-extrabold tracking-[-0.025em]">Call sheets + wristbands</h1>
          </div>
        </div>
        <Button onClick={() => window.print()} disabled={!selectedPlays.length}>
          <Printer size={16} />Print / Save PDF
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="space-y-3">
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

            {mode === "wristbands" && (
              <>
                <div className="mt-4 text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Plays per insert</div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {([6, 8, 12] as WristbandDensity[]).map((density) => (
                    <button key={density} type="button" onClick={() => setWristbandDensity(density)} className={`min-h-8 rounded-md border text-[10px] font-extrabold ${wristbandDensity === density ? "border-[rgba(124,58,237,0.48)] bg-[rgba(124,58,237,0.14)] text-[#c4b5fd]" : "border-border bg-background text-text-muted hover:text-text-primary"}`}>{density}</button>
                  ))}
                </div>
                <p className="mt-2 text-[9px] leading-4 text-text-muted">Each printed page makes 8 identical cut-ready inserts. Larger play sets continue onto another insert set.</p>
              </>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-muted">Play set</div>
                <div className="mt-1 text-xs font-extrabold">{selectedPlays.length} of {plays.length} included</div>
              </div>
              <div className="flex gap-2 text-[8px] font-bold">
                <button type="button" onClick={() => setIncluded(new Set(plays.map((play) => play.id)))} className="text-[#c4b5fd] hover:text-text-primary">Include all</button>
                <button type="button" onClick={() => setIncluded(new Set())} className="text-text-muted hover:text-text-primary">Clear</button>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              {order.flatMap((playId, orderIndex) => {
                const play = playById.get(playId);
                if (!play) return [];
                const active = included.has(playId);
                const selectedNumber = selectedNumberById.get(play.id);
                return [(
                  <div key={play.id} className={`grid grid-cols-[26px_24px_minmax(0,1fr)_44px] items-center gap-1.5 rounded-md border px-1.5 py-1.5 ${active ? "border-border bg-background" : "border-border/60 bg-background/45 opacity-55"}`}>
                    <button type="button" onClick={() => toggleIncluded(play.id)} className={`flex h-6 w-6 items-center justify-center rounded ${active ? "bg-[rgba(124,58,237,0.16)] text-[#c4b5fd]" : "text-text-muted"}`} aria-label={`${active ? "Exclude" : "Include"} ${play.name}`}>
                      {active ? <Check size={13} /> : <Square size={12} />}
                    </button>
                    <span className={`text-center text-[11px] font-black tabular-nums ${active ? "text-text-primary" : "text-text-muted"}`}>{selectedNumber ?? "—"}</span>
                    <button type="button" onClick={() => toggleIncluded(play.id)} className="min-w-0 text-left">
                      <span className="block truncate text-[9px] font-extrabold text-text-primary">{play.name}</span>
                      <span className="mt-0.5 block truncate text-[7px] text-text-muted">{play.formation || "Custom"}{play.situation !== "any" ? ` · ${SITUATION_LABELS[play.situation]}` : ""}</span>
                    </button>
                    <div className="grid grid-cols-2 gap-0.5">
                      <button type="button" disabled={orderIndex === 0} onClick={() => setOrder((current) => movePlay(current, play.id, -1))} className="flex h-6 items-center justify-center rounded text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-20" aria-label={`Move ${play.name} up`}><ArrowUp size={12} /></button>
                      <button type="button" disabled={orderIndex === order.length - 1} onClick={() => setOrder((current) => movePlay(current, play.id, 1))} className="flex h-6 items-center justify-center rounded text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-20" aria-label={`Move ${play.name} down`}><ArrowDown size={12} /></button>
                    </div>
                  </div>
                )];
              })}
            </div>
          </section>
        </aside>

        <div className="min-w-0 overflow-x-auto rounded-xl bg-[#e2e8f0] p-3 md:p-4">
          {!selectedPlays.length ? (
            <div className="flex min-h-[520px] min-w-[720px] flex-col items-center justify-center bg-white p-8 text-center text-[#0f172a]">
              <ClipboardList size={28} className="text-[#94a3b8]" />
              <div className="mt-3 text-sm font-extrabold">Choose at least one play</div>
              <div className="mt-1 max-w-sm text-xs leading-5 text-[#64748b]">Included Library plays are numbered in the order shown at left.</div>
            </div>
          ) : mode === "call-sheet" ? (
            <div className="min-w-[940px]">
              <CallSheetOutput team={team} teamSubtitle={teamSubtitle} plays={selectedPlays} personnelByPlay={personnelByPlay} labelMode={labelMode} />
            </div>
          ) : (
            <div className="mx-auto min-w-[720px] max-w-[860px]">
              <WristbandOutput team={team} teamSubtitle={teamSubtitle} plays={selectedPlays} personnelByPlay={personnelByPlay} labelMode={labelMode} density={wristbandDensity} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
