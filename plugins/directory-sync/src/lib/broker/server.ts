import { chmod, unlink } from "fs/promises";
import { join } from "path";
import { getErrorMessage } from "@brains/utils/error";
import { GitExecutor } from "./executor";
import type { GitExecutorOptions } from "./executor";
import type { TerminalRequestRecord } from "./journal";
import {
  BROKER_PROTOCOL_VERSION,
  FrameDecoder,
  MAX_FRAME_BYTES,
  encodeFrame,
} from "./protocol";
import type { BrokerMessage, ExecuteMessage, ResultMessage } from "./protocol";
import { redactSecrets } from "./redaction";
import { SocketWriter } from "./socket-writer";
import type { WritableSocket } from "./socket-writer";

/**
 * Unix-socket transport for a `GitExecutor`.
 *
 * This file owns framing, connection handling, and backpressure — nothing
 * else. Every execution guarantee lives in the executor and the wrapper, so a
 * caller reaching the executor directly and one reaching it over this socket
 * get identical behaviour. The socket exists so web and worker can share one
 * executor, not because it changes what execution means.
 */

export type BrokerServerOptions = GitExecutorOptions;

export class BrokerStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerStartupError";
  }
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

/**
 * Last-resort payload reduction for a message that will not fit one frame.
 * Only a result carries an unbounded payload, so only a result can shrink.
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

export class GitBrokerServer {
  readonly socketPath: string;
  readonly executor: GitExecutor;
  #server: { stop(closeActiveConnections?: boolean): void } | null = null;

  private constructor(socketPath: string, executor: GitExecutor) {
    this.socketPath = socketPath;
    this.executor = executor;
  }

  get journalDir(): string {
    return this.executor.journalDir;
  }

  get brokerId(): string {
    return this.executor.brokerId;
  }

  static async start(options: BrokerServerOptions): Promise<GitBrokerServer> {
    const executor = await GitExecutor.create(options);
    const socketPath = join(executor.runtimeDir, "git-broker.sock");

    // A stale socket file is only stale if nothing answers on it. Unlinking
    // without probing would let a second broker evict a live owner, which is
    // exactly the one-owner invariant this design exists to hold.
    if (await socketIsLive(socketPath)) {
      throw new BrokerStartupError(
        `A live Git broker already owns ${socketPath}`,
      );
    }
    await unlink(socketPath).catch(() => undefined);

    const broker = new GitBrokerServer(socketPath, executor);
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
              this.#refuse(writer, "req_protocol0000", error);
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

  activeRequestIds(): string[] {
    return this.executor.status().activeRequestIds;
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

  #refuse(writer: SocketWriter, requestId: string, error: unknown): void {
    const now = new Date().toISOString();
    this.#send(writer, {
      type: "result",
      version: BROKER_PROTOCOL_VERSION,
      requestId,
      outcome: "exit",
      exitCode: 64,
      signal: null,
      stdout: "",
      stderr: redactSecrets(getErrorMessage(error)),
      truncated: false,
      startedAt: now,
      completedAt: now,
    });
  }

  async #handle(writer: SocketWriter, message: BrokerMessage): Promise<void> {
    if (message.type === "register-checkout") {
      try {
        this.executor.register(message);
      } catch (error) {
        this.#refuse(writer, "req_protocol0000", error);
        return;
      }
      this.#send(writer, this.executor.status());
      return;
    }

    if (message.type === "status") {
      this.#send(writer, this.executor.status());
      return;
    }

    if (message.type === "execute") {
      await this.#execute(writer, message);
    }
  }

  async #execute(writer: SocketWriter, message: ExecuteMessage): Promise<void> {
    try {
      const record = await this.executor.execute(message, (active) => {
        this.#send(writer, {
          type: "progress",
          version: BROKER_PROTOCOL_VERSION,
          requestId: message.requestId,
          phase: active.phase,
          observedAt: active.observedAt,
          stdoutBytes: active.stdoutBytes,
          stderrBytes: active.stderrBytes,
        });
      });
      this.#send(writer, toResultMessage(record));
    } catch (error) {
      this.#refuse(writer, message.requestId, error);
    }
  }
}

function toResultMessage(record: TerminalRequestRecord): ResultMessage {
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
