import { handleApi, type Env } from "./api";
import { handleDrillApi } from "./drills/routes";
import { handleSessionRosterApi } from "./sessions/roster-routes";
import { handleSessionApi } from "./sessions/routes";

export type HealthPayload = {
  ok: true;
};

export function createHealthPayload(): HealthPayload {
  return { ok: true };
}

const worker = {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json(createHealthPayload());
    }

    if (url.pathname.startsWith("/api/")) {
      if (!env?.DB) {
        return Response.json(
          {
            error: {
              code: "internal_error",
              message: "Database binding is unavailable."
            }
          },
          { status: 500 }
        );
      }

      const drillResponse = await handleDrillApi(request, env.DB);
      if (drillResponse) return drillResponse;

      const sessionRosterResponse = await handleSessionRosterApi(request, env.DB);
      if (sessionRosterResponse) return sessionRosterResponse;

      const sessionResponse = await handleSessionApi(request, env.DB);
      if (sessionResponse) return sessionResponse;

      const response = await handleApi(request, env);
      if (response) return response;

      return Response.json(
        {
          error: {
            code: "not_found",
            message: "API route not found"
          }
        },
        { status: 404 }
      );
    }

    return new Response(null, { status: 404 });
  }
};

export default worker;
