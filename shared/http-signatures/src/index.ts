import {
  createPrivateKey,
  createPublicKey,
  createHash,
  sign as nodeSign,
  verify as nodeVerify,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

const SIGNATURE_LABEL = "sig1";
const COVERED_COMPONENTS = [
  "@method",
  "@target-uri",
  "host",
  "date",
  "content-digest",
] as const;
const DEFAULT_FRESHNESS_WINDOW_MS = 60_000;
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;

export type HeaderBag = Headers | Record<string, string>;
export type BodyBytes = string | Uint8Array | ArrayBuffer | null | undefined;
export type SigningKey = KeyObject | JsonWebKey;

export interface HttpSignatureRequest {
  method: string;
  url: string | URL;
  headers: HeaderBag;
  body?: BodyBytes;
}

export interface SignRequestOptions {
  now?: Date;
}

export interface VerifyRequestOptions {
  now?: Date;
  freshnessWindowMs?: number;
}

export interface VerifiedSignature {
  keyId: string;
  domain: string;
  keyFingerprint: string;
}

export type JwksFetch = (url: string) => Promise<Response>;

export interface JwksResolverOptions {
  fetch?: JwksFetch;
  ttlMs?: number;
}

interface JwksDocument {
  keys?: JsonWebKey[];
}

interface CachedJwks {
  jwks: JwksDocument;
  expiresAt: number;
}

interface ParsedSignatureInput {
  params: string;
  components: string[];
  created: number;
  keyId: string;
  alg: string;
}

export class HttpSignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpSignatureVerificationError";
  }
}

export class JwksResolver {
  private readonly fetchFn: JwksFetch;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CachedJwks>();

  constructor(options: JwksResolverOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.ttlMs = options.ttlMs ?? DEFAULT_JWKS_TTL_MS;
  }

  async resolveKey(keyId: string): Promise<JsonWebKey> {
    const { jwksUrl, kid } = parseKeyId(keyId);
    const cached = await this.getJwks(jwksUrl, false);
    const cachedKey = findJwk(cached, kid);
    if (cachedKey) return cachedKey;

    const refreshed = await this.getJwks(jwksUrl, true);
    const refreshedKey = findJwk(refreshed, kid);
    if (refreshedKey) return refreshedKey;

    throw new HttpSignatureVerificationError(`No JWKS key found for ${keyId}`);
  }

  private async getJwks(
    jwksUrl: string,
    forceRefresh: boolean,
  ): Promise<JwksDocument> {
    const now = Date.now();
    const cached = this.cache.get(jwksUrl);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.jwks;
    }

    const response = await this.fetchFn(jwksUrl);
    if (!response.ok) {
      throw new HttpSignatureVerificationError(
        `Could not fetch JWKS from ${jwksUrl}: HTTP ${response.status}`,
      );
    }

    const jwks = (await response.json()) as JwksDocument;
    const ttlMs =
      cacheTtlMs(response.headers.get("cache-control")) ?? this.ttlMs;
    this.cache.set(jwksUrl, { jwks, expiresAt: now + ttlMs });
    return jwks;
  }
}

export async function signRequest(
  request: HttpSignatureRequest,
  privateKey: SigningKey,
  keyId: string,
  options: SignRequestOptions = {},
): Promise<void> {
  const created = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  const date = options.now ?? new Date(created * 1000);
  const contentDigest = await contentDigestHeader(request.body);

  setHeader(request.headers, "date", date.toUTCString());
  setHeader(request.headers, "content-digest", contentDigest);

  const signatureParams = signatureParamsValue(created, keyId);
  const base = signatureBase(request, signatureParams);
  const signature = nodeSign(null, Buffer.from(base), toPrivateKey(privateKey));

  setHeader(
    request.headers,
    "signature-input",
    `${SIGNATURE_LABEL}=${signatureParams}`,
  );
  setHeader(
    request.headers,
    "signature",
    `${SIGNATURE_LABEL}=:${signature.toString("base64")}:`,
  );
}

export async function verifyRequest(
  request: HttpSignatureRequest,
  resolver: JwksResolver,
  options: VerifyRequestOptions = {},
): Promise<VerifiedSignature | null> {
  const signatureInputHeader = getHeader(request.headers, "signature-input");
  const signatureHeader = getHeader(request.headers, "signature");
  if (!signatureInputHeader && !signatureHeader) return null;
  if (!signatureInputHeader || !signatureHeader) {
    throw new HttpSignatureVerificationError(
      "Incomplete HTTP signature headers",
    );
  }

  const parsed = parseSignatureInput(signatureInputHeader);
  if (parsed.alg.toLowerCase() !== "ed25519") {
    throw new HttpSignatureVerificationError(
      `Unsupported signature alg: ${parsed.alg}`,
    );
  }
  if (!sameComponents(parsed.components, COVERED_COMPONENTS)) {
    throw new HttpSignatureVerificationError(
      "Unsupported HTTP signature components",
    );
  }

  const windowMs = options.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
  const nowMs = options.now?.getTime() ?? Date.now();
  if (Math.abs(nowMs - parsed.created * 1000) > windowMs) {
    throw new HttpSignatureVerificationError(
      "HTTP signature is outside freshness window",
    );
  }

  const expectedDigest = await contentDigestHeader(request.body);
  const actualDigest = getRequiredHeader(request.headers, "content-digest");
  if (actualDigest !== expectedDigest) {
    throw new HttpSignatureVerificationError("Content-Digest mismatch");
  }

  const signature = parseSignature(signatureHeader);
  const base = signatureBase(request, parsed.params);
  const jwk = await resolver.resolveKey(parsed.keyId);
  const ok = nodeVerify(null, Buffer.from(base), toPublicKey(jwk), signature);
  if (!ok) {
    throw new HttpSignatureVerificationError(
      "HTTP signature verification failed",
    );
  }

  return {
    keyId: parsed.keyId,
    domain: new URL(parsed.keyId).hostname.toLowerCase(),
    keyFingerprint: keyFingerprint(jwk),
  };
}

