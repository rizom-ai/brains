import type { AtprotoBlobRef } from "@brains/atproto-contracts";
import type { PublishImageData } from "@brains/contracts";
import type { EntityServiceClient } from "@brains/plugins";
import { readBoundedJsonResponse } from "@brains/utils/bounded-json-response";
import type { FetchLike } from "@brains/utils/fetch-like";
import { z } from "@brains/utils/zod";

export interface AtprotoSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface AtprotoPdsClientConfig {
  pdsEndpoint: string;
  identifier: string;
  appPassword: string;
  fetch?: FetchLike;
  requestTimeoutMs?: number;
  getFileTransfers?: () =>
    | Pick<NonNullable<EntityServiceClient["fileAssets"]>, "postHttp">
    | undefined;
}

// Publishing runs on boot and shutdown-drain paths; an unresponsive PDS must
// never hold either open indefinitely.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function withRequestTimeout(fetchFn: FetchLike, timeoutMs: number): FetchLike {
  return (input, init) =>
    fetchFn(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
}

export interface CreateRecordInput {
  repo: string;
  collection: string;
  record: Record<string, unknown>;
  rkey?: string;
  validate?: boolean;
}

export interface CreateRecordResult {
  uri: string;
  cid: string;
}

export interface PutRecordInput extends CreateRecordInput {
  rkey: string;
  swapRecord?: string;
}

export type PutRecordResult = CreateRecordResult;

export interface GetRecordInput {
  repo: string;
  collection: string;
  rkey: string;
}

export interface GetRecordResult {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

export interface DeleteRecordInput {
  repo: string;
  collection: string;
  rkey: string;
}

export type UploadBlobInput = PublishImageData;

export interface UploadBlobResult {
  blob: AtprotoBlobRef;
}

export class AcknowledgedAtprotoBlobError extends Error {
  public readonly receipt: UploadBlobResult;
  constructor(receipt: UploadBlobResult) {
    super("AT Protocol blob receipt does not match the submitted file");
    this.name = "AcknowledgedAtprotoBlobError";
    this.receipt = receipt;
  }
}

const atprotoErrorResponseSchema = z.looseObject({
  message: z.string(),
});

const atprotoSessionSchema = z.looseObject({
  did: z.string(),
  handle: z.string(),
  accessJwt: z.string(),
  refreshJwt: z.string(),
});

const recordResultSchema = z.looseObject({
  uri: z.string(),
  cid: z.string(),
});

const getRecordResultSchema = recordResultSchema.extend({
  value: z.record(z.string(), z.unknown()),
});

const blobRefSchema = z
  .looseObject({
    $type: z.literal("blob").optional(),
    ref: z.looseObject({
      $link: z.string().min(1).max(1024),
    }),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
  })
  .transform((blob): AtprotoBlobRef => ({
    ...(blob.$type !== undefined ? { $type: blob.$type } : {}),
    ref: { $link: blob.ref.$link },
    mimeType: blob.mimeType,
    size: blob.size,
  }));

const uploadBlobResultSchema = z.looseObject({
  blob: blobRefSchema,
});

function trimEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

const defaultFetch: FetchLike = (input, init): Promise<Response> =>
  fetch(input, init);

async function parseJsonResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!response.body) assertResponseOk(response, undefined);
  let body: unknown;
  try {
    body = await readBoundedJsonResponse(
      new Response(response.body, { headers: response.headers }),
      64 * 1024,
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error(
        response.ok
          ? "Failed to parse JSON"
          : `AT Protocol request failed with ${response.status}`,
        { cause: error },
      );
    throw error;
  }
  assertResponseOk(response, body);
  return schema.parse(body);
}

function assertResponseOk(response: Response, body: unknown): void {
  if (response.ok) return;

  const error = atprotoErrorResponseSchema.safeParse(body);
  throw new Error(
    error.success
      ? error.data.message
      : `AT Protocol request failed with ${response.status}`,
  );
}

