import { createHash } from "node:crypto";
import { z } from "zod";
import { readPackageManifestFromTarball } from "./package-tarball";
import { RegistryNotReady, untilPublished } from "./registry-propagation";

export const packageIdentitySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});
const metadataSchema = packageIdentitySchema.extend({
  dist: z.object({
    tarball: z.string().url(),
    integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+={0,2}$/u),
  }),
});

type Target = z.infer<typeof packageIdentitySchema>;
interface Dependencies {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Verify anonymous public availability, identity and SHA512, never just publish acknowledgement. */
export async function downloadPublishedArtifact(
  target: Target,
  dependencies: Dependencies = {},
): Promise<Uint8Array> {
  const fetcher = dependencies.fetch ?? fetch;
  const label = `${target.name}@${target.version}`;

  async function request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new RegistryNotReady(`Cannot fetch ${label}: ${url}`, {
        cause: error,
      });
    }
    if (!response.ok) {
      const message = `${label}: HTTP ${response.status} from ${url}`;
      if (
        response.status === 404 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        throw new RegistryNotReady(message);
      }
      throw new Error(message);
    }
    return response;
  }

  // Retry only registry/network propagation, never malformed or mismatched artifacts.
  return untilPublished(async () => {
    const response = await request(
      `https://registry.npmjs.org/${encodeURIComponent(target.name)}/${encodeURIComponent(target.version)}`,
    );
    const metadata = metadataSchema.parse(await response.json());
    assertIdentity(target, metadata, "registry");
    const url = new URL(metadata.dist.tarball);
    if (
      url.origin !== "https://registry.npmjs.org" ||
      url.username ||
      url.password
    ) {
      throw new Error(`${label}: unexpected tarball origin`);
    }
    const tarball = await request(url.href);
    const bytes = new Uint8Array(await tarball.arrayBuffer());
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    if (integrity !== metadata.dist.integrity) {
      throw new Error(`${label}: tarball integrity mismatch`);
    }
    const manifest = packageIdentitySchema.parse(
      await readPackageManifestFromTarball(bytes, label),
    );
    assertIdentity(target, manifest, "tarball");
    return bytes;
  }, dependencies);
}

function assertIdentity(
  expected: Target,
  actual: Target,
  source: string,
): void {
  if (actual.name !== expected.name || actual.version !== expected.version) {
    throw new Error(
      `${expected.name}@${expected.version}: ${source} identity mismatch`,
    );
  }
}
