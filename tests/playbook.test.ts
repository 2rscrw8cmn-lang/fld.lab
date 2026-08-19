import { describe, expect, it } from "vitest";

import {
  LOS_Y,
  buildRoutePoints,
  constrainPlayerPoint,
  createFormationPlayers,
  flipDiagram,
  formationsForSide,
  mirroredFormationId,
  replacePlayerRoute,
  updateRouteEndpoint,
  type DiagramAssignment,
  type PlayDiagram,
} from "../src/features/playbook/playbook-model";

describe("playbook formations", () => {
  it("provides the core 5v5 offensive formation presets", () => {
    expect(formationsForSide("offense", "5v5").map((formation) => formation.id)).toEqual([
      "spread",
      "trips-right",
      "trips-left",
      "bunch-right",
      "bunch-left",
      "stack-right",
      "stack-left",
      "custom-offense",
    ]);
  });

  it("provides matching 6v6 offensive presets", () => {
    expect(formationsForSide("offense", "6v6").map((formation) => formation.id)).toEqual([
      "spread-6",
      "trips-right-6",
      "trips-left-6",
      "bunch-right-6",
      "bunch-left-6",
      "stack-right-6",
      "stack-left-6",
      "custom-offense-6",
    ]);
  });

  it("creates five role markers for a 5v5 offensive preset", () => {
    let next = 0;
    const players = createFormationPlayers("trips-right", (prefix) => `${prefix}_${++next}`);
    expect(players).toHaveLength(5);
    expect(players.map((player) => player.label).sort()).toEqual(["C", "QB", "X", "Y", "Z"]);
  });

  it("creates six role markers for a 6v6 offensive preset", () => {
    let next = 0;
    const players = createFormationPlayers("trips-right-6", (prefix) => `${prefix}_${++next}`);
    expect(players).toHaveLength(6);
    expect(players.map((player) => player.label).sort()).toEqual(["C", "H", "QB", "X", "Y", "Z"]);
  });

  it("keeps offensive and defensive player placement on their own side of the LOS", () => {
    expect(constrainPlayerPoint("offense", { x: 35, y: 40 })).toEqual({ x: 35, y: LOS_Y });
    expect(constrainPlayerPoint("offense", { x: 35, y: 88 })).toEqual({ x: 35, y: 88 });
    expect(constrainPlayerPoint("defense", { x: 65, y: 90 })).toEqual({ x: 65, y: LOS_Y });
    expect(constrainPlayerPoint("defense", { x: 65, y: 52 })).toEqual({ x: 65, y: 52 });
  });
});

describe("smart route geometry", () => {
  const start = { x: 20, y: 80 };

  it("keeps an out route square instead of freehand", () => {
    expect(buildRoutePoints("out", start, { x: 8, y: 56 })).toEqual([
      { x: 20, y: 80 },
      { x: 20, y: 56 },
      { x: 8, y: 56 },
    ]);
  });

  it("keeps an out route outside even if the endpoint is dragged across the formation", () => {
    const points = buildRoutePoints("out", start, { x: 70, y: 56 });
    expect(points[2].x).toBeLessThan(start.x);
    expect(points[1].x).toBe(start.x);
  });

  it("keeps a post route vertical before the break", () => {
    const points = buildRoutePoints("post", start, { x: 48, y: 40 });
    expect(points).toHaveLength(3);
    expect(points[1].x).toBe(20);
    expect(points[2]).toEqual({ x: 48, y: 40 });
  });

  it("builds a wheel with three useful editable handles instead of sampled-point clutter", () => {
    const wheelStart = { x: 70, y: 86 };
    const points = buildRoutePoints("wheel", wheelStart);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual(wheelStart);
    expect(points[1].x).toBeGreaterThan(wheelStart.x);
    expect(points[1].y).toBe(wheelStart.y);
    expect(points[2].x).toBe(points[3].x);
    expect(points[2].y).toBeGreaterThan(points[3].y);
    expect(points.at(-1)?.x).toBeGreaterThan(wheelStart.x);
    expect(points.at(-1)?.y).toBeLessThan(LOS_Y);
  });

  it("keeps a dragged wheel endpoint outside", () => {
    const wheelStart = { x: 70, y: 86 };
    const points = buildRoutePoints("wheel", wheelStart, { x: 35, y: 44 });
    expect(points).toHaveLength(4);
    expect(points.at(-1)?.x).toBeGreaterThan(wheelStart.x);
    expect(points.at(-1)?.y).toBe(44);
  });

  it("moves only the route endpoint after a coach customizes the middle bend", () => {
    const assignment: DiagramAssignment = {
      id: "route_post",
      player_id: "player_x",
      kind: "route",
      template: "post",
      points: [
        { x: 20, y: 80 },
        { x: 27, y: 63 },
        { x: 45, y: 42 },
      ],
    };

    const points = updateRouteEndpoint(assignment, start, { x: 52, y: 36 });
    expect(points[0]).toEqual({ x: 20, y: 80 });
    expect(points[1]).toEqual({ x: 27, y: 63 });
    expect(points[2]).toEqual({ x: 52, y: 36 });
  });

  it("replaces a player's existing route instead of stacking routes", () => {
    const diagram: PlayDiagram = {
      schema_version: 2,
      players: [{ id: "player_x", label: "X", x: 20, y: 80 }],
      assignments: [],
      primary_target_player_id: null,
    };
    const first = replacePlayerRoute(diagram, "player_x", "go", () => "route_1");
    const second = replacePlayerRoute(first, "player_x", "slant", () => "route_2");
    expect(second.assignments).toHaveLength(1);
    expect(second.assignments[0].template).toBe("slant");
  });
});

describe("play mirroring", () => {
  it("flips players and route geometry around midfield", () => {
    const diagram: PlayDiagram = {
      schema_version: 2,
      players: [{ id: "player_x", label: "X", x: 20, y: 80 }],
      assignments: [{
        id: "route_1",
        player_id: "player_x",
        kind: "route",
        template: "slant",
        points: [{ x: 20, y: 80 }, { x: 40, y: 60 }],
      }],
      primary_target_player_id: "player_x",
    };

    const flipped = flipDiagram(diagram);
    expect(flipped.players[0].x).toBe(80);
    expect(flipped.assignments[0].points).toEqual([{ x: 80, y: 80 }, { x: 60, y: 60 }]);
    expect(flipped.primary_target_player_id).toBe("player_x");
  });

  it("maps mirrored formation names in both formats", () => {
    expect(mirroredFormationId("trips-right")).toBe("trips-left");
    expect(mirroredFormationId("trips-right-6")).toBe("trips-left-6");
    expect(mirroredFormationId("spread")).toBe("spread");
  });
});
