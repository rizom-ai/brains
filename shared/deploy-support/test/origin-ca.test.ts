import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "@brains/utils/fetch-like";
import {
  issueOriginCertificate,
  writeOriginCertificateFiles,
} from "../src/origin-ca";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "origin-ca-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const issued: FetchLike = async (input) => {
  const url = typeof input === "string" ? input : input.toString();
  if (!url.endsWith("/certificates")) throw new Error(`Unexpected ${url}`);
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
};

describe("issueOriginCertificate", () => {
  it("returns the issued certificate with the key it was requested for", async () => {
    const certificate = await issueOriginCertificate(
      issued,
      "cf-token",
      "brain.example.com",
    );

    expect(certificate.certificatePem).toContain("FAKECERT");
    expect(certificate.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(certificate.expiresOn).toBe("2041-04-09T00:00:00Z");
  });
});

describe("writeOriginCertificateFiles", () => {
  it("writes the certificate and a private key only its owner can read", async () => {
    const target = join(dir, "certs", "shared");

    const paths = await writeOriginCertificateFiles(target, {
      certificatePem: "CERT",
      privateKeyPem: "KEY",
    });

    expect(paths).toEqual({
      certificatePath: join(target, "origin.pem"),
      privateKeyPath: join(target, "origin.key"),
    });
    expect(readFileSync(paths.certificatePath, "utf-8")).toBe("CERT");
    expect(readFileSync(paths.privateKeyPath, "utf-8")).toBe("KEY");
    expect(statSync(paths.privateKeyPath).mode & 0o777).toBe(0o600);
  });
});
