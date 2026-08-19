import { handleApi, type Env } from "./api";
import { AuthError, authenticateRequest, authErrorResponse } from "./auth";
import {
  AuthorizationError,
  authorizationErrorResponse,
  authorizeApiRequest,
  initializeAuthorization,
} from "./authorization";
import { handleDrillApi } from "./drills/routes";
import { handlePlayPersonnelApi } from "./playbook/personnel-routes";
import { handlePlaybookApi } from "./playbook/routes";
import { handleResultsApi } from "./results/routes";
import { handleSessionRosterApi } from "./sessions/roster-routes";
import { handleSessionApi } from "./sessions/routes";
import { handleOwnershipApi } from "./teams/ownership-routes";

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
      const authEnv = (env ?? {}) as Parameters<typeof authenticateRequest>[1];
      let coach;
      try {
        coach = await authenticateRequest(request, authEnv);
      } catch (error) {
        if (error instanceof AuthError) return authErrorResponse(error);
        console.error("Authentication failure", error instanceof Error ? error.name : "unknown");
        return Response.json(
          { error: { code: "auth_unavailable", message: "Authentication is temporarily unavailable." } },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }

      if (request.method === "GET" && url.pathname === "/api/auth/me") {
        return Response.json(
          { coach: { email: coach.email, provider: coach.provider } },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

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

      let authorization;
      try {
        authorization = await initializeAuthorization(env.DB, coach, authEnv.AUTHORIZED_COACH_EMAILS);
        await authorizeApiRequest(request, env.DB, authorization);
      } catch (error) {
        if (error instanceof AuthorizationError) return authorizationErrorResponse(error);
        console.error("Team authorization failure", error instanceof Error ? error.name : "unknown");
        return Response.json(
          { error: { code: "auth_unavailable", message: "Team permissions are temporarily unavailable." } },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }

      const ownershipResponse = await handleOwnershipApi(request, env.DB, authorization);
      if (ownershipResponse) return ownershipResponse;

      const playPersonnelResponse = await handlePlayPersonnelApi(request, env.DB);
      if (playPersonnelResponse) return playPersonnelResponse;

      const playbookResponse = await handlePlaybookApi(request, env.DB);
      if (playbookResponse) return playbookResponse;

      const resultsResponse = await handleResultsApi(request, env.DB);
      if (resultsResponse) return resultsResponse;

      const drillResponse = await handleDrillApi(request, env.DB);
      if (drillResponse) return drillResponse;

      const sessionRosterResponse = await handleSessionRosterApi(request, env.DB);
      if (sessionRosterResponse) return sessionRosterResponse;

      const sessionResponse = await handleSessionApi(request, env.DB, authorization.coach.id);
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
