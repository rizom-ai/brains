// Transport-controller fault fixture, NOT a native persistence implementation.
// Automatic port closure is observed but deliberately not acknowledged to parent.
import {
  isMainThread,
  parentPort,
  workerData,
  MessagePort,
} from "node:worker_threads";
import { z } from "@brains/utils/zod";
import { uploadBootstrapSchema, uploadGrantSchema } from "./upload-protocol";

if (isMainThread || !parentPort)
  throw new Error("Transfer receiver fixture requires a worker");
const parent = parentPort;
const role = z.enum(["receiver", "peer"]).parse(workerData);
if (role === "peer") {
  parent.once("message", (input: unknown) => {
    const { port } = uploadBootstrapSchema.parse(input);
    port.on("close", () => parent.close());
    port.start();
  });
} else {
  const commandSchema = z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("open"),
      grant: uploadGrantSchema,
      port: z.instanceof(MessagePort),
    }),
    z.strictObject({ kind: z.literal("cancel"), id: z.string().uuid() }),
  ]);
  const active = new Map<
    string,
    { port: MessagePort; closed: Promise<void> }
  >();
  parent.on("message", (input: unknown) => {
    const command = commandSchema.parse(input);
    if (command.kind === "open") {
      if (active.size >= 2 || active.has(command.grant.id))
        throw new Error("Invalid fixture admission");
      const closed = Promise.withResolvers<void>();
      command.port.once("close", () => closed.resolve());
      active.set(command.grant.id, {
        port: command.port,
        closed: closed.promise,
      });
      parent.postMessage({ kind: "opened", id: command.grant.id });
    } else {
      const record = active.get(command.id);
      if (!record) throw new Error("Unknown fixture cancellation");
      record.port.close();
      void record.closed.then(() => {
        active.delete(command.id);
        parent.postMessage({ kind: "settled", id: command.id });
      });
    }
  });
}
