import { parentPort } from "node:worker_threads";
if (!parentPort) throw new Error("Lifetime fixture requires a worker");
const port = parentPort;
port.on("message", (input: unknown) => {
  if (input !== "ping") throw new Error("Unknown lifetime fixture command");
  port.postMessage("pong");
});
port.postMessage("ready");
