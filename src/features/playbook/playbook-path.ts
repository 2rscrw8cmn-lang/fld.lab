import type { Point, RouteTemplate } from "@/features/playbook/playbook-model";

function linePath(points: Point[]) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function catmullSegment(points: Point[], index: number) {
  const p1 = points[index];
  const p2 = points[index + 1];
  const p0 = points[index - 1] ?? p1;
  const p3 = points[index + 2] ?? p2;
  return { p0, p1, p2, p3 };
}

export function routePathData(template: RouteTemplate | undefined, points: Point[]) {
  if (template !== "wheel" || points.length < 3) return linePath(points);

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const { p0, p1, p2, p3 } = catmullSegment(points, index);
    const control1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const control2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };
    path += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${p2.x} ${p2.y}`;
  }
  return path;
}

function catmullPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function sampledRoutePoints(template: RouteTemplate | undefined, points: Point[], samples = 32): Point[] {
  if (template !== "wheel" || points.length < 3) return points;
  const segmentCount = points.length - 1;
  const samplesPerSegment = Math.max(3, Math.ceil(samples / segmentCount));
  const result: Point[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const { p0, p1, p2, p3 } = catmullSegment(points, index);
    for (let step = 0; step < samplesPerSegment; step += 1) {
      if (index > 0 && step === 0) continue;
      result.push(catmullPoint(p0, p1, p2, p3, step / (samplesPerSegment - 1)));
    }
  }
  return result;
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
