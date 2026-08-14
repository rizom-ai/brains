import { z } from "@brains/utils/zod";
import { containsUrlCredentials, redactSecrets } from "./redaction";

/**
 * Wire contract between the directory-sync broker client and the broker.
 *
 * Every message is schema-versioned and length-bounded, and the executable is
 * always `git` — clients choose a subcommand from a closed allow-list, never a
 * program. See docs/plans/directory-sync-git-execution-broker.md.
 */

export const BROKER_PROTOCOL_VERSION = 1;

/**
 * Frames must be able to carry a full bounded result body. Git output such as
 * `show` of a large blob or `status` in a big tree routinely runs to megabytes,
 * so the frame limit is set above the per-checkout output bound rather than
 * below it — a smaller frame limit silently strands results.
 */
export const MAX_FRAME_BYTES: number = 8 * 1024 * 1024;

/** Ceiling for a checkout's declared `maxOutputBytes`, enforced at registration. */
export const MAX_OUTPUT_BYTES: number = 4 * 1024 * 1024;
export const MAX_ARGUMENT_BYTES: number = 4096;
export const MAX_ARGUMENT_COUNT: number = 64;

const FRAME_HEADER_BYTES = 4;
const NUL = "\u0000";

export const GIT_OPERATION_CLASSES = [
  "bootstrap",
  "inspect",
  "mutate",
  "network",
] as const;

export type GitOperationClass = (typeof GIT_OPERATION_CLASSES)[number];

export interface RegisterCheckoutMessage {
  type: "register-checkout";
  version: number;
  repositoryKey: string;
  checkoutPath: string;
  branch: string;
  remoteFingerprint: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface ExecuteMessage {
  type: "execute";
  version: number;
  requestId: string;
  repositoryKey: string;
  operationClass: GitOperationClass;
  args: string[];
}

export interface ProgressMessage {
  type: "progress";
  version: number;
  requestId: string;
  phase: "starting" | "running" | "terminating";
  observedAt: string;
  stdoutBytes: number;
  stderrBytes: number;
}

export interface ResultMessage {
  type: "result";
  version: number;
  requestId: string;
  outcome: "exit" | "signal" | "timeout";
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  startedAt: string;
  completedAt: string;
}

export interface StatusMessage {
  type: "status";
  version: number;
  brokerId: string;
  repositories: string[];
  activeRequestIds: string[];
  oldestActiveStartedAt: string | null;
}

export type BrokerMessage =
  | RegisterCheckoutMessage
  | ExecuteMessage
  | ProgressMessage
  | ResultMessage
  | StatusMessage;

/**
 * Closed allow-list per class. `bootstrap` is deliberately the widest: probe,
 * clone, init, and branch repair legitimately need to stage and commit seed
 * content before a checkout can be registered. Its boundary is temporal rather
 * than narrow — the broker rejects it once `register-checkout` has succeeded,
 * so this surface exists only while the checkout is being created.
 */
const SUBCOMMANDS_BY_CLASS: Readonly<
  Record<GitOperationClass, ReadonlySet<string>>
> = {
  inspect: new Set(["status", "rev-parse", "log", "diff", "show", "cat-file"]),
  // `config` and `remote` sit here rather than in `inspect` because their
  // read and write forms differ only by argument. Classifying by capability
  // rather than by intent keeps the boundary checkable from argv alone.
  mutate: new Set(["add", "commit", "checkout", "rm", "config", "remote"]),
  network: new Set(["fetch", "pull", "push", "ls-remote"]),
  bootstrap: new Set([
    "ls-remote",
    "clone",
    "init",
    "config",
    "remote",
    "checkout",
    "add",
    "status",
    "log",
    "rev-parse",
    "commit",
  ]),
};

export type ProtocolErrorCode =
  | "frame-too-large"
  | "malformed"
  | "version-mismatch"
  | "unsupported-operation"
  | "invalid-argument"
  | "credential-in-argument";

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string) {
    // Redact here rather than at throw sites: a protocol error is frequently
    // logged, and its message often quotes the offending argument.
    super(redactSecrets(message));
    this.name = "ProtocolError";
    this.code = code;
  }
}

