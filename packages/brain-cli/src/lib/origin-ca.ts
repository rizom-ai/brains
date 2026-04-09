import { createSign, generateKeyPairSync } from "crypto";
import { z } from "@brains/utils";

export interface OriginKeyPair {
  privateKeyPem: string;
  publicKeyDer: Buffer;
}

export interface OriginCertificateRequest {
  csrPem: string;
  certificationRequestInfoDer: Buffer;
  signature: Buffer;
}

export interface CloudflareOriginCaResult {
  certificatePem: string;
  expiresOn?: string;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const CN_OID = "2.5.4.3";
const SHA256_WITH_RSA_ENCRYPTION_OID = "1.2.840.113549.1.1.11";

const cloudflareErrorEntrySchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough();

const cloudflareResponseMetaSchema = z
  .object({
    errors: z.array(cloudflareErrorEntrySchema).optional(),
    messages: z.array(cloudflareErrorEntrySchema).optional(),
  })
  .passthrough();

const cloudflareOriginCaResultSchema = z
  .object({
    certificate: z.string().min(1),
    expires_on: z.string().optional(),
  })
  .passthrough();

const cloudflareOriginCaResponseSchema = z
  .object({
    success: z.literal(true),
    result: cloudflareOriginCaResultSchema,
  })
  .passthrough();

const cloudflareSuccessResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .passthrough();

/**
 * Generate an RSA key pair for Cloudflare Origin CA bootstrap.
 *
 * The private key is PEM-encoded PKCS#8 so it can be written directly to disk.
 * The public key is SPKI DER so it can be embedded into a PKCS#10 CSR.
 */
export function generateOriginKeyPair(): OriginKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "der",
    },
  });

  return {
    privateKeyPem: privateKey,
    publicKeyDer: Buffer.from(publicKey),
  };
}

/**
 * Build a PKCS#10 certificate signing request for the given domain.
 */
export function createOriginCertificateRequest(
  domain: string,
  keyPair: OriginKeyPair,
): OriginCertificateRequest {
  const subject = encodeSequence(
    encodeSet(encodeSequence(encodeOid(CN_OID), encodeUtf8String(domain))),
  );

  const certificationRequestInfoDer = encodeSequence(
    encodeInteger(0),
    subject,
    Buffer.from(keyPair.publicKeyDer),
    encodeContextSpecific(0, Buffer.alloc(0)),
  );

  const signature = createSign("sha256")
    .update(certificationRequestInfoDer)
    .sign(keyPair.privateKeyPem);

  const csrDer = encodeSequence(
    certificationRequestInfoDer,
    encodeSequence(encodeOid(SHA256_WITH_RSA_ENCRYPTION_OID), encodeNull()),
    encodeBitString(signature),
  );

  return {
    csrPem: wrapPem("CERTIFICATE REQUEST", csrDer),
    certificationRequestInfoDer,
    signature,
  };
}

/**
 * Issue a Cloudflare Origin CA certificate from a CSR.
 */
export async function issueCloudflareOriginCertificate(
  fetchImpl: FetchLike,
  token: string,
  csrPem: string,
  domain: string,
): Promise<CloudflareOriginCaResult> {
  const response = await fetchImpl(
    "https://api.cloudflare.com/client/v4/certificates",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostnames: [domain, `*.${domain}`],
        requested_validity: 5475,
        request_type: "origin-rsa",
        csr: csrPem,
      }),
    },
  );

  const payload = await readJson(response);
  const parsed = cloudflareOriginCaResponseSchema.safeParse(payload);

  if (!response.ok || !parsed.success) {
    throw new Error(
      `Cloudflare Origin CA request failed${formatResponseError(response, payload)}`,
    );
  }

  const certificatePem = parsed.data.result.certificate.trim();
  const result: CloudflareOriginCaResult = {
    certificatePem: `${certificatePem}\n`,
  };

  if (parsed.data.result.expires_on) {
    result.expiresOn = parsed.data.result.expires_on;
  }

  return result;
}

/**
 * Switch the zone SSL mode to Full (strict) so kamal-proxy can terminate
 * TLS with the Origin CA certificate.
 */
export async function setCloudflareZoneSslStrict(
  fetchImpl: FetchLike,
  token: string,
  zoneId: string,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: "strict" }),
    },
  );

  const payload = await readJson(response);
  const parsed = cloudflareSuccessResponseSchema.safeParse(payload);

  if (!response.ok || !parsed.success) {
    throw new Error(
      `Cloudflare zone SSL update failed${formatResponseError(response, payload)}`,
    );
  }
}

export function wrapPem(label: string, der: Buffer): string {
  const base64 = der.toString("base64");
  const lines = base64.match(/.{1,64}/g) ?? [];
  return [
    `-----BEGIN ${label}-----`,
    ...lines,
    `-----END ${label}-----`,
    "",
  ].join("\n");
}

function encodeInteger(value: number): Buffer {
  if (value !== 0) {
    throw new Error("Only zero-valued INTEGER encoding is currently supported");
  }

  return Buffer.from([0x02, 0x01, 0x00]);
}

function encodeOid(oid: string): Buffer {
  const parts = oid.split(".").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid OID: ${oid}`);
  }

  const first = parts[0];
  const second = parts[1];
  if (first === undefined || second === undefined) {
    throw new Error(`Invalid OID: ${oid}`);
  }

  const firstByte = first * 40 + second;
  const encoded: number[] = [firstByte];

  for (const part of parts.slice(2)) {
    const base128 = encodeBase128(part);
    encoded.push(...base128);
  }

  return encodeTag(0x06, Buffer.from(encoded));
}

function encodeUtf8String(value: string): Buffer {
  return encodeTag(0x0c, Buffer.from(value, "utf8"));
}

function encodeBitString(value: Buffer): Buffer {
  return encodeTag(0x03, Buffer.concat([Buffer.from([0x00]), value]));
}

function encodeNull(): Buffer {
  return Buffer.from([0x05, 0x00]);
}

function encodeSequence(...parts: Buffer[]): Buffer {
  return encodeTag(0x30, Buffer.concat(parts));
}

function encodeSet(...parts: Buffer[]): Buffer {
  return encodeTag(0x31, Buffer.concat(parts));
}

function encodeContextSpecific(tagNumber: number, content: Buffer): Buffer {
  return encodeTag(0xa0 + tagNumber, content);
}

function encodeTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([tag]),
    encodeLength(content.length),
    content,
  ]);
}

function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }

  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeBase128(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid OID component: ${value}`);
  }

  if (value === 0) {
    return [0x00];
  }

  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    bytes.unshift(remaining & 0x7f);
    remaining >>= 7;
  }

  for (let index = 0; index < bytes.length - 1; index += 1) {
    bytes[index] = (bytes[index] ?? 0) | 0x80;
  }

  return bytes;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function formatResponseError(response: Response, payload: unknown): string {
  const messages = collectCloudflareMessages(payload);
  const suffix = messages.length > 0 ? `: ${messages.join("; ")}` : "";
  return ` (${response.status} ${response.statusText}${suffix})`;
}

function collectCloudflareMessages(payload: unknown): string[] {
  const parsed = cloudflareResponseMetaSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  return [...(parsed.data.errors ?? []), ...(parsed.data.messages ?? [])]
    .map((entry) => entry.message)
    .filter(
      (message): message is string =>
        typeof message === "string" && message.length > 0,
    );
}
