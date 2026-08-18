import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError, authenticateRequest } from "../worker/auth";

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signedToken({
  teamDomain,
  audience = "fld-lab-aud",
  email = "coach@example.com",
  expiresInSeconds = 600,
}: {
  teamDomain: string;
  audience?: string;
  email?: string;
  expiresInSeconds?: number;
}) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = crypto.randomUUID();
  const header = base64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: "access-user-123",
    email,
    iss: teamDomain,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  ));

  return {
    token: `${signingInput}.${base64Url(signature)}`,
    jwk: { ...publicJwk, kid, alg: "RS256", use: "sig" },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare Access authentication", () => {
  it("allows explicit local development only on localhost", async () => {
    await expect(authenticateRequest(new Request("http://localhost/api/teams"), { AUTH_MODE: "development" }))
      .resolves.toMatchObject({ provider: "development" });

    await expect(authenticateRequest(new Request("https://fld-lab.example/api/teams"), { AUTH_MODE: "development" }))
      .rejects.toMatchObject({ status: 503, code: "auth_unavailable" });
  });

  it("fails closed when authentication is not configured", async () => {
    await expect(authenticateRequest(new Request("https://fld-lab.example/api/teams"), {}))
      .rejects.toMatchObject({ status: 503, code: "auth_unavailable" });
  });

  it("accepts a valid Access JWT for any configured coach", async () => {
    const teamDomain = `https://team-${crypto.randomUUID()}.cloudflareaccess.com`;
    const { token, jwk } = await signedToken({ teamDomain, email: "second@example.com" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ keys: [jwk] })));

    const coach = await authenticateRequest(
      new Request("https://fld-lab.example/api/teams", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      {
        AUTH_MODE: "access",
        ACCESS_TEAM_DOMAIN: teamDomain,
        ACCESS_AUD: "fld-lab-aud",
        AUTHORIZED_COACH_EMAILS: "coach@example.com, SECOND@example.com",
      },
    );

    expect(coach).toEqual({
      subject: "access-user-123",
      email: "second@example.com",
      provider: "cloudflare-access",
    });
  });

  it("rejects a valid Access JWT for an email outside the configured coach list", async () => {
    const teamDomain = `https://team-${crypto.randomUUID()}.cloudflareaccess.com`;
    const { token, jwk } = await signedToken({ teamDomain, email: "other@example.com" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ keys: [jwk] })));

    await expect(authenticateRequest(
      new Request("https://fld-lab.example/api/teams", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      {
        AUTH_MODE: "access",
        ACCESS_TEAM_DOMAIN: teamDomain,
        ACCESS_AUD: "fld-lab-aud",
        AUTHORIZED_COACH_EMAILS: "coach@example.com,second@example.com",
      },
    )).rejects.toMatchObject({ status: 403, code: "forbidden" } satisfies Partial<AuthError>);
  });

  it("rejects wrong-audience and expired tokens", async () => {
    const wrongAudienceDomain = `https://team-${crypto.randomUUID()}.cloudflareaccess.com`;
    const wrongAudience = await signedToken({ teamDomain: wrongAudienceDomain, audience: "other-aud" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ keys: [wrongAudience.jwk] })));

    await expect(authenticateRequest(
      new Request("https://fld-lab.example/api/teams", { headers: { "Cf-Access-Jwt-Assertion": wrongAudience.token } }),
      {
        AUTH_MODE: "access",
        ACCESS_TEAM_DOMAIN: wrongAudienceDomain,
        ACCESS_AUD: "fld-lab-aud",
        AUTHORIZED_COACH_EMAILS: "coach@example.com",
      },
    )).rejects.toMatchObject({ status: 401, code: "unauthorized" });

    const expiredDomain = `https://team-${crypto.randomUUID()}.cloudflareaccess.com`;
    const expired = await signedToken({ teamDomain: expiredDomain, expiresInSeconds: -120 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ keys: [expired.jwk] })));

    await expect(authenticateRequest(
      new Request("https://fld-lab.example/api/teams", { headers: { "Cf-Access-Jwt-Assertion": expired.token } }),
      {
        AUTH_MODE: "access",
        ACCESS_TEAM_DOMAIN: expiredDomain,
        ACCESS_AUD: "fld-lab-aud",
        AUTHORIZED_COACH_EMAILS: "coach@example.com",
      },
    )).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
});
