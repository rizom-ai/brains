import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrokerConnection } from "../../../src/lib/broker/client";
import {
  BROKER_PROTOCOL_VERSION,
  FrameDecoder,
  encodeFrame,
} from "../../../src/lib/broker/protocol";

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
async function rogueBroker(value: unknown): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "rogue-broker-"));
  const socketPath = join(scratch, "git-broker.sock");
  const decoders = new WeakMap<object, FrameDecoder>();

  server = Bun.listen({
    unix: socketPath,
    socket: {
      open: (socket): void => {
        decoders.set(socket, new FrameDecoder());
      },
      data: (socket, chunk): void => {
        const decoder = decoders.get(socket) ?? new FrameDecoder();
        decoders.set(socket, decoder);
        decoder.push(chunk).forEach((message) => {
          if (message.type === "register-checkout") {
            socket.write(
              encodeFrame({
                type: "status",
                version: BROKER_PROTOCOL_VERSION,
                requestId: message.requestId,
                brokerId: "rogue",
                checkouts: [message.checkoutPath],
                activeRequestIds: [],
                oldestActiveProgressAt: null,
              }),
            );
            return;
          }
          if (message.type !== "execute-operation") return;
          socket.write(
            encodeFrame({
              type: "result",
              version: BROKER_PROTOCOL_VERSION,
              requestId: message.requestId,
              outcome: "ok",
              value,
              error: null,
            }),
          );
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
