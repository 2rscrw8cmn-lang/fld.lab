import { handleApi, type Env } from "./api";
import { AuthError, authenticateRequest, authErrorResponse } from "./auth";
import { handleDrillApi } from "./drills/routes";
import { handleResultsApi } from "./results/routes";
import { handleSessionRosterApi } from "./sessions/roster-routes";
import { handleSessionApi } from "./sessions/routes";
import { handleTeamAdminApi } from "./teams/admin-routes";

type AuthRuntimeBindings = {
  AUTH_MODE?: unknown;
  ACCESS_TEAM_DOMAIN?: unknown;
  ACCESS_AUD?: unknown;
  AUTHORIZED_COACH_EMAILS?: unknown;
};

type AuthRuntimeStatus = {
  diagnostic: "auth-runtime-v1";
  configured: boolean;
  mode: string | null;
  missing: string[];
  invalid: string[];
};

export type HealthPayload = {
  ok: true;
  auth: AuthRuntimeStatus;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function authRuntimeStatus(env?: Env): AuthRuntimeStatus {
  const runtime = (env ?? {}) as Env & AuthRuntimeBindings;
  const mode = nonEmptyString(runtime.AUTH_MODE);
  const teamDomain = nonEmptyString(runtime.ACCESS_TEAM_DOMAIN);
  const audience = nonEmptyString(runtime.ACCESS_AUD);
  const coaches = nonEmptyString(runtime.AUTHORIZED_COACH_EMAILS);

  const missing: string[] = [];
  if (!mode) missing.push("AUTH_MODE");
  if (!teamDomain) missing.push("ACCESS_TEAM_DOMAIN");
  if (!audience) missing.push("ACCESS_AUD");
  if (!coaches) missing.push("AUTHORIZED_COACH_EMAILS");

  const invalid: string[] = [];
  if (mode && mode !== "access") invalid.push("AUTH_MODE");

  if (teamDomain) {
    try {
      const parsed = new URL(teamDomain.replace(/\/$/, ""));
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".cloudflareaccess.com")) {
        invalid.push("ACCESS_TEAM_DOMAIN");
      }
    } catch {
      invalid.push("ACCESS_TEAM_DOMAIN");
    }
  }

  if (coaches) {
    const entries = coaches.split(",").map((email) => email.trim()).filter(Boolean);
    if (!entries.length || entries.some((email) => !email.includes("@"))) {
      invalid.push("AUTHORIZED_COACH_EMAILS");
    }
  }

  return {
    diagnostic: "auth-runtime-v1",
    configured: missing.length === 0 && invalid.length === 0,
    mode,
    missing,
    invalid,
  };
}

export function createHealthPayload(env?: Env): HealthPayload {
  return { ok: true, auth: authRuntimeStatus(env) };
}

const worker = {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json(createHealthPayload(env), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      let coach;
      try {
        coach = await authenticateRequest(
          request,
          (env ?? {}) as Parameters<typeof authenticateRequest>[1],
        );
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

      const resultsResponse = await handleResultsApi(request, env.DB);
      if (resultsResponse) return resultsResponse;

      const drillResponse = await handleDrillApi(request, env.DB);
      if (drillResponse) return drillResponse;

      const sessionRosterResponse = await handleSessionRosterApi(request, env.DB);
      if (sessionRosterResponse) return sessionRosterResponse;

      const sessionResponse = await handleSessionApi(request, env.DB);
      if (sessionResponse) return sessionResponse;

      const teamAdminResponse = await handleTeamAdminApi(request, env.DB);
      if (teamAdminResponse) return teamAdminResponse;

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
