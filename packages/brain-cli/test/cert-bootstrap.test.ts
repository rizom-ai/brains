import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPublicKey, verify } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  bootstrapOriginCertificate,
  runCertBootstrap,
} from "../src/commands/cert-bootstrap";
import {
  createOriginCertificateRequest,
  generateOriginKeyPair,
  type FetchLike,
} from "../src/lib/origin-ca";

describe("origin CA bootstrap", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-cert-bootstrap-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "brain.yaml"),
      ["brain: rover", "domain: mybrain.example.com", ""].join("\n"),
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should generate a verifiable CSR", () => {
    const keyPair = generateOriginKeyPair();
    const request = createOriginCertificateRequest(
      "mybrain.example.com",
      keyPair,
    );

    expect(request.csrPem).toContain("BEGIN CERTIFICATE REQUEST");
    expect(
      verify(
        "sha256",
        request.certificationRequestInfoDer,
        createPublicKey(keyPair.privateKeyPem),
        request.signature,
      ),
    ).toBe(true);
  });

  it("should create files and call Cloudflare APIs", async () => {
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

        expect(body.hostnames).toEqual([
          "mybrain.example.com",
          "*.mybrain.example.com",
        ]);
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

    const result = await bootstrapOriginCertificate(testDir, {
      cfApiToken: "cf-token",
      cfZoneId: "zone-id",
      fetchImpl,
      logger: () => {},
    });

    expect(result.domain).toBe("mybrain.example.com");
    expect(existsSync(join(testDir, "origin.pem"))).toBe(true);
    expect(existsSync(join(testDir, "origin.key"))).toBe(true);
    expect(readFileSync(join(testDir, "origin.pem"), "utf-8")).toContain(
      "FAKECERT",
    );
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

    const mode = statSync(join(testDir, "origin.key")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("should read CF_API_TOKEN and CF_ZONE_ID from the environment", async () => {
    const originalCfApiToken = process.env["CF_API_TOKEN"];
    const originalCfZoneId = process.env["CF_ZONE_ID"];

    process.env["CF_API_TOKEN"] = "cf-token";
    process.env["CF_ZONE_ID"] = "zone-id";

    try {
      const calls: string[] = [];
      const fetchImpl: FetchLike = async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);

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

      const result = await bootstrapOriginCertificate(testDir, {
        fetchImpl,
        logger: () => {},
      });

      expect(result.domain).toBe("mybrain.example.com");
      expect(calls).toHaveLength(2);
    } finally {
      if (originalCfApiToken === undefined) {
        delete process.env["CF_API_TOKEN"];
      } else {
        process.env["CF_API_TOKEN"] = originalCfApiToken;
      }

      if (originalCfZoneId === undefined) {
        delete process.env["CF_ZONE_ID"];
      } else {
        process.env["CF_ZONE_ID"] = originalCfZoneId;
      }
    }
  });

  it("should return a friendly failure result when prerequisites are missing", async () => {
    rmSync(join(testDir, "brain.yaml"));
    const missingPrereqFetch: FetchLike = async () =>
      new Response(null, { status: 200 });

    const result = await runCertBootstrap(testDir, {
      cfApiToken: "cf-token",
      cfZoneId: "zone-id",
      fetchImpl: missingPrereqFetch,
      logger: () => {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("brain.yaml");
  });

  it("should push certs to GitHub secrets when --push-to gh is used", async () => {
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

    const result = await bootstrapOriginCertificate(testDir, {
      cfApiToken: "cf-token",
      cfZoneId: "zone-id",
      fetchImpl,
      logger: () => {},
      pushTo: "gh",
      runCommand: async (command, args, options) => {
        calls.push({ command, args, stdin: options?.stdin, env: options?.env });
      },
    });

    expect(result.domain).toBe("mybrain.example.com");
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
