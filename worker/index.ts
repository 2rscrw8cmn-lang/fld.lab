export type HealthPayload = {
  status: "ok";
  service: "fld-lab";
  timestamp: string;
};

export function createHealthPayload(now = new Date()): HealthPayload {
  return {
    status: "ok",
    service: "fld-lab",
    timestamp: now.toISOString()
  };
}

const worker = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json(createHealthPayload());
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        {
          error: {
            code: "NOT_FOUND",
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
