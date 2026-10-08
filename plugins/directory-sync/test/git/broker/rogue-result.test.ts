import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { parseBrokerRpcRequest } from "../../../src/lib/broker/rpc-contract";
import { makeBrokerRpcSerialization } from "../../../src/lib/broker/rpc-serialization";
import type { BrokerRpcParser } from "../../../src/lib/broker/rpc-serialization";

/**
 * The result contract holds at the boundary, not only in isolation.
 *
 * A broker that answers with the wrong shape used to hand the caller a value
 * it believed was a `GitSyncStatus`, because the assertion that typed it could
 * not fail. This drives a deliberately wrong answer down a real socket.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let server: { stop(closeActiveConnections?: boolean): void } | undefined;

/** Answers every request with `value`, whatever the operation asked for. */
async function rogueBroker(value: unknown, sendExit = true): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "rogue-broker-"));
  const socketPath = join(scratch, "git-broker.sock");
  const decoders = new WeakMap<object, BrokerRpcParser>();
  const serialization = makeBrokerRpcSerialization();

  server = Bun.listen({
    unix: socketPath,
    socket: {
      open: (socket): void => {
        decoders.set(socket, serialization.makeUnsafe());
      },
      data: (socket, chunk): void => {
        const decoder = decoders.get(socket) ?? serialization.makeUnsafe();
        decoders.set(socket, decoder);
        const send = (message: unknown): void => {
          const frame = decoder.encode(message);
          if (frame) socket.write(frame);
        };
        decoder
          .decode(chunk)
          .map(parseBrokerRpcRequest)
          .forEach((message) => {
            if (message._tag === "Ping") {
              send({ _tag: "Pong" });
              return;
            }
            if (message._tag !== "Request") return;
            if (message.tag === "RegisterCheckout") {
              send({
                _tag: "Exit",
                requestId: message.id,
                exit: {
                  _tag: "Success",
                  value: {
                    brokerId: "rogue",
                    checkouts: ["/brain/brain-data"],
                    activeRequestIds: [],
                    queuedRequestIds: [],
                    ambiguousRequestIds: [],
                    evidenceComplete: true,
                    recoveryPending: false,
                    admitsMutations: true,
                    oldestActiveProgressAt: null,
                  },
                },
              });
              return;
            }
            if (message.tag !== "ExecuteOperation") return;
            send({
              _tag: "Chunk",
              requestId: message.id,
              values: [{ _tag: "Result", outcome: "ok", value, error: null }],
            });
            if (sendExit)
              send({
                _tag: "Exit",
                requestId: message.id,
                exit: { _tag: "Success", value: null },
              });
          });
      },
    },
  });

  return socketPath;
}

afterEach(async () => {
  server?.stop(true);
  server = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("a broker answering out of contract", () => {
  it("settles from the terminal operation event without waiting for a second RPC acknowledgement", async () => {
    const path = await rogueBroker(null, false);
    const connection = await BrokerConnection.connect(path);
    try {
      await connection.registerCheckout({
        checkoutPath: "/brain/brain-data",
        branch: "main",
        remoteFingerprint: "0".repeat(64),
      });
      expect(
        await connection.execute("/brain/brain-data", { name: "commit" }),
      ).toBeUndefined();
    } finally {
      connection.close();
    }
  });

  it("is refused rather than returned as a typed value", async () => {
    const socketPath = await rogueBroker({ isRepo: "definitely" });
    const connection = await BrokerConnection.connect(socketPath);
    await connection.registerCheckout({
      checkoutPath: "/brain/brain-data",
      branch: "main",
      remoteFingerprint: "0".repeat(64),
    });

    const outcome = await connection
      .execute("/brain/brain-data", { name: "get-status" })
      .then(
        (status) => status,
        (error: unknown) => error,
      );

    expect(outcome).toBeInstanceOf(Error);
    connection.close();
  }, 30_000);

  it("cannot pass a boolean off as a commit-and-push outcome", async () => {
    const socketPath = await rogueBroker(true);
    const connection = await BrokerConnection.connect(socketPath);
    await connection.registerCheckout({
      checkoutPath: "/brain/brain-data",
      branch: "main",
      remoteFingerprint: "0".repeat(64),
    });

    const outcome = await connection
      .execute("/brain/brain-data", { name: "commit-and-push" })
      .then(
        (result) => result,
        (error: unknown) => error,
      );

    // Silently accepted, this reads as "pushed: undefined" — a caller would
    // skip advancing its checkpoint and never learn why.
    expect(outcome).toBeInstanceOf(Error);
    connection.close();
  }, 30_000);
});
