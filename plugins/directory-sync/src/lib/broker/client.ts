import { createId } from "@brains/utils/id";
import type { GitCommandOptions, GitCommandRunner } from "../owned-git";
import {
  BROKER_PROTOCOL_VERSION,
  FrameDecoder,
  classifyGitArgs,
  encodeFrame,
} from "./protocol";
import type {
  BrokerMessage,
  GitOperationClass,
  RegisterCheckoutMessage,
  StatusMessage,
} from "./protocol";
import { redactSecrets } from "./redaction";
import { GitStallError } from "../git-options";
import { SocketWriter } from "./socket-writer";

/**
 * Broker-backed implementation of the existing `GitCommandRunner`.
 *
 * Call sites keep talking to `OwnedGit`; nothing above this line learns that
 * Git runs in another process. Cancellation detaches this caller only — the
 * wrapper continues to a terminal result under its advisory lock, because
 * abandoning a half-finished mutation is how checkouts get corrupted.
 */

export class BrokerUnavailableError extends Error {
  constructor(socketPath: string, cause: string) {
    super(`Git broker at ${socketPath} is unavailable: ${cause}`);
    this.name = "BrokerUnavailableError";
  }
}

export interface BrokerClientOptions {
  socketPath: string;
  repositoryKey: string;
  /** Forces `bootstrap` for clone/init work, which is never inferred. */
  operationClass?: GitOperationClass | undefined;
}

interface Connection {
  write(data: Uint8Array): number;
  end(): void;
}

async function connect(
  socketPath: string,
  onMessage: (message: BrokerMessage) => void,
  onClose: (reason: string) => void,
): Promise<Connection> {
  const decoder = new FrameDecoder();
  // A holder rather than a mutable binding: `drain` can fire before the
  // writer exists, and the socket handlers are installed before `connect`
  // resolves.
  const pending: { writer: SocketWriter | null } = { writer: null };
  let closed = false;

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data(_socket, chunk): void {
        decoder.push(chunk).forEach(onMessage);
      },
      drain(): void {
        pending.writer?.flush();
      },
      close(): void {
        if (closed) return;
        closed = true;
        onClose("broker closed the connection");
      },
      error(_socket, error): void {
        if (closed) return;
        closed = true;
        onClose(redactSecrets(String(error)));
      },
    },
  }).catch((error: unknown) => {
    throw new BrokerUnavailableError(socketPath, redactSecrets(String(error)));
  });

  const writer = new SocketWriter(socket);
  pending.writer = writer;

  return {
    write: (data): number => {
      writer.send(data);
      return data.length;
    },
    end: (): void => {
      closed = true;
      socket.end();
    },
  };
}

/** Announce a checkout to the broker before any command runs against it. */
export async function registerCheckout(
  socketPath: string,
  declaration: Omit<RegisterCheckoutMessage, "type" | "version">,
): Promise<StatusMessage> {
  const settled = Promise.withResolvers<StatusMessage>();
  const connection = await connect(
    socketPath,
    (message) => {
      if (message.type === "status") settled.resolve(message);
      if (message.type === "result") {
        settled.reject(new Error(message.stderr || "registration refused"));
      }
    },
    (reason) => settled.reject(new BrokerUnavailableError(socketPath, reason)),
  );

  connection.write(
    encodeFrame({
      type: "register-checkout",
      version: BROKER_PROTOCOL_VERSION,
      ...declaration,
    }),
  );

  return settled.promise.finally(() => connection.end());
}

/** Ask the broker what it owns and what is in flight. */
export async function queryStatus(socketPath: string): Promise<StatusMessage> {
  const settled = Promise.withResolvers<StatusMessage>();
  const connection = await connect(
    socketPath,
    (message) => {
      if (message.type === "status") settled.resolve(message);
    },
    (reason) => settled.reject(new BrokerUnavailableError(socketPath, reason)),
  );

  connection.write(
    encodeFrame({
      type: "status",
      version: BROKER_PROTOCOL_VERSION,
      brokerId: "query",
      repositories: [],
      activeRequestIds: [],
      oldestActiveStartedAt: null,
    }),
  );

  return settled.promise.finally(() => connection.end());
}

export class BrokerGitCommandRunner implements GitCommandRunner {
  readonly #socketPath: string;
  readonly #repositoryKey: string;
  readonly #operationClass: GitOperationClass | undefined;

  constructor(options: BrokerClientOptions) {
    this.#socketPath = options.socketPath;
    this.#repositoryKey = options.repositoryKey;
    this.#operationClass = options.operationClass;
  }

  /** A runner pinned to `bootstrap`, for clone/init before registration. */
  bootstrap(): BrokerGitCommandRunner {
    return new BrokerGitCommandRunner({
      socketPath: this.#socketPath,
      repositoryKey: this.#repositoryKey,
      operationClass: "bootstrap",
    });
  }

  async run(
    args: readonly string[],
    options?: GitCommandOptions,
  ): Promise<string> {
    options?.signal?.throwIfAborted();

    const operationClass =
      this.#operationClass ?? classifyGitArgs(args) ?? "inspect";
    const requestId = `req_${createId(12)}`;
    const settled = Promise.withResolvers<string>();

    const connection = await connect(
      this.#socketPath,
      (message) => {
        if (message.type !== "progress" && message.type !== "result") return;
        if (message.requestId !== requestId) return;
        if (message.type === "progress") {
          options?.onProgress?.();
          return;
        }

        if (message.outcome === "timeout") {
          settled.reject(new GitStallError(0));
          return;
        }
        if (message.outcome !== "exit" || message.exitCode !== 0) {
          const detail = redactSecrets(
            message.stderr.trim() || message.stdout.trim(),
          );
          settled.reject(
            new Error(
              `git ${args.map(redactSecrets).join(" ")} ${
                message.outcome === "exit"
                  ? `exited with ${message.exitCode}`
                  : `ended in ${message.outcome}`
              }${detail ? `: ${detail}` : ""}`,
            ),
          );
          return;
        }
        settled.resolve(message.stdout);
      },
      (reason) =>
        settled.reject(new BrokerUnavailableError(this.#socketPath, reason)),
    );

    // Detach on cancellation. The request keeps running under the wrapper's
    // lock and stays recoverable by id; it is never unlocked from here.
    const detach = (): void => {
      settled.reject(options?.signal?.reason ?? new Error("cancelled"));
    };
    options?.signal?.addEventListener("abort", detach, { once: true });

    connection.write(
      encodeFrame({
        type: "execute",
        version: BROKER_PROTOCOL_VERSION,
        requestId,
        repositoryKey: this.#repositoryKey,
        operationClass,
        args: [...args],
      }),
    );

    return settled.promise.finally(() => {
      options?.signal?.removeEventListener("abort", detach);
      connection.end();
    });
  }
}
