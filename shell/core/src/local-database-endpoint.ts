import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { chmod, rm } from "node:fs/promises";
import { platform } from "node:os";
import { constantTimeEqual } from "@brains/utils/constant-time";
import {
  OperationProvenanceSchema,
  type OperationProvenance,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { LocalDatabaseEndpointConfig } from "./runtime-process-role";

export const LOCAL_DATABASE_PROTOCOL_VERSION = 1;
export const LOCAL_DATABASE_CLI_SERVICE = "cli";
const DEFAULT_MAX_FRAME_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_IN_FLIGHT = 128;
const DEFAULT_MAX_PENDING_BYTES = 32 * 1024 * 1024;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;

export interface LocalDatabaseOperationScope {
  readonly provenance: OperationProvenance;
  readonly operationId: string;
}

export interface LocalDatabaseRequestContext {
  readonly signal: AbortSignal;
  readonly scope: LocalDatabaseOperationScope | undefined;
  readonly sessionId: string;
}

export type LocalDatabaseRequestHandler = (
  payload: unknown,
  context: LocalDatabaseRequestContext,
) => Promise<unknown>;

export interface LocalDatabaseRpcClientOptions {
  config: LocalDatabaseEndpointConfig;
  getOperationScope?:
    (() => LocalDatabaseOperationScope | undefined) | undefined;
  maxFrameBytes?: number | undefined;
  maxInFlight?: number | undefined;
  maxPendingBytes?: number | undefined;
  /** Optional transport deadline. Omit to rely on operation cancellation. */
  requestTimeoutMs?: number | undefined;
}

export interface LocalDatabaseRpcServerOptions {
  config: LocalDatabaseEndpointConfig;
  maxFrameBytes?: number | undefined;
  maxInFlight?: number | undefined;
}

type WireMessage =
  | {
      kind: "handshake";
      version: number;
      secret: string;
      sessionId: string;
    }
  | { kind: "handshake-accepted"; version: number; sessionId: string }
  | { kind: "shutdown"; reason: string }
  | {
      kind: "request";
      requestId: string;
      service: string;
      payload: unknown;
      scope?: LocalDatabaseOperationScope | undefined;
    }
  | { kind: "cancel"; requestId: string }
  | {
      kind: "response";
      requestId: string;
      ok: true;
      value?: unknown;
    }
  | {
      kind: "response";
      requestId: string;
      ok: false;
      error: { name: string; message: string; code?: string | undefined };
    };

const operationScopeSchema: z.ZodType<LocalDatabaseOperationScope, unknown> =
  z.strictObject({
    provenance: OperationProvenanceSchema,
    operationId: z.string().min(1),
  });

const wireMessageSchema: z.ZodType<WireMessage, unknown> = z.union([
  z.strictObject({
    kind: z.literal("handshake"),
    version: z.number().int(),
    secret: z.string().min(1),
    sessionId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("handshake-accepted"),
    version: z.number().int(),
    sessionId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("shutdown"),
    reason: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("request"),
    requestId: z.string().min(1),
    service: z.string().min(1),
    payload: z.unknown(),
    scope: operationScopeSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("cancel"),
    requestId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("response"),
    requestId: z.string().min(1),
    ok: z.literal(true),
    value: z.unknown().optional(),
  }),
  z.strictObject({
    kind: z.literal("response"),
    requestId: z.string().min(1),
    ok: z.literal(false),
    error: z.strictObject({
      name: z.string().min(1),
      message: z.string(),
      code: z.string().optional(),
    }),
  }),
]);

const binaryMarkerKey = "$brainsBinary";
type SupportedBinaryType = "uint8" | "float32" | "float64";

function encodeBinary(
  type: SupportedBinaryType,
  value: Uint8Array,
): Record<string, string> {
  return {
    [binaryMarkerKey]: type,
    data: Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).toString("base64"),
  };
}

