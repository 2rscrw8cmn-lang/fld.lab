import type { Point, RouteTemplate } from "@/features/playbook/playbook-model";

function linePath(points: Point[]) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function routePathData(template: RouteTemplate | undefined, points: Point[]) {
  if (template === "wheel" && points.length >= 4) {
    const [start, control1, control2, end] = points;
    return `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`;
  }
  return linePath(points);
}

function cubicPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: (inverse ** 3 * start.x)
      + (3 * inverse ** 2 * t * control1.x)
      + (3 * inverse * t ** 2 * control2.x)
      + (t ** 3 * end.x),
    y: (inverse ** 3 * start.y)
      + (3 * inverse ** 2 * t * control1.y)
      + (3 * inverse * t ** 2 * control2.y)
      + (t ** 3 * end.y),
  };
}

export function sampledRoutePoints(template: RouteTemplate | undefined, points: Point[], samples = 24): Point[] {
  if (template !== "wheel" || points.length < 4) return points;
  const [start, control1, control2, end] = points;
  const count = Math.max(4, samples);
  return Array.from({ length: count }, (_, index) => cubicPoint(start, control1, control2, end, index / (count - 1)));
}

export function pointAlongRoute(template: RouteTemplate | undefined, points: Point[], progress: number): Point {
  const samples = sampledRoutePoints(template, points);
  if (!samples.length) return { x: 50, y: 50 };
  if (samples.length === 1) return samples[0];

  const lengths = samples.slice(1).map((point, index) => Math.hypot(point.x - samples[index].x, point.y - samples[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return samples[samples.length - 1];

  const target = Math.max(0, Math.min(1, progress)) * total;
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const segment = lengths[index];
    if (traversed + segment >= target) {
      const local = segment <= 0 ? 0 : (target - traversed) / segment;
      return {
        x: samples[index].x + (samples[index + 1].x - samples[index].x) * local,
        y: samples[index].y + (samples[index + 1].y - samples[index].y) * local,
      };
    }
    traversed += segment;
  }
  return samples[samples.length - 1];
}