const requestIdField = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const repositoryKeyField = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);
const versionField = z.number().int().nonnegative();
const timestampField = z.string().min(1).max(64);

const registerCheckoutObject = z.object({
  type: z.literal("register-checkout"),
  version: versionField,
  repositoryKey: repositoryKeyField,
  checkoutPath: z.string().min(1),
  branch: z.string().min(1),
  remoteFingerprint: z.string().length(64),
  timeoutMs: z.number().int().positive(),
  maxOutputBytes: z.number().int().positive().max(MAX_OUTPUT_BYTES),
});

const executeObject = z.object({
  type: z.literal("execute"),
  version: versionField,
  requestId: requestIdField,
  repositoryKey: repositoryKeyField,
  operationClass: z.enum(GIT_OPERATION_CLASSES),
  args: z.array(z.string()).min(1),
});

const progressObject = z.object({
  type: z.literal("progress"),
  version: versionField,
  requestId: requestIdField,
  phase: z.enum(["starting", "running", "terminating"]),
  observedAt: timestampField,
  stdoutBytes: z.number().int().nonnegative(),
  stderrBytes: z.number().int().nonnegative(),
});

const resultObject = z.object({
  type: z.literal("result"),
  version: versionField,
  requestId: requestIdField,
  outcome: z.enum(["exit", "signal", "timeout"]),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  startedAt: timestampField,
  completedAt: timestampField,
});

const statusObject = z.object({
  type: z.literal("status"),
  version: versionField,
  brokerId: z.string().min(1),
  repositories: z.array(repositoryKeyField),
  activeRequestIds: z.array(requestIdField),
  oldestActiveStartedAt: timestampField.nullable(),
});

export const gitOperationClassSchema: z.ZodType<
  GitOperationClass,
  GitOperationClass
> = z.enum(GIT_OPERATION_CLASSES);

export const registerCheckoutSchema: z.ZodType<
  RegisterCheckoutMessage,
  RegisterCheckoutMessage
> = registerCheckoutObject;

export const executeSchema: z.ZodType<ExecuteMessage, ExecuteMessage> =
  executeObject;

export const progressSchema: z.ZodType<ProgressMessage, ProgressMessage> =
  progressObject;

export const resultSchema: z.ZodType<ResultMessage, ResultMessage> =
  resultObject;

export const statusSchema: z.ZodType<StatusMessage, StatusMessage> =
  statusObject;

export const brokerMessageSchema: z.ZodType<BrokerMessage, BrokerMessage> =
  z.discriminatedUnion("type", [
    registerCheckoutObject,
    executeObject,
    progressObject,
    resultObject,
    statusObject,
  ]);

export function encodeFrame(message: BrokerMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  if (body.length > MAX_FRAME_BYTES) {
    throw new ProtocolError(
      "frame-too-large",
      `Refusing to send a ${body.length}-byte frame; the limit is ${MAX_FRAME_BYTES}`,
    );
  }
  const frame = new Uint8Array(FRAME_HEADER_BYTES + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, false);
  frame.set(body, FRAME_HEADER_BYTES);
  return frame;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProtocolError("malformed", "Frame body is not valid JSON");
  }
}

