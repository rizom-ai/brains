// Protocol-corruption fixture only. No native SDK imports or database opens.
import {
  isMainThread,
  parentPort,
  threadId,
  workerData,
} from "node:worker_threads";
import { parseRequest, type ProofReply } from "./protocol";
import { parseBoot } from "../../../src/turso-worker/boot-protocol";
if (isMainThread || !parentPort)
  throw new Error("Protocol fixture requires a worker");
const port = parentPort;
const boot = parseBoot(workerData);
const placement = { generation: boot.generation, pid: process.pid, threadId };
port.postMessage({ kind: "ready", ...placement } satisfies ProofReply);
port.on("message", (input: unknown) => {
  const request = parseRequest(input);
  port.postMessage({
    kind: "error",
    id: request.id,
    ...placement,
    error: {
      nodes: [{ name: "Error", message: "Malformed diagnostic", cause: 5 }],
      truncated: false,
    },
  } satisfies ProofReply);
});
