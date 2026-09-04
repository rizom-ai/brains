import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { z } from "@brains/utils/zod";
import type { RegisteredOAuthClient } from "./types";

const MAX_DOCUMENT_BYTES = 5 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type ClientMetadataFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ClientMetadataDocumentResolverOptions {
  fetch?: ClientMetadataFetch;
  resolveAddresses?: (hostname: string) => Promise<ResolvedAddress[]>;
  now?: () => number;
}

interface CachedClientMetadata {
  client: RegisteredOAuthClient;
  expiresAt: number;
}

const clientMetadataDocumentSchema = z
  .looseObject({
    client_id: z.string(),
    client_name: z.string().min(1),
    redirect_uris: z.array(z.url()).min(1),
    application_type: z.enum(["native", "web"]).optional(),
    token_endpoint_auth_method: z.literal("none").default("none"),
    // RFC 7591: grant_types states what the client may use, not what this
    // server must support. Claude's own metadata document lists
    // "urn:ietf:params:oauth:grant-type:jwt-bearer" alongside the two grants it
    // actually uses here. Rejecting the whole document over an entry that is
    // never exercised locks out the client, so unsupported grants are dropped
    // and authorization_code is required to survive the filter.
    grant_types: z
      .array(z.string())
      .default(["authorization_code", "refresh_token"])
      .transform((grantTypes) =>
        grantTypes.filter(
          (grantType): grantType is "authorization_code" | "refresh_token" =>
            grantType === "authorization_code" || grantType === "refresh_token",
        ),
      )
      .refine((grantTypes) => grantTypes.includes("authorization_code"), {
        message: "grant_types must include authorization_code",
      }),
    response_types: z.array(z.literal("code")).default(["code"]),
    scope: z.string().optional(),
    client_uri: z.url().optional(),
    logo_uri: z.url().optional(),
    contacts: z.array(z.string()).optional(),
    client_secret: z.never().optional(),
    client_secret_expires_at: z.never().optional(),
  })
  .transform((metadata): RegisteredOAuthClient => ({
    client_id: metadata.client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: metadata.client_name,
    redirect_uris: metadata.redirect_uris,
    token_endpoint_auth_method: metadata.token_endpoint_auth_method,
    grant_types: metadata.grant_types,
    response_types: metadata.response_types,
    ...(metadata.application_type
      ? { application_type: metadata.application_type }
      : {}),
    ...(metadata.scope ? { scope: metadata.scope } : {}),
    ...(metadata.client_uri ? { client_uri: metadata.client_uri } : {}),
    ...(metadata.logo_uri ? { logo_uri: metadata.logo_uri } : {}),
    ...(metadata.contacts ? { contacts: metadata.contacts } : {}),
  }));

export class ClientMetadataDocumentResolver {
  private readonly fetchDocument: ClientMetadataFetch;
  private readonly resolveAddresses: (
    hostname: string,
  ) => Promise<ResolvedAddress[]>;
  private readonly now: () => number;
  private readonly cache = new Map<string, CachedClientMetadata>();

  constructor(options: ClientMetadataDocumentResolverOptions = {}) {
    this.fetchDocument =
      options.fetch ??
      ((input, init): Promise<Response> => globalThis.fetch(input, init));
    this.resolveAddresses =
      options.resolveAddresses ??
      (async (hostname): Promise<ResolvedAddress[]> =>
        lookup(hostname, { all: true, verbatim: true }));
    this.now = options.now ?? Date.now;
  }

  async resolve(clientId: string): Promise<RegisteredOAuthClient> {
    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > this.now()) return cached.client;
    this.cache.delete(clientId);