function wireJsonReplacer(
  this: Record<string, unknown>,
  key: string,
  value: unknown,
): unknown {
  const original = this[key];
  if (original === null || original === undefined) return original;
  if (typeof original === "number" && !Number.isFinite(original)) {
    throw new LocalDatabaseProtocolError(
      "Local database payload contains a non-finite number",
      "LOCAL_DATABASE_UNSUPPORTED_VALUE",
    );
  }
  if (original instanceof Float32Array) {
    return encodeBinary(
      "float32",
      new Uint8Array(original.buffer, original.byteOffset, original.byteLength),
    );
  }
  if (original instanceof Float64Array) {
    return encodeBinary(
      "float64",
      new Uint8Array(original.buffer, original.byteOffset, original.byteLength),
    );
  }
  if (original instanceof Uint8Array) return encodeBinary("uint8", original);
  if (typeof original === "object" && !Array.isArray(original)) {
    const prototype = Object.getPrototypeOf(original);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new LocalDatabaseProtocolError(
        `Local database payload contains unsupported ${original.constructor.name} data`,
        "LOCAL_DATABASE_UNSUPPORTED_VALUE",
      );
    }
  }
  if (
    typeof original === "bigint" ||
    typeof original === "function" ||
    typeof original === "symbol"
  ) {
    throw new LocalDatabaseProtocolError(
      `Local database payload contains unsupported ${typeof original} data`,
      "LOCAL_DATABASE_UNSUPPORTED_VALUE",
    );
  }
  return value;
}

function decodeBinary(type: SupportedBinaryType, data: string): unknown {
  const encoded = Buffer.from(data, "base64");
  const bytes = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  );
  if (type === "uint8") return new Uint8Array(bytes);
  const bytesPerElement = type === "float32" ? 4 : 8;
  if (encoded.byteLength % bytesPerElement !== 0) {
    throw new LocalDatabaseProtocolError(
      `Invalid ${type} local database binary payload`,
    );
  }
  return type === "float32" ? new Float32Array(bytes) : new Float64Array(bytes);
}

function wireJsonReviver(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (!(binaryMarkerKey in record)) return value;
  const type = record[binaryMarkerKey];
  const data = record["data"];
  if (
    (type !== "uint8" && type !== "float32" && type !== "float64") ||
    typeof data !== "string" ||
    Object.keys(record).length !== 2
  ) {
    throw new LocalDatabaseProtocolError(
      "Invalid local database binary representation",
    );
  }
  return decodeBinary(type, data);
}

class LocalDatabaseProtocolError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "LOCAL_DATABASE_PROTOCOL_ERROR") {
    super(message);
    this.name = "LocalDatabaseProtocolError";
    this.code = code;
  }
}

export class LocalDatabaseFrameDecoder {
  private readonly chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private expectedBodyBytes: number | undefined;
  private readonly maxFrameBytes: number;

  public constructor(maxFrameBytes: number) {
    this.maxFrameBytes = maxFrameBytes;
  }

  public push(chunk: Buffer): WireMessage[] {
    if (chunk.length > 0) {
      this.chunks.push(chunk);
      this.bufferedBytes += chunk.length;
    }
    const messages: WireMessage[] = [];

    while (this.bufferedBytes >= (this.expectedBodyBytes ?? 4)) {
      if (this.expectedBodyBytes === undefined) {
        const frameLength = this.consume(4).readUInt32BE(0);
        if (frameLength <= 0 || frameLength > this.maxFrameBytes) {
          throw new LocalDatabaseProtocolError(
            `Local database frame size ${frameLength} is outside the allowed range`,
            "LOCAL_DATABASE_FRAME_SIZE",
          );
        }
        this.expectedBodyBytes = frameLength;
      }
      if (this.bufferedBytes < this.expectedBodyBytes) break;

      const body = this.consume(this.expectedBodyBytes);
      this.expectedBodyBytes = undefined;
      let decoded: unknown;
      try {
        decoded = JSON.parse(body.toString("utf8"), wireJsonReviver);
      } catch (error) {
        throw new LocalDatabaseProtocolError(
          `Invalid local database frame JSON: ${getErrorMessage(error)}`,
        );
      }
      messages.push(wireMessageSchema.parse(decoded));
    }

    return messages;
  }

  private consume(length: number): Buffer {
    const first = this.chunks[0];
    if (first?.length === length) {
      this.chunks.shift();
      this.bufferedBytes -= length;
      return first;
    }
    if (first && first.length > length) {
      const value = first.subarray(0, length);
      this.chunks[0] = first.subarray(length);
      this.bufferedBytes -= length;
      return value;
    }

    const value = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const next = this.chunks[0];
      if (!next) throw new Error("Local database frame buffer underflow");
      const copied = Math.min(next.length, length - offset);
      next.copy(value, offset, 0, copied);
      offset += copied;
      if (copied === next.length) this.chunks.shift();
      else this.chunks[0] = next.subarray(copied);
    }
    this.bufferedBytes -= length;
    return value;
  }
}

