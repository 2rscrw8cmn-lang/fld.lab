import { getActivePlaybookContext, type PlaybookFormat } from "@/features/playbook/playbook-context";

export type PlaySide = "offense" | "defense";
export type AssignmentKind = "route" | "motion";
export type RouteTemplate = "go" | "slant" | "out" | "in" | "post" | "corner" | "hitch" | "drag" | "wheel";

export type Point = { x: number; y: number };
export type DiagramPlayer = Point & { id: string; label: string };
export type DiagramAssignment = {
  id: string;
  player_id: string;
  kind: AssignmentKind;
  template?: RouteTemplate;
  points: Point[];
};

export type PlayDiagram = {
  schema_version: 2;
  players: DiagramPlayer[];
  assignments: DiagramAssignment[];
  primary_target_player_id: string | null;
};

export type FormationPlayer = Omit<DiagramPlayer, "id">;
export type FormationPreset = {
  id: string;
  name: string;
  side: PlaySide;
  format: PlaybookFormat;
  players: FormationPlayer[];
};

export const LOS_Y = 76;

const clamp = (value: number, min = 5, max = 95) => Math.max(min, Math.min(max, value));
const point = (x: number, y: number): Point => ({ x: clamp(x), y: clamp(y) });

export function constrainPlayerPoint(side: PlaySide, candidate: Point): Point {
  const normalized = point(candidate.x, candidate.y);
  return {
    x: normalized.x,
    y: side === "offense"
      ? Math.max(LOS_Y, normalized.y)
      : Math.min(LOS_Y, normalized.y),
  };
}

export const ROUTE_TEMPLATES: Array<{ id: RouteTemplate; label: string; short: string }> = [
  { id: "go", label: "Go", short: "GO" },
  { id: "slant", label: "Slant", short: "SL" },
  { id: "out", label: "Out", short: "OUT" },
  { id: "in", label: "In", short: "IN" },
  { id: "post", label: "Post", short: "POST" },
  { id: "corner", label: "Corner", short: "COR" },
  { id: "hitch", label: "Hitch", short: "HIT" },
  { id: "drag", label: "Drag", short: "DRAG" },
  { id: "wheel", label: "Wheel", short: "WHL" },
];

