import type { FetchLike } from "@brains/utils";

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

export interface UploadBlobInput {
  data: BlobPart;
  mimeType: string;
}

export interface UploadBlobResult {
  blob: unknown;
}

function trimEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

const defaultFetch: FetchLike = (input, init): Promise<Response> =>
  fetch(input, init);

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `AT Protocol request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export class AtprotoPdsClient {
  private readonly pdsEndpoint: string;
  private readonly identifier: string;
  private readonly appPassword: string;
  private readonly fetchFn: FetchLike;
  private session?: AtprotoSession;

  constructor(config: AtprotoPdsClientConfig) {
    this.pdsEndpoint = trimEndpoint(config.pdsEndpoint);
    this.identifier = config.identifier;
    this.appPassword = config.appPassword;
    this.fetchFn = config.fetch ?? defaultFetch;
  }

  async createSession(): Promise<AtprotoSession> {
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: this.identifier,
          password: this.appPassword,
        }),
      },
    );

    const session = await parseJsonResponse<AtprotoSession>(response);
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

    return parseJsonResponse<CreateRecordResult>(response);
  }

  async uploadBlob(input: UploadBlobInput): Promise<UploadBlobResult> {
    const session = await this.getSession();
    const response = await this.fetchFn(
      `${this.pdsEndpoint}/xrpc/com.atproto.repo.uploadBlob`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": input.mimeType,
        },
        body: new Blob([input.data], { type: input.mimeType }),
      },
    );

    return parseJsonResponse<UploadBlobResult>(response);
  }

  private async getSession(): Promise<AtprotoSession> {
    this.session ??= await this.createSession();
    return this.session;
  }
}
