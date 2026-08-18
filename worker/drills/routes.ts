import type { D1Database } from "@cloudflare/workers-types";

import { getDrill, importDrill, listDrills } from "../db/drills";
import { validateDrillDefinition } from "./definition";

function invalidDefinition(fields: Record<string, string>) {
  return Response.json(
    {
      error: {
        code: "invalid_drill_definition",
        message: "The drill definition is invalid.",
        fields,
      },
    },
    { status: 422 },
  );
}

function routeId(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const remainder = pathname.slice(prefix.length);
  return remainder && !remainder.includes("/") ? decodeURIComponent(remainder) : null;
}

export async function handleDrillApi(request: Request, db: D1Database): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/drills" && request.method === "GET") {
    return Response.json({ drills: await listDrills(db) });
  }

  if (pathname === "/api/drills/import" && request.method === "POST") {
    let value: unknown;
    try {
      value = await request.json();
    } catch {
      return invalidDefinition({ definition: "Request body must be valid JSON" });
    }

    const validation = validateDrillDefinition(value);
    if (!validation.ok) return invalidDefinition(validation.fields);

    const result = await importDrill(db, validation.definition, validation.canonicalJson);
    return Response.json(result, { status: result.version_created ? 201 : 200 });
  }

  const drillId = routeId(pathname, "/api/drills/");
  if (drillId && drillId !== "import" && request.method === "GET") {
    return Response.json(await getDrill(db, drillId));
  }

  return null;
}
