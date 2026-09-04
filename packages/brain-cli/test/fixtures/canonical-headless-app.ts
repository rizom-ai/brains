import { readFileSync } from "node:fs";
import { join } from "node:path";
import { App, parseInstanceOverrides, resolve } from "@brains/app";
import { ConsoleLogger } from "@brains/utils/logger";
import { canonicalBrain } from "../../src/model/canonical-brain";
import { isRecord } from "@brains/utils/is-record";

const cwd = process.cwd();
const overrides = parseInstanceOverrides(
  readFileSync(join(cwd, "brain.yaml"), "utf8"),
);
const config = resolve(canonicalBrain, process.env, overrides);
const plugins = config.plugins ?? [];
const mcp = plugins.find(({ id }) => id === "mcp");
const mcpConfig =
  mcp && "config" in mcp && isRecord(mcp.config) ? mcp.config : undefined;

if (plugins.some(({ id }) => id === "webserver")) {
  throw new Error("Canonical headless app unexpectedly selected webserver");
}
if (plugins.some(({ id }) => id === "notifications")) {
  throw new Error("Canonical headless app unexpectedly selected notifications");
}
if (mcpConfig?.["transport"] !== "stdio") {
  throw new Error("Canonical headless app did not resolve MCP stdio transport");
}

// MCP owns stdout. Keep every application diagnostic on stderr so the SDK
// transport sees a clean JSON-RPC stream.
ConsoleLogger.getInstance().setUseStderr(true);

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
app
  .getShell()
  .getRecurringChecks("canonical-headless")
  .register({
    id: "failure",
    cadence: "daily",
    run: async () => ({
      alerts: [
        {
          dedupeKey: "headless-failure",
          title: "Headless recurring check failed",
          body: "The canonical core retained this alert without a notification channel.",
        },
      ],
    }),
  });
await app.start();
process.stdin.resume();
