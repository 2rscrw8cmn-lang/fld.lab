import { describe, expect, it } from "vitest";

import {
  buildRoutePoints,
  createFormationPlayers,
  flipDiagram,
  formationsForSide,
  mirroredFormationId,
  replacePlayerRoute,
  type PlayDiagram,
} from "../src/features/playbook/playbook-model";

describe("playbook formations", () => {
  it("provides the core offensive formation presets", () => {
    expect(formationsForSide("offense").map((formation) => formation.id)).toEqual([
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

  it("creates five role markers for a 5v5 offensive preset", () => {
    let next = 0;
    const players = createFormationPlayers("trips-right", (prefix) => `${prefix}_${++next}`);
    expect(players).toHaveLength(5);
    expect(players.map((player) => player.label).sort()).toEqual(["C", "QB", "X", "Y", "Z"]);
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

  it("keeps a post route vertical before the break", () => {
    const points = buildRoutePoints("post", start, { x: 48, y: 40 });
    expect(points).toHaveLength(3);
    expect(points[1].x).toBe(20);
    expect(points[2]).toEqual({ x: 48, y: 40 });
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

  it("maps mirrored formation names", () => {
    expect(mirroredFormationId("trips-right")).toBe("trips-left");
    expect(mirroredFormationId("spread")).toBe("spread");
  });
});