export class AtprotoPdsClient {
  private readonly pdsEndpoint: string;
  private readonly identifier: string;
  private readonly appPassword: string;
  private readonly fetchFn: FetchLike;
  private session?: AtprotoSession;
  private readonly getFileTransfers: AtprotoPdsClientConfig["getFileTransfers"];
  private readonly requestTimeoutMs: number;

  constructor(config: AtprotoPdsClientConfig) {
    this.getFileTransfers = config.getFileTransfers;
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.pdsEndpoint = trimEndpoint(config.pdsEndpoint);
    this.identifier = config.identifier;
    this.appPassword = config.appPassword;
    this.fetchFn = withRequestTimeout(
      config.fetch ?? defaultFetch,
      config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
  }

  async createSession(signal?: AbortSignal): Promise<AtprotoSession> {
    signal?.throwIfAborted();
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(signal && { signal }),
        body: JSON.stringify({
          identifier: this.identifier,
          password: this.appPassword,
        }),
      },
    );

    const session = await parseJsonResponse(response, atprotoSessionSchema);
    this.session = session;
    return session;
  }

  async createRecord(input: CreateRecordInput): Promise<CreateRecordResult> {
    const session = await this.getSession();
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.repo.createRecord`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: input.repo,
          collection: input.collection,
          record: input.record,
          ...(input.rkey && { rkey: input.rkey }),
          ...(input.validate !== undefined && { validate: input.validate }),
        }),
      },
    );

    return parseJsonResponse(response, recordResultSchema);
  }

  async putRecord(input: PutRecordInput): Promise<PutRecordResult> {
    const session = await this.getSession();
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.repo.putRecord`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: input.repo,
          collection: input.collection,
          record: input.record,
          rkey: input.rkey,
          ...(input.validate !== undefined && { validate: input.validate }),
          ...(input.swapRecord !== undefined && {
            swapRecord: input.swapRecord,
          }),
        }),
      },
    );

    return parseJsonResponse(response, recordResultSchema);
  }

  async getRecord(input: GetRecordInput): Promise<GetRecordResult> {
    const params = new URLSearchParams({
      repo: input.repo,
      collection: input.collection,
      rkey: input.rkey,
    });
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
      { method: "GET" },
    );

    return parseJsonResponse(response, getRecordResultSchema);
  }

  async deleteRecord(input: DeleteRecordInput): Promise<void> {
    const session = await this.getSession();
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.repo.deleteRecord`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    await parseJsonResponse(response, z.unknown());
  }

  async uploadBlob(input: UploadBlobInput): Promise<UploadBlobResult> {
    input.signal.throwIfAborted();
    const files = this.getFileTransfers?.();
    if (!files) throw new Error("AT Protocol file upload is not provisioned");
    const session = await this.getSession(input.signal);
    input.signal.throwIfAborted();
    const response = await files.postHttp(
      {
        sourceFile: input.sourceFile,
        facts: { sizeBytes: input.sizeBytes, sha256: input.sha256 },
        url: `${this.pdsEndpoint}/xrpc/com.atproto.repo.uploadBlob`,
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": input.mimeType,
        },
        responseMetadata: {
          link: ["blob", "ref", "$link"],
          mimeType: ["blob", "mimeType"],
          size: ["blob", "size"],
        },
      },
      {
        signal: AbortSignal.any([
          input.signal,
          AbortSignal.timeout(this.requestTimeoutMs),
        ]),
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new Error(
        `AT Protocol blob upload failed with ${response.statusCode}`,
      );
    const metadata = response.responseMetadata;
    const receipt = uploadBlobResultSchema.parse({
      blob: {
        $type: "blob",
        ref: { $link: metadata?.["link"] },
        mimeType: metadata?.["mimeType"],
        size: metadata?.["size"],
      },
    });
    if (
      receipt.blob.size !== input.sizeBytes ||
      receipt.blob.mimeType !== input.mimeType
    )
      throw new AcknowledgedAtprotoBlobError(receipt);
    return receipt;
  }

  private async getSession(signal?: AbortSignal): Promise<AtprotoSession> {
    this.session ??= await this.createSession(signal);
    return this.session;
  }
}
