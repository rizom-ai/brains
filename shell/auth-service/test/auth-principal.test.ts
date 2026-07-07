import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { AuthService } from "../src";

const tempDirs: string[] = [];
const redirectUri = "http://127.0.0.1:6274/oauth/callback";

const registeredClientSchema = z.object({
  client_id: z.string(),
});

const tokenResponseSchema = z.object({
  access_token: z.string(),
});

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-auth-principal-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

async function issueAccessToken(
  service: AuthService,
  sessionCookie: string,
): Promise<{ accessToken: string; clientId: string }> {
  const registerResponse = await service.handleRequest(
    new Request("https://brain.example.com/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [redirectUri],
        client_name: "MCP Client",
      }),
    }),
  );
  const client = registeredClientSchema.parse(await registerResponse.json());
  const verifier =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const authorizeUrl = new URL("https://brain.example.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", client.client_id);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set(
    "code_challenge",
    await pkceChallenge(verifier),
  );
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("scope", "mcp");

  const pageResponse = await service.handleRequest(
    new Request(authorizeUrl.toString(), {
      headers: { cookie: sessionCookie },
    }),
  );
  const approvalToken = (await pageResponse.text()).match(
    /name="approval_token" value="([^"]+)"/,
  )?.[1];
  if (!approvalToken) {
    throw new Error("Expected OAuth approval token");
  }

  const approveParams = new URLSearchParams(authorizeUrl.searchParams);
  approveParams.set("approval_token", approvalToken);
  const approveResponse = await service.handleRequest(
    new Request("https://brain.example.com/authorize", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: sessionCookie,
      },
      body: approveParams.toString(),
    }),
  );
  const code = new URL(
    approveResponse.headers.get("location") ?? "",
  ).searchParams.get("code");
  if (!code) {
    throw new Error("Expected OAuth authorization code");
  }

  const tokenResponse = await service.handleRequest(
    new Request("https://brain.example.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        redirect_uri: redirectUri,
        code,
        code_verifier: verifier,
      }).toString(),
    }),
  );
  const token = tokenResponseSchema.parse(await tokenResponse.json());
  return { accessToken: token.access_token, clientId: client.client_id };
}

describe("AuthService principals", () => {
  it("resolves operator sessions to active auth principals", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const session = await service.createOperatorSession();
    const principal = await service.resolveSession(
      new Request("https://brain.example.com/dashboard", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(principal).toMatchObject({
      userId: session.subject,
      displayName: "Operator",
      role: "anchor",
      status: "active",
      permissionLevel: "anchor",
      canonicalId: `user:${session.subject.slice("usr_".length)}`,
    });
  });

  it("does not resolve missing or suspended session subjects", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const suspended = await service.createUser({
      displayName: "Suspended User",
      role: "trusted",
      status: "suspended",
    });
    const session = await service.createOperatorSession(suspended.userId);

    const principal = await service.resolveSession(
      new Request("https://brain.example.com/dashboard", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(principal).toBeUndefined();
  });

  it("resolves bearer tokens to active auth principals", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });

    const session = await service.createOperatorSession();
    const token = await issueAccessToken(service, session.cookie);
    const principal = await service.resolveBearerToken(
      new Request("https://brain.example.com/mcp", {
        headers: { authorization: `Bearer ${token.accessToken}` },
      }),
      { issuer: "https://brain.example.com", audience: token.clientId },
    );

    expect(principal).toMatchObject({
      userId: session.subject,
      displayName: "Operator",
      role: "anchor",
      status: "active",
      permissionLevel: "anchor",
    });
  });

  it("does not resolve bearer tokens for suspended users", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const suspended = await service.createUser({
      displayName: "Suspended Bearer",
      role: "trusted",
      status: "suspended",
    });

    const session = await service.createOperatorSession(suspended.userId);
    const token = await issueAccessToken(service, session.cookie);
    const principal = await service.resolveBearerToken(
      new Request("https://brain.example.com/mcp", {
        headers: { authorization: `Bearer ${token.accessToken}` },
      }),
      { issuer: "https://brain.example.com", audience: token.clientId },
    );

    expect(principal).toBeUndefined();
  });

  it("resolves verified identities to active auth principals", async () => {
    const service = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://brain.example.com",
    });
    const collaborator = await service.createUser({
      displayName: "Discord Collaborator",
      role: "trusted",
    });

    await service.attachIdentity({
      userId: collaborator.userId,
      type: "discord",
      subject: "1442828818493735015",
      label: "Collaborator on Discord",
      verifiedAt: Date.now(),
    });

    const principal = await service.resolveIdentity({
      type: "discord",
      subject: "1442828818493735015",
    });

    expect(principal).toMatchObject({
      userId: collaborator.userId,
      displayName: "Discord Collaborator",
      role: "trusted",
      status: "active",
      permissionLevel: "trusted",
    });
  });
});
