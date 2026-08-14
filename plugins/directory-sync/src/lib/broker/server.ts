import { chmod, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { createId } from "@brains/utils/id";
import { SerialQueue } from "@brains/utils/serial-queue";
import { getErrorMessage } from "@brains/utils/error";
import { BrokerJournal } from "./journal";
import type { TerminalRequestRecord } from "./journal";
import { BrokerRequestLedger } from "./ledger";
import {
  BROKER_PROTOCOL_VERSION,
  FrameDecoder,
  MAX_FRAME_BYTES,
  ProtocolError,
  assertExecutableArgs,
  encodeFrame,
} from "./protocol";
import type { BrokerMessage, ExecuteMessage, ResultMessage } from "./protocol";
import { CheckoutRegistry, RegistryError } from "./registry";
import type { CheckoutRegistryOptions, RegisteredCheckout } from "./registry";
import { redactSecrets } from "./redaction";
import { SocketWriter } from "./socket-writer";
import type { WritableSocket } from "./socket-writer";
import {
  materializeWrapper,
  readWrapperActive,
  readWrapperOutput,
  readWrapperTerminal,
  spawnWrapper,
} from "./wrapper";
import type { WrapperTerminalState } from "./wrapper";

/**
 * The Git execution broker.
 *
 * It never awaits a wrapper child and never blocks its event loop for the
 * duration of a command. Wrappers are started detached and observed through
 * their durable artifacts, so the broker stays free to emit `progress`, answer
 * `status`, and serve other checkouts while Git is still running — and so a
 * completion the runtime drops is not on the critical path at all.
 */

const DEFAULT_OBSERVE_MS = 25;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export interface BrokerServerOptions {
  /** Instance-owned runtime directory; never inside a checkout. */
  runtimeDir: string;
  brokerId?: string | undefined;
  observeIntervalMs?: number | undefined;
  /** Wrapper-side progress poll interval; the granularity of `progress`. */
  wrapperPollMs?: number | undefined;
  registry?: CheckoutRegistryOptions | undefined;
  /** Credentials for wrapper environments, by repository key. Never journalled. */
  credentials?:
    ((repositoryKey: string) => Readonly<Record<string, string>>) | undefined;
}

export class BrokerStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerStartupError";
  }
}

/**
 * Last-resort payload reduction for a message that will not fit one frame.
 * Only a result carries an unbounded payload, so only a result can shrink;
 * anything else is already small and is returned unchanged for the caller to
 * fail on loudly.
 */
function shrinkToFit(message: BrokerMessage): BrokerMessage {
  if (message.type !== "result") return message;

  const budget = Math.floor(MAX_FRAME_BYTES / 4);
  return {
    ...message,
    stdout: message.stdout.slice(0, budget),
    stderr: message.stderr.slice(0, budget),
    truncated: true,
  };
}

/** True when something is already listening on this socket path. */
async function socketIsLive(socketPath: string): Promise<boolean> {
  try {
    const probe = await Bun.connect({
      unix: socketPath,
      socket: { data: (): void => {} },
    });
    probe.end();
    return true;
  } catch {
    return false;
  }
}

export class GitBrokerServer {
  readonly socketPath: string;
  readonly journalDir: string;
  readonly brokerId: string;

