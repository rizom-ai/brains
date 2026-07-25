import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FetchLike } from "./fetch-like";

export type ResolveHostname = (hostname: string) => Promise<string[]>;

export class UnsafePublicResourceError extends Error {}

export interface SafePublicFetchOptions {
  fetchFn?: FetchLike | undefined;
  resolveHostname?: ResolveHostname | undefined;
  timeoutMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const credentialHeaders = ["authorization", "cookie", "proxy-authorization"];

const defaultResolveHostname: ResolveHostname = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a = -1, b = -1, c = -1] = parts;
  if (a <= 0 || a >= 224) return false;
  if (a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function parseIpv6Groups(address: string): number[] | undefined {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const compression = normalized.split("::");
  if (compression.length > 2) return undefined;

  const parseSide = (side: string): number[] | undefined => {
    if (side.length === 0) return [];
    const raw = side.split(":");
    const groups: number[] = [];
    for (const segment of raw) {
      if (segment.includes(".")) {
        const parts = segment.split(".").map(Number);
        if (
          parts.length !== 4 ||
          parts.some(
            (part) => !Number.isInteger(part) || part < 0 || part > 255,
          )
        ) {
          return undefined;
        }
        groups.push((parts[0] ?? 0) * 256 + (parts[1] ?? 0));
        groups.push((parts[2] ?? 0) * 256 + (parts[3] ?? 0));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(segment)) return undefined;
      groups.push(Number.parseInt(segment, 16));
    }
    return groups;
  };

  const left = parseSide(compression[0] ?? "");
  const right = parseSide(compression[1] ?? "");
  if (!left || !right) return undefined;
  if (compression.length === 1) {
    return left.length === 8 ? left : undefined;
  }
  const omitted = 8 - left.length - right.length;
  if (omitted < 1) return undefined;
  return [...left, ...Array.from({ length: omitted }, () => 0), ...right];
}

function ipv6Value(address: string): bigint | undefined {
  const groups = parseIpv6Groups(address);
  if (!groups) return undefined;
  return groups.reduce((value, group) => (value << 16n) + BigInt(group), 0n);
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6Value(address);
  if (value === undefined || value <= 1n) return false;

  // IPv4-mapped IPv6 addresses inherit the embedded IPv4 classification.
  if (value >> 32n === 0xffffn) {
    const ipv4 = Number(value & 0xffff_ffffn);
    return isPublicIpv4(
      [
        (ipv4 >>> 24) & 255,
        (ipv4 >>> 16) & 255,
        (ipv4 >>> 8) & 255,
        ipv4 & 255,
      ].join("."),
    );
  }

  // Public global unicast is 2000::/3. Reject special-purpose ranges inside
  // it that can tunnel or encode non-public destinations.
  if (value >> 125n !== 1n) return false;
  const top16 = value >> 112n;
  const top28 = value >> 100n;
  const top32 = value >> 96n;
  const top48 = value >> 80n;
  if (top16 === 0x2002n) return false; // 6to4
  if (top32 === 0x2001_0000n) return false; // Teredo
  if (top32 === 0x2001_0db8n) return false; // documentation
  if (top48 === 0x2001_0000_0002n) return false; // benchmarking
  if (top28 === 0x200_1001n || top28 === 0x200_1002n) return false; // ORCHID
  return true;
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

export async function assertSafePublicHttpsUrl(
  input: string | URL,
  resolveHostname: ResolveHostname = defaultResolveHostname,
): Promise<URL> {
  const url = input instanceof URL ? new URL(input) : new URL(input);
  if (url.protocol !== "https:") {
    throw new UnsafePublicResourceError(
      `Discovery endpoint must use HTTPS: ${url.toString()}`,
    );
  }
  if (url.username || url.password) {
    throw new UnsafePublicResourceError(
      "Discovery endpoint must not contain credentials",
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafePublicResourceError(
      `Discovery endpoint is non-public: ${hostname}`,
    );
  }

  const addresses = isIP(hostname)
    ? [hostname]
    : await resolveHostname(hostname);
  if (addresses.length === 0) {
    throw new UnsafePublicResourceError(
      `Discovery endpoint hostname did not resolve: ${hostname}`,
    );
  }
  const unsafe = addresses.find((address) => !isPublicIpAddress(address));
  if (unsafe) {
    throw new UnsafePublicResourceError(
      `Discovery endpoint resolved to a non-public address: ${unsafe}`,
    );
  }
  return url;
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
): Promise<ArrayBuffer> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new UnsafePublicResourceError(
      `Discovery response exceeds ${String(maxResponseBytes)} bytes`,
    );
  }
  if (!response.body) return new ArrayBuffer(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxResponseBytes) {
      throw new UnsafePublicResourceError(
        `Discovery response exceeds ${String(maxResponseBytes)} bytes`,
      );
    }
    chunks.push(chunk);
  }

  const buffer = new ArrayBuffer(total);
  const body = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/** Candidate-controlled, credential-free fetch with redirect and body caps. */
export function createSafePublicFetch(
  options: SafePublicFetchOptions,
): FetchLike {
  const fetchFn = options.fetchFn ?? fetch;
  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;

  return async (input, init = {}) => {
    let current = await assertSafePublicHttpsUrl(
      input instanceof Request ? input.url : input,
      resolveHostname,
    );
    const headers = new Headers(init.headers);
    for (const name of credentialHeaders) headers.delete(name);
    let redirects = 0;

    for (;;) {
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      const response = await fetchFn(current, {
        ...init,
        credentials: "omit",
        headers,
        redirect: "manual",
        signal,
      });

      if (redirectStatuses.has(response.status)) {
        if (redirects >= options.maxRedirects) {
          throw new UnsafePublicResourceError(
            "Discovery response exceeded redirect limit",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new UnsafePublicResourceError(
            "Discovery redirect has no location",
          );
        }
        current = await assertSafePublicHttpsUrl(
          new URL(location, current),
          resolveHostname,
        );
        redirects += 1;
        continue;
      }

      const body = await readBoundedBody(response, options.maxResponseBytes);
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  };
}