export function keyFingerprint(jwk: JsonWebKey): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash("sha256").update(canonical).digest("base64url");
}

async function contentDigestHeader(body: BodyBytes): Promise<string> {
  const bytes = bodyBytes(body);
  const digest = createHash("sha256").update(bytes).digest("base64");
  return `sha-256=:${digest}:`;
}

function bodyBytes(body: BodyBytes): Buffer {
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(body);
}

function signatureBase(
  request: HttpSignatureRequest,
  signatureParams: string,
): string {
  const url = new URL(request.url);
  const lines = [
    `"@method": ${request.method.toUpperCase()}`,
    `"@target-uri": ${url.toString()}`,
    `"host": ${getHeader(request.headers, "host") ?? url.host}`,
    `"date": ${getRequiredHeader(request.headers, "date")}`,
    `"content-digest": ${getRequiredHeader(request.headers, "content-digest")}`,
    `"@signature-params": ${signatureParams}`,
  ];
  return lines.join("\n");
}

function signatureParamsValue(created: number, keyId: string): string {
  const components = COVERED_COMPONENTS.map(
    (component) => `"${component}"`,
  ).join(" ");
  return `(${components});created=${created};keyid="${escapeParam(keyId)}";alg="ed25519"`;
}

function parseSignatureInput(header: string): ParsedSignatureInput {
  const prefix = `${SIGNATURE_LABEL}=`;
  if (!header.startsWith(prefix)) {
    throw new HttpSignatureVerificationError(
      "Unsupported HTTP signature label",
    );
  }

  const params = header.slice(prefix.length);
  const componentsMatch = params.match(/^\(([^)]*)\)/);
  if (!componentsMatch?.[1]) {
    throw new HttpSignatureVerificationError(
      "Invalid Signature-Input components",
    );
  }

  const components = [
    ...componentsMatch[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g),
  ].map((match) => unescapeParam(match[1] ?? ""));
  const created = Number(params.match(/(?:^|;)created=(\d+)(?:;|$)/)?.[1]);
  const keyId = unescapeParam(
    params.match(/(?:^|;)keyid="([^"\\]*(?:\\.[^"\\]*)*)"(?:;|$)/)?.[1] ?? "",
  );
  const alg = unescapeParam(
    params.match(/(?:^|;)alg="([^"\\]*(?:\\.[^"\\]*)*)"(?:;|$)/)?.[1] ?? "",
  );

  if (!Number.isFinite(created) || !keyId || !alg) {
    throw new HttpSignatureVerificationError(
      "Invalid Signature-Input parameters",
    );
  }

  return { params, components, created, keyId, alg };
}

function parseSignature(header: string): Buffer {
  const match = header.match(/^sig1=:([^:]+):$/);
  if (!match?.[1]) {
    throw new HttpSignatureVerificationError("Invalid Signature header");
  }
  return Buffer.from(match[1], "base64");
}

function parseKeyId(keyId: string): { jwksUrl: string; kid: string } {
  const url = new URL(keyId);
  if (url.protocol !== "https:") {
    throw new HttpSignatureVerificationError("JWKS keyid must be https");
  }
  if (url.pathname !== "/.well-known/jwks.json") {
    throw new HttpSignatureVerificationError(
      "JWKS keyid must point at /.well-known/jwks.json",
    );
  }
  const kid = url.hash.slice(1);
  if (!kid) {
    throw new HttpSignatureVerificationError(
      "JWKS keyid must include a kid fragment",
    );
  }
  url.hash = "";
  return { jwksUrl: url.toString(), kid };
}

function findJwk(jwks: JwksDocument, kid: string): JsonWebKey | undefined {
  return jwks.keys?.find((key) => key["kid"] === kid);
}

function cacheTtlMs(cacheControl: string | null): number | undefined {
  const maxAge = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/)?.[1];
  return maxAge ? Number(maxAge) * 1000 : undefined;
}

function getHeader(headers: HeaderBag, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name,
  );
  return key ? headers[key] : undefined;
}

function getRequiredHeader(headers: HeaderBag, name: string): string {
  const value = getHeader(headers, name);
  if (!value) {
    throw new HttpSignatureVerificationError(
      `Missing required header: ${name}`,
    );
  }
  return value;
}

function setHeader(headers: HeaderBag, name: string, value: string): void {
  if (headers instanceof Headers) {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
}

function sameComponents(
  actual: string[],
  expected: readonly (typeof COVERED_COMPONENTS)[number][],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function toPrivateKey(key: SigningKey): KeyObject {
  return isKeyObject(key) ? key : createPrivateKey({ key, format: "jwk" });
}

function toPublicKey(key: JsonWebKey): KeyObject {
  return createPublicKey({ key, format: "jwk" });
}

function isKeyObject(key: SigningKey): key is KeyObject {
  return typeof (key as KeyObject).export === "function";
}

function escapeParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeParam(value: string): string {
  return value.replace(/\\([\\"])/g, "$1");
}