    let url = parseClientIdUrl(clientId);
    let response: Response | undefined;
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    try {
      for (
        let redirectCount = 0;
        redirectCount <= MAX_REDIRECTS;
        redirectCount += 1
      ) {
        await this.assertPublicDestination(url);
        response = await this.fetchDocument(url, {
          method: "GET",
          headers: { accept: "application/json, application/*+json" },
          redirect: "manual",
          signal,
        });

        if (!isRedirect(response.status)) break;
        if (redirectCount === MAX_REDIRECTS) {
          throw new ClientMetadataDocumentError(
            "Client metadata document redirected too many times",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new ClientMetadataDocumentError(
            "Client metadata document redirect is missing Location",
          );
        }
        url = parseClientIdUrl(new URL(location, url).toString());
      }
    } catch (error) {
      if (error instanceof ClientMetadataDocumentError) throw error;
      throw new ClientMetadataDocumentError(
        error instanceof Error && error.name === "AbortError"
          ? "Client metadata document request timed out"
          : "Failed to fetch client metadata document",
      );
    }

    if (!response?.ok) {
      throw new ClientMetadataDocumentError(
        `Client metadata document returned HTTP ${response?.status ?? 0}`,
      );
    }
    assertJsonContentType(response.headers.get("content-type"));

    let documentText: string;
    try {
      documentText = await readLimitedBody(response, MAX_DOCUMENT_BYTES);
    } catch (error) {
      if (error instanceof ClientMetadataDocumentError) throw error;
      throw new ClientMetadataDocumentError(
        error instanceof Error && error.name === "AbortError"
          ? "Client metadata document request timed out"
          : "Failed to read client metadata document",
      );
    }

    let document: unknown;
    try {
      document = JSON.parse(documentText);
    } catch {
      throw new ClientMetadataDocumentError(
        "Client metadata document must contain valid JSON",
      );
    }

    const parsed = clientMetadataDocumentSchema.safeParse(document);
    if (!parsed.success) {
      const symmetricMethod = getTokenEndpointAuthMethod(document);
      throw new ClientMetadataDocumentError(
        symmetricMethod && symmetricMethod !== "none"
          ? "Client metadata documents currently support public clients using token_endpoint_auth_method none"
          : `Invalid client metadata document: ${parsed.error.message}`,
      );
    }
    if (parsed.data.client_id !== clientId) {
      throw new ClientMetadataDocumentError(
        "Client metadata document client_id must exactly match its URL",
      );
    }
    validateApplicationTypeRedirectUris(parsed.data);

    const cacheLifetime = getCacheLifetimeMs(response.headers, this.now());
    if (cacheLifetime > 0) {
      this.cache.set(clientId, {
        client: parsed.data,
        expiresAt: this.now() + cacheLifetime,
      });
    }
    return parsed.data;
  }

  private async assertPublicDestination(url: URL): Promise<void> {
    if (isLocalHostname(url.hostname)) {
      throw new ClientMetadataDocumentError(
        "Client metadata document URL must use a public host",
      );
    }

    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    const literalFamily = isIP(hostname);
    const addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await this.resolveAddresses(hostname);
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new ClientMetadataDocumentError(
        "Client metadata document resolved to a non-public network address",
      );
    }
  }
}

export function isClientMetadataDocumentId(clientId: string): boolean {
  try {
    return new URL(clientId).protocol === "https:";
  } catch {
    return false;
  }
}

function parseClientIdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new ClientMetadataDocumentError(
      "Client metadata document client_id must be a valid HTTPS URL",
    );
  }

  const rawPath = rawUrlPath(clientId);
  if (
    url.protocol !== "https:" ||
    rawPath === "" ||
    rawPath === "/" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    hasDotPathSegment(rawPath)
  ) {
    throw new ClientMetadataDocumentError(
      "Client metadata document client_id must be an HTTPS URL with a non-root path, no credentials, dot segments, or fragment",
    );
  }
  return url;
}

