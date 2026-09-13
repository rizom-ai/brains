// Dedicated read transport worker. It has no SQL API and receives only a completed
// read capability; no database snapshot is held while waiting for TCP consumers.
import { createServer, type Socket } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  isMainThread,
  parentPort,
  threadId,
  type MessagePort,
} from "node:worker_threads";
import { STAGE_CHUNK_BYTES } from "./binary-protocol";
import { uploadBootstrapSchema, type UploadGrant } from "./upload-protocol";
import { readOutputSchema } from "./read-protocol";
import { deserializeError } from "../../../src/turso-worker/error-protocol";
import {
  CREDIT_HEADER_BYTES,
  SEAL_BYTES,
  decodeCredit,
  encodeData,
  readFixed,
  writeBytes,
  endSocket,
} from "./network-wire";

if (isMainThread || !parentPort)
  throw new Error("Network reads require a dedicated worker");
const parent = parentPort;
const fatal = (error: unknown): void => {
  queueMicrotask(() => {
    throw error;
  });
};
let booted = false;
parent.on("message", (input: unknown) => {
  if (booted) throw new Error("Network read bootstrap is one use");
  booted = true;
  const { port, grant } = uploadBootstrapSchema.parse(input);
  void serve(port, grant).catch(fatal);
});
async function serve(port: MessagePort, grant: UploadGrant): Promise<void> {
  if (grant.direction !== "read")
    throw new Error("Wrong network read direction");
  let incoming =
    Promise.withResolvers<ReturnType<typeof readOutputSchema.parse>>();
  let queued = false;
  let sealed = false;
  port.on("message", (input: unknown) => {
    const message = readOutputSchema.parse(input);
    if (queued) throw new Error("Unsolicited persistence read chunk");
    if (message.kind === "sealed") sealed = true;
    queued = true;
    incoming.resolve(message);
  });
  port.on("messageerror", fatal);
  port.on("close", () => {
    if (!sealed) fatal(new Error("Network read persistence channel closed"));
  });
  const connected = Promise.withResolvers<Socket>();
  const listenerClosed = Promise.withResolvers<void>();
  let accepted = false;
  const server = createServer(
    { highWaterMark: STAGE_CHUNK_BYTES },
    (socket) => {
      if (accepted) {
        socket.destroy();
        return;
      }
      accepted = true;
      socket.on("error", fatal);
      server.close();
      connected.resolve(socket);
    },
  );
  server.maxConnections = 1;
  server.on("close", () => listenerClosed.resolve());
  server.on("error", fatal);
  await new Promise<void>((resolve) =>
    server.listen({ host: "127.0.0.1", port: 0, backlog: 1 }, resolve),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing network read address");
  const token = randomBytes(32).toString("hex");
  parent.postMessage({
    kind: "network-listening",
    endpoint: {
      host: "127.0.0.1",
      port: address.port,
      token,
      direction: "read",
    },
    pid: process.pid,
    threadId,
  });
  const socket = await connected.promise;
  const authenticate = async (): Promise<void> => {
    const hello = await readFixed(socket, 64);
    if (!timingSafeEqual(hello, Buffer.from(token, "ascii")))
      throw new Error("Invalid network read authority");
  };
  await authenticate();
  port.postMessage({ kind: "hello", grant });
  for (;;) {
    const message = await incoming.promise;
    incoming =
      Promise.withResolvers<ReturnType<typeof readOutputSchema.parse>>();
    queued = false;
    if (message.kind === "error") throw deserializeError(message.error);
    if (message.kind === "sealed") {
      const acknowledgement = Buffer.alloc(SEAL_BYTES);
      acknowledgement[0] = 0x53;
      acknowledgement.writeUInt32BE(message.facts.sizeBytes, 1);
      acknowledgement.write(message.facts.sha256, 5, "ascii");
      await writeBytes(socket, acknowledgement);
      await endSocket(socket);
      await listenerClosed.promise;
      port.close();
      parent.close();
      return;
    }
    await writeBytes(
      socket,
      encodeData({
        kind: message.size === 0 ? "finish" : "chunk",
        sequence: message.sequence,
        credit: message.credit,
        size: message.size,
      }),
    );
    // write callbacks settle before returning this owned buffer to persistence;
    // no socket buffer (borrowed or pooled) is ever transferred.
    await writeBytes(socket, new Uint8Array(message.bytes, 0, message.size));
    const ack = decodeCredit(await readFixed(socket, CREDIT_HEADER_BYTES));
    if (ack.sequence !== message.sequence || ack.credit !== message.credit)
      throw new Error("Invalid network read acknowledgement");
    port.postMessage(
      {
        kind: "pull",
        sequence: ack.sequence,
        credit: ack.credit,
        bytes: message.bytes,
      },
      [message.bytes],
    );
    if (message.bytes.byteLength !== 0)
      throw new Error("Network read credit was not transferred");
  }
}
