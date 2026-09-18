import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { downloadPublishedArtifact } from "./published-artifact";

const target = { name: "@rizom/brain", version: "1.2.3" };
const tarballUrl = "https://registry.npmjs.org/@rizom/brain/-/brain-1.2.3.tgz";
async function fixture(manifest = target): Promise<{
  bytes: Uint8Array<ArrayBuffer>;
  metadata: {
    name: string;
    version: string;
    dist: { tarball: string; integrity: string };
  };
}> {
  const blob = await new Bun.Archive(
    { "package/package.json": JSON.stringify(manifest) },
    { compress: "gzip" },
  ).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    metadata: {
      ...target,
      dist: {
        tarball: tarballUrl,
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      },
    },
  };
}

describe("published artifact verification", () => {
  test("verifies exact metadata, archive SHA512 and embedded manifest", async () => {
    const { bytes, metadata } = await fixture();
    const urls: string[] = [];
    const result = await downloadPublishedArtifact(target, {
      fetch: async (url) => {
        urls.push(url);
        return url === tarballUrl
          ? new Response(new Blob([bytes]))
          : Response.json(metadata);
      },
    });
    expect(result).toEqual(bytes);
    expect(urls).toEqual([
      "https://registry.npmjs.org/%40rizom%2Fbrain/1.2.3",
      tarballUrl,
    ]);
  });

  test("retries propagation failure and then verifies the archive", async () => {
    const { bytes, metadata } = await fixture();
    let calls = 0;
    const delays: number[] = [];
    const result = await downloadPublishedArtifact(target, {
      fetch: async (url) => {
        calls += 1;
        return calls === 1
          ? new Response(null, { status: 404 })
          : url === tarballUrl
            ? new Response(new Blob([bytes]))
            : Response.json(metadata);
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(result).toEqual(bytes);
    expect(delays).toEqual([2000]);
    expect(calls).toBe(3);
  });

  test("fails after bounded propagation retries", async () => {
    let calls = 0;
    const delays: number[] = [];
    const error = await downloadPublishedArtifact(target, {
      fetch: async () => {
        calls += 1;
        return new Response(null, { status: 404 });
      },
      sleep: async (ms) => {
        delays.push(ms);
      },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: expect.stringContaining("HTTP 404"),
    });
    expect(calls).toBe(12);
    expect(delays).toHaveLength(11);
    expect(Math.max(...delays)).toBe(30000);
  });

  test.each([
    "registry identity",
    "archive identity",
    "integrity",
    "origin",
    "missing integrity",
  ])("fails closed without retry on %s defects", async (defect) => {
    const { bytes, metadata } = await fixture(
      defect === "archive identity" ? { ...target, version: "0.0.0" } : target,
    );
    if (defect === "registry identity") metadata.version = "0.0.0";
    if (defect === "integrity")
      metadata.dist.integrity = `sha512-${Buffer.alloc(64).toString("base64")}`;
    if (defect === "origin")
      metadata.dist.tarball = "https://example.com/artifact.tgz";
    if (defect === "missing integrity") metadata.dist.integrity = "";
    const delays: number[] = [];
    const error = await downloadPublishedArtifact(target, {
      fetch: async (url) =>
        url === tarballUrl
          ? new Response(new Blob([bytes]))
          : Response.json(metadata),
      sleep: async (ms) => {
        delays.push(ms);
      },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(delays).toEqual([]);
  });

  test("does not retry authorization errors", async () => {
    let calls = 0;
    const error = await downloadPublishedArtifact(target, {
      fetch: async () => {
        calls += 1;
        return new Response(null, { status: 403 });
      },
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: expect.stringContaining("HTTP 403"),
    });
    expect(calls).toBe(1);
  });
});