  readonly #registry: CheckoutRegistry;
  readonly #ledger: BrokerRequestLedger;
  readonly #queues = new Map<string, SerialQueue>();
  readonly #active = new Map<string, string>();
  readonly #observeIntervalMs: number;
  readonly #wrapperPollMs: number | undefined;
  readonly #wrapperPath: string;
  readonly #credentials: (
    repositoryKey: string,
  ) => Readonly<Record<string, string>>;
  #server: { stop(closeActiveConnections?: boolean): void } | null = null;

  private constructor(init: {
    socketPath: string;
    journalDir: string;
    brokerId: string;
    registry: CheckoutRegistry;
    journal: BrokerJournal;
    observeIntervalMs: number;
    wrapperPollMs: number | undefined;
    wrapperPath: string;
    credentials: (repositoryKey: string) => Readonly<Record<string, string>>;
  }) {
    this.socketPath = init.socketPath;
    this.journalDir = init.journalDir;
    this.brokerId = init.brokerId;
    this.#registry = init.registry;
    this.#ledger = new BrokerRequestLedger(init.journal);
    this.#observeIntervalMs = init.observeIntervalMs;
    this.#wrapperPollMs = init.wrapperPollMs;
    this.#wrapperPath = init.wrapperPath;
    this.#credentials = init.credentials;
  }

  static async start(options: BrokerServerOptions): Promise<GitBrokerServer> {
    const runtimeDir = options.runtimeDir;
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    await chmod(runtimeDir, 0o700);

    const socketPath = join(runtimeDir, "git-broker.sock");
    const journalDir = join(runtimeDir, "journal");

    // A stale socket file is only stale if nothing answers on it. Unlinking
    // without probing would let a second broker evict a live owner, which is
    // exactly the one-owner invariant this whole design exists to hold.
    if (await socketIsLive(socketPath)) {
      throw new BrokerStartupError(
        `A live Git broker already owns ${socketPath}`,
      );
    }
    await unlink(socketPath).catch(() => undefined);

    const broker = new GitBrokerServer({
      socketPath,
      journalDir,
      brokerId: options.brokerId ?? createId(10),
      registry: new CheckoutRegistry(options.registry ?? {}),
      journal: await BrokerJournal.open(journalDir),
      observeIntervalMs: options.observeIntervalMs ?? DEFAULT_OBSERVE_MS,
      wrapperPollMs: options.wrapperPollMs,
      wrapperPath: await materializeWrapper(runtimeDir),
      credentials: options.credentials ?? ((): Record<string, string> => ({})),
    });

    await broker.#listen();
    return broker;
  }

  async #listen(): Promise<void> {
    const decoders = new WeakMap<object, FrameDecoder>();
    const writers = new WeakMap<object, SocketWriter>();

    const writerFor = (socket: WritableSocket & object): SocketWriter => {
      const existing = writers.get(socket);
      if (existing) return existing;
      const created = new SocketWriter(socket);
      writers.set(socket, created);
      return created;
    };

    this.#server = Bun.listen({
      unix: this.socketPath,
      socket: {
        open: (socket): void => {
          decoders.set(socket, new FrameDecoder());
          writerFor(socket);
        },
        drain: (socket): void => {
          writerFor(socket).flush();
        },
        data: (socket, chunk): void => {
          const decoder = decoders.get(socket) ?? new FrameDecoder();
          decoders.set(socket, decoder);
          const writer = writerFor(socket);
          const messages = ((): BrokerMessage[] => {
            try {
              return decoder.push(chunk);
            } catch (error) {
              this.#refuse(writer, error);
              return [];
            }
          })();
          messages.forEach((message) => {
            void this.#handle(writer, message);
          });
        },
      },
    });

    await chmod(this.socketPath, 0o600);
  }

  async stop(): Promise<void> {
    this.#server?.stop(true);
    this.#server = null;
    await unlink(this.socketPath).catch(() => undefined);
  }

  /** Requests currently owned by a wrapper, for `status` and health. */
  activeRequestIds(): string[] {
    return [...this.#active.values()].sort();
  }

  #send(writer: SocketWriter, message: BrokerMessage): void {
    const frame = ((): Uint8Array => {
      try {
        return encodeFrame(message);
      } catch {
        // A result too large to frame must still reach the client. Dropping it
        // would leave the caller waiting forever for a command that already
        // finished, and silence is the one failure mode this design cannot
        // afford — it is the wedge the broker exists to remove.
        return encodeFrame(shrinkToFit(message));
      }
    })();

    writer.send(frame);
  }

  #refuse(writer: SocketWriter, error: unknown): void {
    this.#send(writer, {
      type: "result",
      version: BROKER_PROTOCOL_VERSION,
      requestId: "req_protocol0000",
      outcome: "exit",
      exitCode: 64,
      signal: null,
      stdout: "",
      stderr: redactSecrets(getErrorMessage(error)),
      truncated: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  }

  async #handle(writer: SocketWriter, message: BrokerMessage): Promise<void> {
    if (message.type === "register-checkout") {
      try {
        this.#registry.register(message);
      } catch (error) {
        this.#refuse(writer, error);
        return;
      }
      this.#sendStatus(writer);
      return;
    }

    if (message.type === "status") {
      this.#sendStatus(writer);
      return;
    }

    if (message.type === "execute") {
      await this.#execute(writer, message);
    }
  }

  #sendStatus(writer: SocketWriter): void {
    this.#send(writer, {
      type: "status",
      version: BROKER_PROTOCOL_VERSION,
      brokerId: this.brokerId,
      repositories: this.#registry.list(),
      activeRequestIds: this.activeRequestIds(),
      oldestActiveStartedAt: null,
    });
  }

  #queueFor(repositoryKey: string): SerialQueue {
    const existing = this.#queues.get(repositoryKey);
    if (existing) return existing;
    const queue = new SerialQueue();
    this.#queues.set(repositoryKey, queue);
    return queue;
  }

  async #execute(writer: SocketWriter, message: ExecuteMessage): Promise<void> {
    const failed = (error: unknown): void => {
      this.#send(writer, {
        type: "result",
        version: BROKER_PROTOCOL_VERSION,
        requestId: message.requestId,
        outcome: "exit",
        exitCode: 64,
        signal: null,
        stdout: "",
        stderr: redactSecrets(getErrorMessage(error)),
        truncated: false,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    };

    const checkout = await (async (): Promise<RegisteredCheckout | null> => {
      try {
        assertExecutableArgs(message.args, message.operationClass);
        return await this.#registry.resolveForExecute(message);
      } catch (error) {
        if (error instanceof ProtocolError || error instanceof RegistryError) {
          failed(error);
          return null;
        }
        throw error;
      }
    })();
    if (!checkout) return;

    try {
      // Serialized per repository so only one wrapper is live at a time. The
      // wrapper's flock remains the authority — this queue exists so a burst
      // of requests does not become a pile of processes blocked on it.
      const record = await this.#queueFor(message.repositoryKey).run(() =>
        this.#ledger.settle(message, (request) =>
          this.#runThroughWrapper(writer, request, {
            checkoutPath: checkout.checkoutPath,
            timeoutMs: checkout.timeoutMs || DEFAULT_TIMEOUT_MS,
            maxOutputBytes: checkout.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
            repositoryKey: message.repositoryKey,
          }),
        ),
      );

      this.#send(writer, this.#toResultMessage(record));
    } catch (error) {
      failed(error);
    }
  }

  #toResultMessage(record: TerminalRequestRecord): ResultMessage {
    return {
      type: "result",
      version: BROKER_PROTOCOL_VERSION,
      requestId: record.requestId,
      outcome: record.outcome,
      exitCode: record.exitCode,
      signal: record.signal,
      stdout: record.stdout,
      stderr: record.stderr,
      truncated: record.truncated,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
  }

  async #runThroughWrapper(
    writer: SocketWriter,
    request: ExecuteMessage,
    context: {
      checkoutPath: string;
      timeoutMs: number;
      maxOutputBytes: number;
      repositoryKey: string;
    },
  ): Promise<TerminalRequestRecord> {
    const lockFile = join(
      this.journalDir,
      `${context.repositoryKey}.checkout.lock`,
    );

    spawnWrapper({
      requestId: request.requestId,
      journalDir: this.journalDir,
      checkout: context.checkoutPath,
      lockFile,
      wrapperPath: this.#wrapperPath,
      args: request.args,
      timeoutMs: context.timeoutMs,
      maxOutputBytes: context.maxOutputBytes,
      pollMs: this.#wrapperPollMs,
      env: this.#credentials(context.repositoryKey),
    });

    this.#active.set(request.requestId, request.requestId);
    try {
      const terminal = await this.#observe(writer, request);
      const output = await readWrapperOutput(
        this.journalDir,
        request.requestId,
      );
      const decoder = new TextDecoder();

      return {
        requestId: request.requestId,
        outcome: terminal.outcome === "overflow" ? "timeout" : terminal.outcome,
        exitCode: terminal.exitCode,
        signal: terminal.signal,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
        truncated: terminal.truncated,
        startedAt: terminal.startedAt,
        completedAt: terminal.completedAt,
      };
    } finally {
      this.#active.delete(request.requestId);
    }
  }

  /**
   * Watch the wrapper's durable artifacts. Recursive rather than a loop, and
   * emitting `progress` on every byte advance so the caller's heartbeat keeps
   * ticking through a long clone or pull.
   */
  async #observe(
    writer: SocketWriter,
    request: ExecuteMessage,
  ): Promise<WrapperTerminalState> {
    const step = async (
      lastStdout: number,
      lastStderr: number,
    ): Promise<WrapperTerminalState> => {
      const active = await readWrapperActive(
        this.journalDir,
        request.requestId,
      );

      if (
        active &&
        (active.stdoutBytes !== lastStdout || active.stderrBytes !== lastStderr)
      ) {
        this.#send(writer, {
          type: "progress",
          version: BROKER_PROTOCOL_VERSION,
          requestId: request.requestId,
          phase: active.phase,
          observedAt: active.observedAt,
          stdoutBytes: active.stdoutBytes,
          stderrBytes: active.stderrBytes,
        });
      }

      const terminal = await readWrapperTerminal(
        this.journalDir,
        request.requestId,
      );
      if (terminal) return terminal;

      await Bun.sleep(this.#observeIntervalMs);
      return step(
        active?.stdoutBytes ?? lastStdout,
        active?.stderrBytes ?? lastStderr,
      );
    };

    return step(-1, -1);
  }
}