const FIVE_V_FIVE_FORMATIONS: FormationPreset[] = [
  {
    id: "spread",
    name: "Spread",
    side: "offense",
    format: "5v5",
    players: [
      { label: "X", x: 12, y: 77 },
      { label: "C", x: 50, y: 77 },
      { label: "Z", x: 88, y: 77 },
      { label: "Y", x: 70, y: 86 },
      { label: "QB", x: 50, y: 91 },
    ],
  },
  {
    id: "trips-right",
    name: "Trips Right",
    side: "offense",
    format: "5v5",
    players: [
      { label: "X", x: 13, y: 77 },
      { label: "C", x: 46, y: 77 },
      { label: "Y", x: 66, y: 77 },
      { label: "Z", x: 83, y: 77 },
      { label: "QB", x: 46, y: 91 },
    ],
  },
  {
    id: "trips-left",
    name: "Trips Left",
    side: "offense",
    format: "5v5",
    players: [
      { label: "Z", x: 17, y: 77 },
      { label: "Y", x: 34, y: 77 },
      { label: "C", x: 54, y: 77 },
      { label: "X", x: 87, y: 77 },
      { label: "QB", x: 54, y: 91 },
    ],
  },
  {
    id: "bunch-right",
    name: "Bunch Right",
    side: "offense",
    format: "5v5",
    players: [
      { label: "X", x: 14, y: 77 },
      { label: "C", x: 48, y: 77 },
      { label: "Y", x: 64, y: 78 },
      { label: "Z", x: 70, y: 84 },
      { label: "QB", x: 48, y: 91 },
    ],
  },
  {
    id: "bunch-left",
    name: "Bunch Left",
    side: "offense",
    format: "5v5",
    players: [
      { label: "Z", x: 30, y: 84 },
      { label: "Y", x: 36, y: 78 },
      { label: "C", x: 52, y: 77 },
      { label: "X", x: 86, y: 77 },
      { label: "QB", x: 52, y: 91 },
    ],
  },
  {
    id: "stack-right",
    name: "Stack Right",
    side: "offense",
    format: "5v5",
    players: [
      { label: "X", x: 14, y: 77 },
      { label: "C", x: 46, y: 77 },
      { label: "Y", x: 77, y: 77 },
      { label: "Z", x: 77, y: 86 },
      { label: "QB", x: 46, y: 91 },
    ],
  },
  {
    id: "stack-left",
    name: "Stack Left",
    side: "offense",
    format: "5v5",
    players: [
      { label: "Z", x: 23, y: 86 },
      { label: "Y", x: 23, y: 77 },
      { label: "C", x: 54, y: 77 },
      { label: "X", x: 86, y: 77 },
      { label: "QB", x: 54, y: 91 },
    ],
  },
  {
    id: "custom-offense",
    name: "Custom",
    side: "offense",
    format: "5v5",
    players: [
      { label: "X", x: 14, y: 77 },
      { label: "C", x: 50, y: 77 },
      { label: "Z", x: 86, y: 77 },
      { label: "Y", x: 68, y: 86 },
      { label: "QB", x: 50, y: 91 },
    ],
  },
  {
    id: "defense-man",
    name: "Man",
    side: "defense",
    format: "5v5",
    players: [
      { label: "L", x: 14, y: 60 },
      { label: "M", x: 34, y: 56 },
      { label: "S", x: 66, y: 56 },
      { label: "R", x: 86, y: 60 },
      { label: "D", x: 50, y: 43 },
    ],
  },
  {
    id: "defense-shell",
    name: "Zone Shell",
    side: "defense",
    format: "5v5",
    players: [
      { label: "L", x: 18, y: 52 },
      { label: "M", x: 38, y: 46 },
      { label: "S", x: 62, y: 46 },
      { label: "R", x: 82, y: 52 },
      { label: "D", x: 50, y: 34 },
    ],
  },
];