function decodeBody(body: Uint8Array): BrokerMessage {
  const parsed = parseJson(new TextDecoder().decode(body));
  const result = brokerMessageSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProtocolError(
      "malformed",
      `Frame body does not match any broker message schema: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  if (result.data.version !== BROKER_PROTOCOL_VERSION) {
    throw new ProtocolError(
      "version-mismatch",
      `Broker protocol version ${result.data.version} is not ${BROKER_PROTOCOL_VERSION}`,
    );
  }
  return result.data;
}

/**
 * Reassembles length-prefixed frames from a byte stream. Kept separate from
 * the socket so framing is testable without one, and so a hostile length
 * prefix is rejected before anything is allocated for it.
 */
export class FrameDecoder {
  #buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): BrokerMessage[] {
    const combined = new Uint8Array(this.#buffer.length + chunk.length);
    combined.set(this.#buffer);
    combined.set(chunk, this.#buffer.length);
    this.#buffer = combined;
    return this.#drain([]);
  }

  #drain(decoded: BrokerMessage[]): BrokerMessage[] {
    if (this.#buffer.length < FRAME_HEADER_BYTES) return decoded;

    const length = new DataView(
      this.#buffer.buffer,
      this.#buffer.byteOffset,
      FRAME_HEADER_BYTES,
    ).getUint32(0, false);

    if (length > MAX_FRAME_BYTES) {
      throw new ProtocolError(
        "frame-too-large",
        `Frame declares ${length} bytes; the limit is ${MAX_FRAME_BYTES}`,
      );
    }
    if (this.#buffer.length < FRAME_HEADER_BYTES + length) return decoded;

    const body = this.#buffer.subarray(
      FRAME_HEADER_BYTES,
      FRAME_HEADER_BYTES + length,
    );
    const message = decodeBody(body);
    this.#buffer = this.#buffer.slice(FRAME_HEADER_BYTES + length);
    return this.#drain([...decoded, message]);
  }
}

/**
 * Pick the narrowest ordinary class that permits this subcommand. `bootstrap`
 * is never inferred: it widens what is allowed, so a caller must ask for it
 * explicitly and the registry decides whether the checkout is still in a state
 * where it applies.
 */
export function classifyGitArgs(
  args: readonly string[],
): GitOperationClass | null {
  const subcommand = args[0];
  if (subcommand === undefined) return null;

  const ordered: readonly GitOperationClass[] = [
    "inspect",
    "mutate",
    "network",
  ];
  return (
    ordered.find((operationClass) =>
      SUBCOMMANDS_BY_CLASS[operationClass].has(subcommand),
    ) ?? null
  );
}

/**
 * Validate the Git argument vector a client asked the broker to run. The
 * broker supplies the executable and `-c maintenance.auto=false` itself, so
 * `args` always begins with a subcommand.
 */
export function assertExecutableArgs(
  args: readonly string[],
  operationClass: GitOperationClass,
): void {
  const subcommand = args[0];
  if (subcommand === undefined) {
    throw new ProtocolError(
      "unsupported-operation",
      "A Git request must name a subcommand",
    );
  }
  if (args.length > MAX_ARGUMENT_COUNT) {
    throw new ProtocolError(
      "invalid-argument",
      `Git request carries ${args.length} arguments; the limit is ${MAX_ARGUMENT_COUNT}`,
    );
  }

  args.forEach((argument) => {
    // Spaces and newlines are legitimate in Git paths; only NUL is structural.
    if (argument.includes(NUL)) {
      throw new ProtocolError(
        "invalid-argument",
        "Git arguments must not contain NUL bytes",
      );
    }
    const size = new TextEncoder().encode(argument).length;
    if (size > MAX_ARGUMENT_BYTES) {
      throw new ProtocolError(
        "invalid-argument",
        `Git argument is ${size} bytes; the limit is ${MAX_ARGUMENT_BYTES}`,
      );
    }
    if (containsUrlCredentials(argument)) {
      throw new ProtocolError(
        "credential-in-argument",
        `Git argument carries URL credentials and must be passed through the wrapper environment instead: ${argument}`,
      );
    }
  });

  if (!SUBCOMMANDS_BY_CLASS[operationClass].has(subcommand)) {
    throw new ProtocolError(
      "unsupported-operation",
      `Git subcommand "${subcommand}" is not permitted for operation class "${operationClass}"`,
    );
  }
}
