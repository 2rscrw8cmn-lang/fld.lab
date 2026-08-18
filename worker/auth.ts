type AuthConfig = {
  AUTH_MODE?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  AUTHORIZED_COACH_EMAIL?: string;
};

export type AuthenticatedCoach = {
  subject: string;
  email: string;
  provider: "cloudflare-access" | "development";
};

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type JwtPayload = {
  sub?: unknown;
  email?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
};

type JsonWebKeyWithKid = JsonWebKey & { kid?: string };

type JwksResponse = {
  keys?: JsonWebKeyWithKid[];
};

type CachedJwks = {
  expiresAt: number;
  keys: JsonWebKeyWithKid[];
};

const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const jwksCache = new Map<string, CachedJwks>();

export class AuthError extends Error {
  constructor(
    public status: 401 | 403 | 503,
    public code: "unauthorized" | "forbidden" | "auth_unavailable",
    message: string,
  ) {
    super(message);
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeJsonPart<T>(value: string): T {
  const bytes = decodeBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function normalizeTeamDomain(value: string) {
  return value.trim().replace(/\/$/, "");
}

function audMatches(actual: unknown, expected: string) {
  return typeof actual === "string"
    ? actual === expected
    : Array.isArray(actual) && actual.some((value) => value === expected);
}

async function loadJwks(teamDomain: string, forceRefresh = false): Promise<JsonWebKeyWithKid[]> {
  const cacheKey = `${teamDomain}/cdn-cgi/access/certs`;
  const cached = jwksCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(cacheKey, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new AuthError(503, "auth_unavailable", "Authentication is temporarily unavailable.");

  let body: JwksResponse;
  try {
    body = await response.json() as JwksResponse;
  } catch {
    throw new AuthError(503, "auth_unavailable", "Authentication is temporarily unavailable.");
  }

  if (!Array.isArray(body.keys) || !body.keys.length) {
    throw new AuthError(503, "auth_unavailable", "Authentication is temporarily unavailable.");
  }

  jwksCache.set(cacheKey, { expiresAt: Date.now() + JWKS_TTL_MS, keys: body.keys });
  return body.keys;
}

async function verifyJwtSignature(token: string, teamDomain: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError(401, "unauthorized", "Authentication is required.");

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = decodeJsonPart<JwtHeader>(parts[0]);
    payload = decodeJsonPart<JwtPayload>(parts[1]);
  } catch {
    throw new AuthError(401, "unauthorized", "Authentication is required.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new AuthError(401, "unauthorized", "Authentication is required.");
  }

  let keys = await loadJwks(teamDomain);
  let jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    keys = await loadJwks(teamDomain, true);
    jwk = keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk) throw new AuthError(401, "unauthorized", "Authentication is required.");

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new AuthError(503, "auth_unavailable", "Authentication is temporarily unavailable.");
  }

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    asArrayBuffer(decodeBase64Url(parts[2])),
    asArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );

  if (!valid) throw new AuthError(401, "unauthorized", "Authentication is required.");
  return payload;
}

function validateClaims(payload: JwtPayload, teamDomain: string, audience: string, nowSeconds: number) {
  if (payload.iss !== teamDomain || !audMatches(payload.aud, audience)) {
    throw new AuthError(401, "unauthorized", "Authentication is required.");
  }
  if (typeof payload.exp !== "number" || payload.exp < nowSeconds - CLOCK_SKEW_SECONDS) {
    throw new AuthError(401, "unauthorized", "Your session has expired.");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new AuthError(401, "unauthorized", "Authentication is required.");
  }
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string" || !payload.email.trim()) {
    throw new AuthError(401, "unauthorized", "Authentication is required.");
  }
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function authenticateRequest(request: Request, env: AuthConfig): Promise<AuthenticatedCoach> {
  if (env.AUTH_MODE === "development") {
    if (!isLocalRequest(request)) {
      throw new AuthError(503, "auth_unavailable", "Authentication is not configured for this deployment.");
    }
    return {
      subject: "local-development",
      email: "coach@local.fld.lab",
      provider: "development",
    };
  }

  if (env.AUTH_MODE !== "access") {
    throw new AuthError(503, "auth_unavailable", "Authentication is not configured for this deployment.");
  }

  const rawTeamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  const authorizedEmail = env.AUTHORIZED_COACH_EMAIL?.trim().toLowerCase();
  if (!rawTeamDomain || !audience || !authorizedEmail) {
    throw new AuthError(503, "auth_unavailable", "Authentication is not configured for this deployment.");
  }

  const teamDomain = normalizeTeamDomain(rawTeamDomain);
  let parsedDomain: URL;
  try {
    parsedDomain = new URL(teamDomain);
  } catch {
    throw new AuthError(503, "auth_unavailable", "Authentication is not configured for this deployment.");
  }
  if (parsedDomain.protocol !== "https:" || !parsedDomain.hostname.endsWith(".cloudflareaccess.com")) {
    throw new AuthError(503, "auth_unavailable", "Authentication is not configured for this deployment.");
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new AuthError(401, "unauthorized", "Authentication is required.");

  const payload = await verifyJwtSignature(token, teamDomain);
  validateClaims(payload, teamDomain, audience, Math.floor(Date.now() / 1000));

  const email = (payload.email as string).trim().toLowerCase();
  if (email !== authorizedEmail) {
    throw new AuthError(403, "forbidden", "This account is not authorized for fld.LAB.");
  }

  return {
    subject: payload.sub as string,
    email,
    provider: "cloudflare-access",
  };
}

export function authErrorResponse(error: AuthError) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