const SIX_V_SIX_FORMATIONS: FormationPreset[] = [
  {
    id: "spread-6",
    name: "Spread",
    side: "offense",
    format: "6v6",
    players: [
      { label: "X", x: 10, y: 77 },
      { label: "C", x: 50, y: 77 },
      { label: "Z", x: 90, y: 77 },
      { label: "H", x: 31, y: 85 },
      { label: "Y", x: 69, y: 85 },
      { label: "QB", x: 50, y: 92 },
    ],
  },
  {
    id: "trips-right-6",
    name: "Trips Right",
    side: "offense",
    format: "6v6",
    players: [
      { label: "X", x: 10, y: 77 },
      { label: "C", x: 43, y: 77 },
      { label: "H", x: 62, y: 77 },
      { label: "Y", x: 76, y: 82 },
      { label: "Z", x: 90, y: 77 },
      { label: "QB", x: 43, y: 92 },
    ],
  },
  {
    id: "trips-left-6",
    name: "Trips Left",
    side: "offense",
    format: "6v6",
    players: [
      { label: "Z", x: 10, y: 77 },
      { label: "Y", x: 24, y: 82 },
      { label: "H", x: 38, y: 77 },
      { label: "C", x: 57, y: 77 },
      { label: "X", x: 90, y: 77 },
      { label: "QB", x: 57, y: 92 },
    ],
  },
  {
    id: "bunch-right-6",
    name: "Bunch Right",
    side: "offense",
    format: "6v6",
    players: [
      { label: "X", x: 10, y: 77 },
      { label: "C", x: 45, y: 77 },
      { label: "H", x: 65, y: 78 },
      { label: "Y", x: 72, y: 84 },
      { label: "Z", x: 82, y: 79 },
      { label: "QB", x: 45, y: 92 },
    ],
  },
  {
    id: "bunch-left-6",
    name: "Bunch Left",
    side: "offense",
    format: "6v6",
    players: [
      { label: "Z", x: 18, y: 79 },
      { label: "Y", x: 28, y: 84 },
      { label: "H", x: 35, y: 78 },
      { label: "C", x: 55, y: 77 },
      { label: "X", x: 90, y: 77 },
      { label: "QB", x: 55, y: 92 },
    ],
  },
  {
    id: "stack-right-6",
    name: "Stack Right",
    side: "offense",
    format: "6v6",
    players: [
      { label: "X", x: 10, y: 77 },
      { label: "C", x: 43, y: 77 },
      { label: "H", x: 69, y: 77 },
      { label: "Y", x: 82, y: 77 },
      { label: "Z", x: 82, y: 86 },
      { label: "QB", x: 43, y: 92 },
    ],
  },
  {
    id: "stack-left-6",
    name: "Stack Left",
    side: "offense",
    format: "6v6",
    players: [
      { label: "Z", x: 18, y: 86 },
      { label: "Y", x: 18, y: 77 },
      { label: "H", x: 31, y: 77 },
      { label: "C", x: 57, y: 77 },
      { label: "X", x: 90, y: 77 },
      { label: "QB", x: 57, y: 92 },
    ],
  },
  {
    id: "custom-offense-6",
    name: "Custom",
    side: "offense",
    format: "6v6",
    players: [
      { label: "X", x: 10, y: 77 },
      { label: "C", x: 50, y: 77 },
      { label: "Z", x: 90, y: 77 },
      { label: "H", x: 31, y: 85 },
      { label: "Y", x: 69, y: 85 },
      { label: "QB", x: 50, y: 92 },
    ],
  },
  {
    id: "defense-man-6",
    name: "Man",
    side: "defense",
    format: "6v6",
    players: [
      { label: "L", x: 10, y: 60 },
      { label: "M", x: 28, y: 55 },
      { label: "N", x: 45, y: 52 },
      { label: "S", x: 62, y: 52 },
      { label: "R", x: 86, y: 60 },
      { label: "D", x: 50, y: 39 },
    ],
  },
  {
    id: "defense-shell-6",
    name: "Zone Shell",
    side: "defense",
    format: "6v6",
    players: [
      { label: "L", x: 13, y: 53 },
      { label: "M", x: 31, y: 47 },
      { label: "N", x: 46, y: 45 },
      { label: "S", x: 64, y: 47 },
      { label: "R", x: 84, y: 53 },
      { label: "D", x: 50, y: 32 },
    ],
  },
];

export const FORMATIONS: FormationPreset[] = [...FIVE_V_FIVE_FORMATIONS, ...SIX_V_SIX_FORMATIONS];

const mirroredFormationIds: Record<string, string> = {
  "trips-right": "trips-left",
  "trips-left": "trips-right",
  "bunch-right": "bunch-left",
  "bunch-left": "bunch-right",
  "stack-right": "stack-left",
  "stack-left": "stack-right",
  "trips-right-6": "trips-left-6",
  "trips-left-6": "trips-right-6",
  "bunch-right-6": "bunch-left-6",
  "bunch-left-6": "bunch-right-6",
  "stack-right-6": "stack-left-6",
  "stack-left-6": "stack-right-6",
};

export function formationById(formationId: string | null | undefined) {
  return FORMATIONS.find((formation) => formation.id === formationId) ?? null;
}

export function formationsForSide(side: PlaySide, format: PlaybookFormat = getActivePlaybookContext()?.format ?? "5v5") {
  return FORMATIONS.filter((formation) => formation.side === side && formation.format === format);
}

export function defaultFormationId(format: PlaybookFormat, side: PlaySide = "offense") {
  return formationsForSide(side, format)[0]?.id ?? (side === "offense" ? "spread" : "defense-man");
}

