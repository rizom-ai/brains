import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  App,
  parseInstanceOverrides,
  resolve,
  type BrainDefinition,
} from "@brains/app";
import { Logger } from "@brains/utils/logger";
import { canonicalBrain } from "../../src/model/canonical-brain";
import { targetCanonicalBundles } from "../../src/model/target-bundles";

const cwd = process.cwd();
const overrides = parseInstanceOverrides(
  readFileSync(join(cwd, "brain.yaml"), "utf8"),
);
const targetBrain: BrainDefinition = {
  ...canonicalBrain,
  bundles: targetCanonicalBundles,
};
const config = resolve(targetBrain, process.env, overrides);
const plugins = config.plugins ?? [];
const mcp = plugins.find(({ id }) => id === "mcp");
const mcpConfig =
  mcp && "config" in mcp && isRecord(mcp.config) ? mcp.config : undefined;

if (plugins.some(({ id }) => id === "webserver")) {
  throw new Error("Target headless app unexpectedly selected webserver");
}
if (mcpConfig?.["transport"] !== "stdio") {
  throw new Error("Target headless app did not resolve MCP stdio transport");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// MCP owns stdout. Keep every application diagnostic on stderr so the SDK
// transport sees a clean JSON-RPC stream.
Logger.getInstance().setUseStderr(true);

const app = App.create(config);
let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await app.stop();
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

await app.initialize();
await app.start();
process.stdin.resume();
