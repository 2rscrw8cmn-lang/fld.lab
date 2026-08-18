import { describe, expect, it } from "vitest";

import { APP_ROUTES, getRoute } from "../src/app/routes";
import worker, { createHealthPayload } from "../worker/index";

describe("application scaffold", () => {
  it("defines the canonical primary routes", () => {
    expect(APP_ROUTES.map((route) => route.path)).toEqual([
      "/",
      "/roster",
      "/train",
      "/data",
      "/drills",
      "/settings"
    ]);
  });

  it("falls back to Home for an unknown client route", () => {
    expect(getRoute("/not-a-route").path).toBe("/");
  });

  it("creates a stable health payload", () => {
    expect(createHealthPayload(new Date("2026-08-18T12:00:00.000Z"))).toEqual({
      status: "ok",
      service: "fld-lab",
      timestamp: "2026-08-18T12:00:00.000Z"
    });
  });

  it("serves the Worker health endpoint", async () => {
    const response = await worker.fetch(new Request("https://fld-lab.test/api/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "fld-lab"
    });
  });
});