export function createFormationPlayers(formationId: string, makeId: (prefix: string) => string): DiagramPlayer[] {
  const formation = formationById(formationId) ?? FORMATIONS[0];
  return formation.players.map((player) => ({ ...player, id: makeId("player") }));
}

function insideSign(start: Point) {
  return start.x < 50 ? 1 : -1;
}

function outsideSign(start: Point) {
  return -insideSign(start);
}

function requestedSign(start: Point, requestedEnd: Point, semantic: "inside" | "outside") {
  if (Math.abs(start.x - 50) <= 5) {
    return Math.sign(requestedEnd.x - start.x) || 1;
  }
  return semantic === "inside" ? insideSign(start) : outsideSign(start);
}

function forceHorizontalDirection(start: Point, requestedEnd: Point, semantic: "inside" | "outside") {
  const sign = requestedSign(start, requestedEnd, semantic);
  const distance = Math.max(5, Math.abs(requestedEnd.x - start.x));
  return clamp(start.x + sign * distance);
}

function upfieldY(start: Point, requestedEnd: Point, minimumDepth: number) {
  return clamp(Math.min(requestedEnd.y, start.y - minimumDepth));
}

function semanticRouteEnd(template: RouteTemplate, start: Point, requestedEnd: Point): Point {
  switch (template) {
    case "go":
      return point(start.x, upfieldY(start, requestedEnd, 8));
    case "slant":
      return point(forceHorizontalDirection(start, requestedEnd, "inside"), upfieldY(start, requestedEnd, 7));
    case "out":
      return point(forceHorizontalDirection(start, requestedEnd, "outside"), upfieldY(start, requestedEnd, 8));
    case "in":
      return point(forceHorizontalDirection(start, requestedEnd, "inside"), upfieldY(start, requestedEnd, 8));
    case "post":
      return point(forceHorizontalDirection(start, requestedEnd, "inside"), upfieldY(start, requestedEnd, 15));
    case "corner":
      return point(forceHorizontalDirection(start, requestedEnd, "outside"), upfieldY(start, requestedEnd, 15));
    case "hitch":
      return point(forceHorizontalDirection(start, requestedEnd, "inside"), upfieldY(start, requestedEnd, 7));
    case "drag":
      return point(forceHorizontalDirection(start, requestedEnd, "inside"), upfieldY(start, requestedEnd, 4));
    case "wheel":
      return point(forceHorizontalDirection(start, requestedEnd, "outside"), upfieldY(start, requestedEnd, 24));
  }
}

export function defaultRouteEnd(template: RouteTemplate, start: Point): Point {
  const inside = insideSign(start);
  const outside = outsideSign(start);

  switch (template) {
    case "go": return point(start.x, start.y - 34);
    case "slant": return point(start.x + inside * 19, start.y - 20);
    case "out": return point(start.x + outside * 23, start.y - 18);
    case "in": return point(start.x + inside * 26, start.y - 18);
    case "post": return point(start.x + inside * 21, start.y - 35);
    case "corner": return point(start.x + outside * 23, start.y - 35);
    case "hitch": return point(start.x + inside * 5, start.y - 11);
    case "drag": return point(start.x + inside * 33, start.y - 8);
    case "wheel": return point(start.x + outside * 22, start.y - 35);
  }
}

function cubicBezierPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const inverse = 1 - t;
  const x = (inverse ** 3 * start.x)
    + (3 * inverse ** 2 * t * control1.x)
    + (3 * inverse * t ** 2 * control2.x)
    + (t ** 3 * end.x);
  const y = (inverse ** 3 * start.y)
    + (3 * inverse ** 2 * t * control1.y)
    + (3 * inverse * t ** 2 * control2.y)
    + (t ** 3 * end.y);
  return point(x, y);
}

