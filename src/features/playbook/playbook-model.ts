export type PlaySide = "offense" | "defense";
export type AssignmentKind = "route" | "motion";
export type RouteTemplate = "go" | "slant" | "out" | "in" | "post" | "corner" | "hitch" | "drag";

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
  players: FormationPlayer[];
};

const clamp = (value: number, min = 5, max = 95) => Math.max(min, Math.min(max, value));
const point = (x: number, y: number): Point => ({ x: clamp(x), y: clamp(y) });

export const ROUTE_TEMPLATES: Array<{ id: RouteTemplate; label: string; short: string }> = [
  { id: "go", label: "Go", short: "GO" },
  { id: "slant", label: "Slant", short: "SL" },
  { id: "out", label: "Out", short: "OUT" },
  { id: "in", label: "In", short: "IN" },
  { id: "post", label: "Post", short: "POST" },
  { id: "corner", label: "Corner", short: "COR" },
  { id: "hitch", label: "Hitch", short: "HIT" },
  { id: "drag", label: "Drag", short: "DRAG" },
];

export const FORMATIONS: FormationPreset[] = [
  {
    id: "spread",
    name: "Spread",
    side: "offense",
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
    players: [
      { label: "L", x: 18, y: 52 },
      { label: "M", x: 38, y: 46 },
      { label: "S", x: 62, y: 46 },
      { label: "R", x: 82, y: 52 },
      { label: "D", x: 50, y: 34 },
    ],
  },
];

const mirroredFormationIds: Record<string, string> = {
  "trips-right": "trips-left",
  "trips-left": "trips-right",
  "bunch-right": "bunch-left",
  "bunch-left": "bunch-right",
  "stack-right": "stack-left",
  "stack-left": "stack-right",
};

export function formationById(formationId: string | null | undefined) {
  return FORMATIONS.find((formation) => formation.id === formationId) ?? null;
}

export function formationsForSide(side: PlaySide) {
  return FORMATIONS.filter((formation) => formation.side === side);
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
    case "hitch": return point(start.x + inside * 5, start.y - 16);
    case "drag": return point(start.x + inside * 33, start.y - 8);
  }
}

export function buildRoutePoints(template: RouteTemplate, start: Point, requestedEnd?: Point): Point[] {
  const end = requestedEnd ? point(requestedEnd.x, requestedEnd.y) : defaultRouteEnd(template, start);
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
    case "hitch": {
      const stemY = end.y;
      const comebackX = Math.abs(end.x - start.x) < 2 ? start.x + insideSign(start) * 5 : end.x;
      return [normalizedStart, point(start.x, stemY), point(comebackX, stemY + 5)];
    }
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