function rawUrlPath(value: string): string {
  const authorityStart = value.indexOf("//");
  const pathStart = value.indexOf("/", authorityStart + 2);
  if (pathStart === -1) return "";
  return value.slice(pathStart).split(/[?#]/u, 1)[0] ?? "";
}

function hasDotPathSegment(path: string): boolean {
  return path.split("/").some((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === "..";
    } catch {
      return true;
    }
  });
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function assertJsonContentType(contentType: string | null): void {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    mediaType !== "application/json" &&
    !/^application\/[a-z0-9!#$&^_.+-]+\+json$/u.test(mediaType ?? "")
  ) {
    throw new ClientMetadataDocumentError(
      "Client metadata document must use a JSON content type",
    );
  }
}

async function readLimitedBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ClientMetadataDocumentError(
      `Client metadata document exceeds ${maximumBytes} bytes`,
    );
  }

  const body = response.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let readResult = await reader.read();
  while (!readResult.done) {
    size += readResult.value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new ClientMetadataDocumentError(
        `Client metadata document exceeds ${maximumBytes} bytes`,
      );
    }
    chunks.push(readResult.value);
    readResult = await reader.read();
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getCacheLifetimeMs(headers: Headers, now: number): number {
  const cacheControl = headers.get("cache-control")?.toLowerCase() ?? "";
  if (/\b(?:no-cache|no-store)\b/u.test(cacheControl)) return 0;
  const maxAge = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/u)?.[1];
  const ageSeconds = Number(headers.get("age") ?? 0);
  if (maxAge) {
    return Math.max(
      0,
      (Number(maxAge) - (Number.isFinite(ageSeconds) ? ageSeconds : 0)) * 1_000,
    );
  }

  const expires = headers.get("expires");
  if (!expires) return 0;
  const expiresAt = Date.parse(expires);
  return Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : 0;
}

function getTokenEndpointAuthMethod(document: unknown): string | undefined {
  if (!document || typeof document !== "object") return undefined;
  const value = Reflect.get(document, "token_endpoint_auth_method");
  return typeof value === "string" ? value : undefined;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [first = 0, second = 0] = octets;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPublicIpv6(address: string): boolean {
  const segments = parseIpv6Segments(address);
  if (!segments) return false;

  const [first = 0] = segments;
  const isUnspecified = segments.every((segment) => segment === 0);
  const isLoopback =
    segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1;
  if (
    isUnspecified ||
    isLoopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  ) {
    return false;
  }

  const hasIpv4Prefix =
    segments.slice(0, 5).every((segment) => segment === 0) &&
    (segments[5] === 0 || segments[5] === 0xffff);
  if (!hasIpv4Prefix) return true;

  const high = segments[6] ?? 0;
  const low = segments[7] ?? 0;
  return isPublicIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

function parseIpv6Segments(address: string): number[] | undefined {
  let normalized = address.toLowerCase();
  const dottedIpv4 = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  if (dottedIpv4) {
    const octets = dottedIpv4.split(".").map(Number);
    const high = (((octets[0] ?? 0) << 8) | (octets[1] ?? 0)).toString(16);
    const low = (((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16);
    normalized = normalized.replace(dottedIpv4, `${high}:${low}`);
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = parseHextets(halves[0] ?? "");
  const right = parseHextets(halves[1] ?? "");
  if (!left || !right) return undefined;
  if (halves.length === 1) return left.length === 8 ? left : undefined;

  const missing = 8 - left.length - right.length;
  return missing >= 1
    ? [...left, ...Array<number>(missing).fill(0), ...right]
    : undefined;
}

function parseHextets(value: string): number[] | undefined {
  if (value === "") return [];
  const segments = value.split(":");
  if (segments.some((segment) => !/^[0-9a-f]{1,4}$/u.test(segment))) {
    return undefined;
  }
  return segments.map((segment) => Number.parseInt(segment, 16));
}

function validateApplicationTypeRedirectUris(
  client: RegisteredOAuthClient,
): void {
  if (!client.application_type) return;

  for (const redirectUri of client.redirect_uris) {
    const url = new URL(redirectUri);
    if (client.application_type === "web" && url.protocol !== "https:") {
      throw new ClientMetadataDocumentError(
        "web application redirect_uris must use HTTPS",
      );
    }
    if (
      client.application_type === "native" &&
      url.protocol === "http:" &&
      !isLoopbackRedirectHostname(url.hostname)
    ) {
      throw new ClientMetadataDocumentError(
        "native application HTTP redirect_uris must use a loopback host",
      );
    }
  }
}

function isLoopbackRedirectHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

export class ClientMetadataDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientMetadataDocumentError";
  }
}
