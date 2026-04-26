import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  bootstrapPilotOriginCertificate,
  runPilotCertBootstrap,
} from "../src/cert-bootstrap";
import {
  createOriginCertificateRequest,
  generateOriginKeyPair,
  type FetchLike,
} from "../src/origin-ca";

describe("pilot origin CA bootstrap", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brains-ops-cert-bootstrap-${Date.now()}`);
    mkdirSync(join(testDir, "users"), { recursive: true });
    mkdirSync(join(testDir, "cohorts"), { recursive: true });
    writeFileSync(
      join(testDir, "pilot.yaml"),
      [
        "schemaVersion: 1",
        "brainVersion: 0.2.0-alpha.3",
        "model: rover",
        "githubOrg: rizom-ai",
        "contentRepoPrefix: rover-",
        "domainSuffix: .rizom.ai",
        "preset: core",
        "aiApiKey: AI_API_KEY",
        "gitSyncToken: GIT_SYNC_TOKEN",
        "contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN",
        "mcpAuthToken: MCP_AUTH_TOKEN",
        "agePublicKey: age1testpublickey",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testDir, "users", "smoke.yaml"),
      ["handle: smoke", "discord:", "  enabled: false", ""].join("\n"),
    );
    writeFileSync(
      join(testDir, "cohorts", "cohort-1.yaml"),
      ["members:", "  - smoke", ""].join("\n"),
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("generates a verifiable CSR via the shared origin helper", () => {
    const keyPair = generateOriginKeyPair();
    const request = createOriginCertificateRequest("rizom.ai", keyPair);

    expect(request.csrPem).toContain("BEGIN CERTIFICATE REQUEST");
    expect(request.certificationRequestInfoDer.byteLength).toBeGreaterThan(0);
    expect(request.signature.byteLength).toBeGreaterThan(0);
  });

  it("creates shared files under the repo-local operator directory and calls Cloudflare APIs", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

    const fetchImpl: FetchLike = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      if (url.endsWith("/certificates")) {
        const body = JSON.parse(String(init?.body)) as {
          hostnames: string[];
          requested_validity: number;
          request_type: string;
          csr: string;
        };

        expect(body.hostnames).toEqual(["rizom.ai", "*.rizom.ai"]);
        expect(body.requested_validity).toBe(5475);
        expect(body.request_type).toBe("origin-rsa");
        expect(body.csr).toContain("BEGIN CERTIFICATE REQUEST");

        return new Response(
          JSON.stringify({
            success: true,
            result: {
              certificate:
                "-----BEGIN CERTIFICATE-----\nFAKECERT\n-----END CERTIFICATE-----\n",
              expires_on: "2041-04-09T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/settings/ssl")) {
        const body = JSON.parse(String(init?.body)) as { value: string };
        expect(body.value).toBe("strict");
        return new Response(JSON.stringify({ success: true, result: {} }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await bootstrapPilotOriginCertificate(testDir, {
      cfApiToken: "cf-token",
      cfZoneId: "zone-id",
      fetchImpl,
      logger: () => {},
    });

    expect(result.domain).toBe("rizom.ai");
    expect(result.certificatePath).toBe(
      join(testDir, ".brains-ops", "certs", "shared", "origin.pem"),
    );
    expect(result.privateKeyPath).toBe(
      join(testDir, ".brains-ops", "certs", "shared", "origin.key"),
    );
    expect(existsSync(result.certificatePath)).toBe(true);
    expect(existsSync(result.privateKeyPath)).toBe(true);
    expect(readFileSync(result.certificatePath, "utf-8")).toContain("FAKECERT");
    expect(calls).toHaveLength(2);
    const firstCall = calls[0];
    const secondCall = calls[1];
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    expect(new Headers(firstCall?.init?.headers).get("Authorization")).toBe(
      "Bearer cf-token",
    );
    expect(new Headers(secondCall?.init?.headers).get("Authorization")).toBe(
      "Bearer cf-token",
    );

    const mode = statSync(result.privateKeyPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("returns a friendly failure result when pilot.yaml has an invalid domain suffix", async () => {
    writeFileSync(
      join(testDir, "pilot.yaml"),
      [
        "schemaVersion: 1",
        "brainVersion: 0.2.0-alpha.3",
        "model: rover",
        "githubOrg: rizom-ai",
        "contentRepoPrefix: rover-",
        'domainSuffix: "*.rizom.ai"',
        "preset: core",
        "aiApiKey: AI_API_KEY",
        "gitSyncToken: GIT_SYNC_TOKEN",
        "contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN",
        "mcpAuthToken: MCP_AUTH_TOKEN",
        "agePublicKey: age1testpublickey",
        "",
      ].join("\n"),
    );

    const result = await runPilotCertBootstrap(testDir, {
      cfApiToken: "cf-token",
      cfZoneId: "zone-id",
      fetchImpl: async () => new Response(null, { status: 200 }),
      logger: () => {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Invalid pilot domainSuffix");
  });

  it("pushes certs to GitHub secrets when --push-to gh is used", async () => {
    const calls: Array<{
      command: string;
      args: string[];
      stdin?: string | undefined;
      env?: NodeJS.ProcessEnv | undefined;
    }> = [];

    const fetchImpl: FetchLike = async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/certificates")) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              certificate:
                "-----BEGIN CERTIFICATE-----\nFAKECERT\n-----END CERTIFICATE-----\n",
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/settings/ssl")) {
        return new Response(JSON.stringify({ success: true, result: {} }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await bootstrapPilotOriginCertificate(testDir, {
      cfApiToken: "cf-token",
      cfZoneId: "zone-id",
      fetchImpl,
      logger: () => {},
      pushTo: "gh",
      runCommand: async (command, args, options) => {
        calls.push({ command, args, stdin: options?.stdin, env: options?.env });
      },
    });

    expect(result.domain).toBe("rizom.ai");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      command: "gh",
      args: ["secret", "set", "CERTIFICATE_PEM"],
      stdin: result.certificatePem,
      env: undefined,
    });
    expect(calls[1]).toMatchObject({
      command: "gh",
      args: ["secret", "set", "PRIVATE_KEY_PEM"],
      env: undefined,
    });
    expect(calls[1]?.stdin).toContain("BEGIN PRIVATE KEY");
  });
});
