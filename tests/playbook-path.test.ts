import { describe, expect, it } from "vitest";

import { pointAlongRoute, routePathData, sampledRoutePoints } from "../src/features/playbook/playbook-path";
import { buildRoutePoints } from "../src/features/playbook/playbook-model";

describe("wheel route rendering", () => {
  const start = { x: 70, y: 86 };
  const wheel = buildRoutePoints("wheel", start);

  it("renders wheel data as a smooth path while leaving straight routes linear", () => {
    expect(routePathData("wheel", wheel)).toContain(" C ");
    expect(routePathData("go", [{ x: 20, y: 80 }, { x: 20, y: 40 }])).toBe("M 20 80 L 20 40");
  });

  it("samples more points for wheel playback without changing its endpoints", () => {
    const samples = sampledRoutePoints("wheel", wheel);
    expect(samples.length).toBeGreaterThan(wheel.length);
    expect(samples[0].x).toBeCloseTo(wheel[0].x, 5);
    expect(samples[0].y).toBeCloseTo(wheel[0].y, 5);
    expect(samples.at(-1)?.x).toBeCloseTo(wheel.at(-1)!.x, 5);
    expect(samples.at(-1)?.y).toBeCloseTo(wheel.at(-1)!.y, 5);
  });

  it("moves through the curved route rather than jumping between route endpoints", () => {
    const midpoint = pointAlongRoute("wheel", wheel, 0.5);
    const end = wheel.at(-1)!;
    expect(midpoint.x).toBeGreaterThan(start.x);
    expect(midpoint.y).toBeLessThan(start.y);
    expect(midpoint.y).toBeGreaterThan(end.y);
  });
});