function encodeFrame(message: WireMessage, maxFrameBytes: number): Buffer {
  let json: string;
  try {
    json = JSON.stringify(message, wireJsonReplacer);
  } catch (error) {
    if (error instanceof LocalDatabaseProtocolError) throw error;
    throw new LocalDatabaseProtocolError(
      `Local database payload is not JSON-serializable: ${getErrorMessage(error)}`,
      "LOCAL_DATABASE_UNSUPPORTED_VALUE",
    );
  }
  const body = Buffer.from(json, "utf8");
  if (body.length === 0 || body.length > maxFrameBytes) {
    throw new LocalDatabaseProtocolError(
      `Local database frame size ${body.length} is outside the allowed range`,
      "LOCAL_DATABASE_FRAME_SIZE",
    );
  }
  const frame = Buffer.allocUnsafe(body.length + 4);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

function writeFrame(socket: Socket, frame: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}

function isNamedPipe(address: string): boolean {
  return platform() === "win32" || address.startsWith("\\\\.\\pipe\\");
}

async function removeSocketFile(address: string): Promise<void> {
  if (!isNamedPipe(address)) await rm(address, { force: true });
}

async function waitForRequestDrain(
  completions: readonly Promise<void>[],
): Promise<void> {
  if (completions.length === 0) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS);
    void Promise.allSettled(completions).then(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function serializeError(error: unknown): {
  name: string;
  message: string;
  code?: string | undefined;
} {
  if (!(error instanceof Error)) {
    return { name: "Error", message: String(error) };
  }
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    name: error.name || "Error",
    message: error.message,
    ...(code !== undefined && { code }),
  };
}

interface ServerInFlightRequest {
  readonly controller: AbortController;
  readonly completion: Promise<void>;
}

interface ServerConnection {
  readonly socket: Socket;
  readonly decoder: LocalDatabaseFrameDecoder;
  readonly inFlight: Map<string, ServerInFlightRequest>;
  authenticated: boolean;
  sessionId: string | undefined;
  handshakeTimer: ReturnType<typeof setTimeout> | undefined;
}

export class LocalDatabaseRpcServer {
  public readonly role = "owner" as const;
  private readonly config: LocalDatabaseEndpointConfig;
  private readonly maxFrameBytes: number;
  private readonly maxInFlight: number;
  private readonly handlers = new Map<string, LocalDatabaseRequestHandler>();
  private readonly connections = new Set<ServerConnection>();
  private server: Server | undefined;
  private initializePromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;
  private listening = false;
  private closing = false;

  public constructor(options: LocalDatabaseRpcServerOptions) {
    this.config = options.config;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
  }

  public register(service: string, handler: LocalDatabaseRequestHandler): void {
    if (this.listening || this.initializePromise) {
      throw new Error("Cannot register local database handlers after listen");
    }
    if (this.handlers.has(service)) {
      throw new Error(`Local database handler already registered: ${service}`);
    }
    this.handlers.set(z.string().min(1).parse(service), handler);
  }

  public initialize(): Promise<void> {
    this.initializePromise ??= this.listen();
    return this.initializePromise;
  }

  private async listen(): Promise<void> {
    await removeSocketFile(this.config.address);
    const server = createServer((socket) => this.accept(socket));
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.config.address);
    });

    if (!isNamedPipe(this.config.address)) {
      await chmod(this.config.address, 0o600);
    }
    this.listening = true;
  }

  private accept(socket: Socket): void {
    if (this.closing) {
      socket.destroy();
      return;
    }
    const connection: ServerConnection = {
      socket,
      decoder: new LocalDatabaseFrameDecoder(this.maxFrameBytes),
      inFlight: new Map(),
      authenticated: false,
      sessionId: undefined,
      handshakeTimer: undefined,
    };
    connection.handshakeTimer = setTimeout(() => {
      socket.destroy(
        new LocalDatabaseProtocolError(
          "Local database handshake timed out",
          "LOCAL_DATABASE_HANDSHAKE_TIMEOUT",
        ),
      );
    }, HANDSHAKE_TIMEOUT_MS);
    this.connections.add(connection);

    socket.on("data", (chunk: Buffer) => {
      try {
        for (const message of connection.decoder.push(chunk)) {
          void this.handleMessage(connection, message);
        }
      } catch (error) {
        socket.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
    socket.on("error", () => undefined);
    socket.on("close", () => this.releaseConnection(connection));
  }

  private async handleMessage(
    connection: ServerConnection,
    message: WireMessage,
  ): Promise<void> {
    if (!connection.authenticated) {
      if (message.kind !== "handshake") {
        connection.socket.destroy(
          new LocalDatabaseProtocolError(
            "Handshake is required before requests",
          ),
        );
        return;
      }
      if (
        message.version !== LOCAL_DATABASE_PROTOCOL_VERSION ||
        !constantTimeEqual(message.secret, this.config.secret)
      ) {
        connection.socket.destroy(
          new LocalDatabaseProtocolError(
            "Local database handshake rejected",
            "LOCAL_DATABASE_HANDSHAKE_REJECTED",
          ),
        );
        return;
      }
      connection.authenticated = true;
      connection.sessionId = message.sessionId;
      if (connection.handshakeTimer) clearTimeout(connection.handshakeTimer);
      connection.handshakeTimer = undefined;
      await this.send(connection, {
        kind: "handshake-accepted",
        version: LOCAL_DATABASE_PROTOCOL_VERSION,
        sessionId: message.sessionId,
      });
      return;
    }

    if (message.kind === "cancel") {
      connection.inFlight
        .get(message.requestId)
        ?.controller.abort(new Error("Local database request cancelled"));
      return;
    }
    if (message.kind !== "request") {
      connection.socket.destroy(
        new LocalDatabaseProtocolError(
          `Unexpected local database message after handshake: ${message.kind}`,
        ),
      );
      return;
    }
    if (connection.inFlight.has(message.requestId)) {
      await this.sendFailure(
        connection,
        message.requestId,
        new LocalDatabaseProtocolError(
          `Duplicate local database request ID: ${message.requestId}`,
        ),
      );
      return;
    }
    if (connection.inFlight.size >= this.maxInFlight) {
      await this.sendFailure(
        connection,
        message.requestId,
        new LocalDatabaseProtocolError(
          "Local database request limit exceeded",
          "LOCAL_DATABASE_OVERLOADED",
        ),
      );
      return;
    }

    const controller = new AbortController();
    let completeRequest = (): void => undefined;
    const completion = new Promise<void>((resolve) => {
      completeRequest = resolve;
    });
    connection.inFlight.set(message.requestId, { controller, completion });
    const handler = this.handlers.get(message.service);
    try {
      if (!handler) {
        throw new LocalDatabaseProtocolError(
          `Unknown local database service: ${message.service}`,
          "LOCAL_DATABASE_UNKNOWN_SERVICE",
        );
      }
      const value = await handler(message.payload, {
        signal: controller.signal,
        scope: message.scope,
        sessionId: connection.sessionId ?? "",
      });
      await this.send(connection, {
        kind: "response",
        requestId: message.requestId,
        ok: true,
        ...(value !== undefined && { value }),
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        await this.sendFailure(connection, message.requestId, error);
      }
    } finally {
      connection.inFlight.delete(message.requestId);
      completeRequest();
    }
  }

  private sendFailure(
    connection: ServerConnection,
    requestId: string,
    error: unknown,
  ): Promise<void> {
    return this.send(connection, {
      kind: "response",
      requestId,
      ok: false,
      error: serializeError(error),
    });
  }

  private async send(
    connection: ServerConnection,
    message: WireMessage,
  ): Promise<void> {
    if (connection.socket.destroyed) return;
    let frame: Buffer;
    try {
      frame = encodeFrame(message, this.maxFrameBytes);
    } catch (error) {
      // A handler result is untrusted boundary data. Reject only that request
      // when it cannot be represented or exceeds the frame budget; severing
      // the endpoint would strand the worker until supervisor restart.
      if (message.kind !== "response" || !message.ok) {
        connection.socket.destroy();
        return;
      }
      try {
        frame = encodeFrame(
          {
            kind: "response",
            requestId: message.requestId,
            ok: false,
            error: serializeError(error),
          },
          this.maxFrameBytes,
        );
      } catch {
        frame = encodeFrame(
          {
            kind: "response",
            requestId: message.requestId,
            ok: false,
            error: {
              name: "LocalDatabaseProtocolError",
              message: "Local database response could not be encoded",
              code: "LOCAL_DATABASE_RESPONSE_ENCODING",
            },
          },
          this.maxFrameBytes,
        );
      }
    }
    try {
      await writeFrame(connection.socket, frame);
    } catch {
      connection.socket.destroy();
    }
  }

  private releaseConnection(connection: ServerConnection): void {
    if (connection.handshakeTimer) clearTimeout(connection.handshakeTimer);
    for (const request of connection.inFlight.values()) {
      request.controller.abort(new Error("Local database client disconnected"));
    }
    connection.inFlight.clear();
    this.connections.delete(connection);
  }

  public close(): Promise<void> {
    this.closePromise ??= this.closeServer();
    return this.closePromise;
  }

  private async closeServer(): Promise<void> {
    this.closing = true;
    const server = this.server;
    const connections = [...this.connections];
    const admittedRequests = connections.flatMap((connection) =>
      [...connection.inFlight.values()].map((request) => request.completion),
    );
    const shutdownFrame = encodeFrame(
      {
        kind: "shutdown",
        reason: "Local database owner closed",
      },
      this.maxFrameBytes,
    );
    for (const connection of connections) {
      if (!connection.socket.destroyed) {
        connection.socket.end(shutdownFrame);
      }
    }
    for (const connection of connections) {
      for (const request of connection.inFlight.values()) {
        request.controller.abort(new Error("Local database owner is closing"));
      }
    }
    await waitForRequestDrain(admittedRequests);
    for (const connection of connections) {
      connection.socket.destroy();
      this.releaseConnection(connection);
    }
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.listening = false;
    await removeSocketFile(this.config.address);
  }
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly frameBytes: number;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
  readonly removeAbortListener: () => void;
}

export class LocalDatabaseRpcClient {
  public readonly role = "client" as const;
  private readonly config: LocalDatabaseEndpointConfig;
  private readonly getOperationScope:
    (() => LocalDatabaseOperationScope | undefined) | undefined;
  private readonly maxFrameBytes: number;
  private readonly maxInFlight: number;
  private readonly maxPendingBytes: number;
  private readonly requestTimeoutMs: number | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private socket: Socket | undefined;
  private decoder: LocalDatabaseFrameDecoder;
  private initializePromise: Promise<void> | undefined;
  private closeRequested = false;
  private ready = false;
  private nextRequestId = 0;
  private pendingBytes = 0;
  private handshakeResolve: (() => void) | undefined;
  private handshakeReject: ((error: Error) => void) | undefined;

  public constructor(options: LocalDatabaseRpcClientOptions) {
    this.config = options.config;
    this.getOperationScope = options.getOperationScope;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
    this.maxPendingBytes = options.maxPendingBytes ?? DEFAULT_MAX_PENDING_BYTES;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.decoder = new LocalDatabaseFrameDecoder(this.maxFrameBytes);
  }

  public initialize(): Promise<void> {
    if (this.closeRequested) {
      return Promise.reject(new Error("Local database client is closed"));
    }
    this.initializePromise ??= this.connect();
    return this.initializePromise;
  }

  private async connect(): Promise<void> {
    const socket = createConnection(this.config.address);
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.receive(chunk));
    socket.on("error", (error) => this.failConnection(error));
    socket.on("end", () => {
      if (!this.closeRequested) {
        this.failConnection(new Error("Local database endpoint closed"));
        socket.destroy();
      }
    });
    socket.on("close", () => {
      if (!this.closeRequested) {
        this.failConnection(new Error("Local database endpoint closed"));
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new LocalDatabaseProtocolError(
            "Local database connection timed out",
            "LOCAL_DATABASE_CONNECTION_TIMEOUT",
          ),
        );
        socket.destroy();
      }, HANDSHAKE_TIMEOUT_MS);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const accepted = new Promise<void>((resolve, reject) => {
      this.handshakeResolve = resolve;
      this.handshakeReject = reject;
    });
    await writeFrame(
      socket,
      encodeFrame(
        {
          kind: "handshake",
          version: LOCAL_DATABASE_PROTOCOL_VERSION,
          secret: this.config.secret,
          sessionId: this.config.sessionId,
        },
        this.maxFrameBytes,
      ),
    );
    const timer = setTimeout(() => {
      this.handshakeReject?.(
        new LocalDatabaseProtocolError(
          "Local database handshake timed out",
          "LOCAL_DATABASE_HANDSHAKE_TIMEOUT",
        ),
      );
      socket.destroy();
    }, HANDSHAKE_TIMEOUT_MS);
    try {
      await accepted;
      this.ready = true;
    } finally {
      clearTimeout(timer);
      this.handshakeResolve = undefined;
      this.handshakeReject = undefined;
    }
  }

  private receive(chunk: Buffer): void {
    try {
      for (const message of this.decoder.push(chunk)) {
        this.handleMessage(message);
      }
    } catch (error) {
      this.socket?.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private handleMessage(message: WireMessage): void {
    if (message.kind === "shutdown") {
      const error = new Error(message.reason);
      error.name = "LocalDatabaseOwnerClosedError";
      this.failConnection(error);
      this.socket?.destroy();
      return;
    }
    if (message.kind === "handshake-accepted") {
      if (
        message.version !== LOCAL_DATABASE_PROTOCOL_VERSION ||
        message.sessionId !== this.config.sessionId
      ) {
        this.handshakeReject?.(
          new LocalDatabaseProtocolError(
            "Local database handshake response did not match this client",
          ),
        );
        this.socket?.destroy();
        return;
      }
      this.handshakeResolve?.();
      return;
    }
    if (message.kind !== "response") {
      this.socket?.destroy(
        new LocalDatabaseProtocolError(
          `Unexpected local database server message: ${message.kind}`,
        ),
      );
      return;
    }

    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.releasePending(message.requestId, pending);
    if (message.ok) {
      pending.resolve(message.value);
      return;
    }
    const error = new Error(message.error.message);
    error.name = message.error.name;
    if (message.error.code) {
      Object.defineProperty(error, "code", { value: message.error.code });
    }
    pending.reject(error);
  }

  public async request(
    service: string,
    payload: unknown,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<unknown> {
    await this.initialize();
    const socket = this.socket;
    if (!this.ready || !socket || socket.destroyed) {
      throw new Error("Local database endpoint is unavailable");
    }
    if (this.pending.size >= this.maxInFlight) {
      throw new LocalDatabaseProtocolError(
        "Local database request limit exceeded",
        "LOCAL_DATABASE_OVERLOADED",
      );
    }

    const requestId = `${this.config.sessionId}:${++this.nextRequestId}`;
    const scope = this.getOperationScope?.();
    const frame = encodeFrame(
      {
        kind: "request",
        requestId,
        service: z.string().min(1).parse(service),
        payload,
        ...(scope && { scope }),
      },
      this.maxFrameBytes,
    );
    if (this.pendingBytes + frame.length > this.maxPendingBytes) {
      throw new LocalDatabaseProtocolError(
        "Local database pending byte limit exceeded",
        "LOCAL_DATABASE_OVERLOADED",
      );
    }
    const signal = options?.signal;
    if (signal?.aborted) throw signal.reason;

    return new Promise<unknown>((resolve, reject) => {
      const rejectRequest = (error: Error): void => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.releasePending(requestId, pending);
        void this.sendCancel(requestId);
        reject(error);
      };
      const onAbort = (): void => {
        const reason = signal?.reason;
        rejectRequest(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer =
        this.requestTimeoutMs === undefined
          ? undefined
          : setTimeout(
              () =>
                rejectRequest(
                  new LocalDatabaseProtocolError(
                    `Local database request timed out after ${this.requestTimeoutMs}ms`,
                    "LOCAL_DATABASE_REQUEST_TIMEOUT",
                  ),
                ),
              this.requestTimeoutMs,
            );
      const pending: PendingRequest = {
        resolve,
        reject,
        frameBytes: frame.length,
        timer,
        removeAbortListener: () =>
          signal?.removeEventListener("abort", onAbort),
      };
      this.pending.set(requestId, pending);
      this.pendingBytes += frame.length;
      void writeFrame(socket, frame).catch((error) => rejectRequest(error));
    });
  }

  private async sendCancel(requestId: string): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return;
    try {
      await writeFrame(
        socket,
        encodeFrame({ kind: "cancel", requestId }, this.maxFrameBytes),
      );
    } catch {
      socket.destroy();
    }
  }

  private releasePending(requestId: string, pending: PendingRequest): void {
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    pending.removeAbortListener();
    this.pending.delete(requestId);
    this.pendingBytes -= pending.frameBytes;
  }

  private failConnection(error: Error): void {
    this.ready = false;
    this.handshakeReject?.(error);
    for (const [requestId, pending] of this.pending) {
      this.releasePending(requestId, pending);
      pending.reject(error);
    }
  }

  public close(): void {
    if (this.closeRequested) return;
    this.closeRequested = true;
    this.ready = false;
    this.socket?.destroy();
    this.failConnection(new Error("Local database client closed"));
  }
}
