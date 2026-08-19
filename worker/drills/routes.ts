import type { D1Database } from "@cloudflare/workers-types";

import { getDrill, importDrill, listDrills } from "../db/drills";
import { RepositoryError } from "../db/repository";
import { validateDrillDefinition } from "./definition";
import { seedMissingStarterDrills } from "./starters";

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

  if (!pathname.startsWith("/api/drills")) return null;

  try {
    if (pathname === "/api/drills" && request.method === "GET") {
      const drills = await listDrills(db);
      const seeded = await seedMissingStarterDrills(db, drills);
      return Response.json({ drills: seeded > 0 ? await listDrills(db) : drills });
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
  } catch (error) {
    if (error instanceof RepositoryError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "not_found" ? 404 : 409 },
      );
    }

    console.error("Unhandled drill API error", error);
    return Response.json(
      { error: { code: "internal_error", message: "An unexpected error occurred." } },
      { status: 500 },
    );
  }
}