function buildWheelCurve(start: Point, end: Point): Point[] {
  const normalizedStart = point(start.x, start.y);
  const direction = Math.sign(end.x - start.x) || outsideSign(start);
  const horizontalDistance = Math.max(10, Math.abs(end.x - start.x));
  const control1 = point(
    start.x + direction * Math.min(16, horizontalDistance * 0.7),
    start.y,
  );
  const control2 = point(
    end.x,
    Math.max(end.y + 7, start.y - 4),
  );

  return Array.from({ length: 8 }, (_, index) => (
    cubicBezierPoint(normalizedStart, control1, control2, end, index / 7)
  ));
}

export function buildRoutePoints(template: RouteTemplate, start: Point, requestedEnd?: Point): Point[] {
  const end = requestedEnd
    ? semanticRouteEnd(template, start, point(requestedEnd.x, requestedEnd.y))
    : defaultRouteEnd(template, start);
  const normalizedStart = point(start.x, start.y);

  switch (template) {
    case "go":
      return [normalizedStart, point(start.x, end.y)];
    case "slant":
    case "drag":
      return [normalizedStart, end];
    case "out":
    case "in":
      return [normalizedStart, point(start.x, end.y), end];
    case "post":
    case "corner": {
      const cutY = start.y + (end.y - start.y) * 0.58;
      return [normalizedStart, point(start.x, cutY), end];
    }
    case "hitch":
      return [normalizedStart, point(start.x, end.y - 5), end];
    case "wheel":
      return buildWheelCurve(normalizedStart, end);
  }
}

export function defaultMotionEnd(start: Point) {
  return point(start.x + insideSign(start) * 30, start.y);
}

export function buildMotionPoints(start: Point, requestedEnd?: Point): Point[] {
  return [point(start.x, start.y), requestedEnd ? point(requestedEnd.x, requestedEnd.y) : defaultMotionEnd(start)];
}

export function shiftAssignment(assignment: DiagramAssignment, dx: number, dy: number): DiagramAssignment {
  return {
    ...assignment,
    points: assignment.points.map((candidate) => point(candidate.x + dx, candidate.y + dy)),
  };
}

export function flipDiagram(diagram: PlayDiagram): PlayDiagram {
  return {
    ...diagram,
    players: diagram.players.map((player) => ({ ...player, x: 100 - player.x })),
    assignments: diagram.assignments.map((assignment) => ({
      ...assignment,
      points: assignment.points.map((candidate) => ({ ...candidate, x: 100 - candidate.x })),
    })),
  };
}

export function mirroredFormationId(formationId: string | null | undefined) {
  if (!formationId) return formationId ?? null;
  return mirroredFormationIds[formationId] ?? formationId;
}

export function assignmentEnd(assignment: DiagramAssignment): Point {
  return assignment.points[assignment.points.length - 1] ?? { x: 50, y: 50 };
}

export function replacePlayerRoute(
  diagram: PlayDiagram,
  playerId: string,
  template: RouteTemplate,
  makeId: (prefix: string) => string,
): PlayDiagram {
  const player = diagram.players.find((candidate) => candidate.id === playerId);
  if (!player) return diagram;
  const route: DiagramAssignment = {
    id: makeId("assignment"),
    player_id: playerId,
    kind: "route",
    template,
    points: buildRoutePoints(template, player),
  };
  return {
    ...diagram,
    assignments: [...diagram.assignments.filter((assignment) => !(assignment.player_id === playerId && assignment.kind === "route")), route],
  };
}

export function replacePlayerMotion(
  diagram: PlayDiagram,
  playerId: string,
  makeId: (prefix: string) => string,
): PlayDiagram {
  const player = diagram.players.find((candidate) => candidate.id === playerId);
  if (!player) return diagram;
  const motion: DiagramAssignment = {
    id: makeId("assignment"),
    player_id: playerId,
    kind: "motion",
    points: buildMotionPoints(player),
  };
  return {
    ...diagram,
    assignments: [...diagram.assignments.filter((assignment) => !(assignment.player_id === playerId && assignment.kind === "motion")), motion],
  };
}
