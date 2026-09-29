import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  App,
  buildShellConfig,
  parseInstanceOverrides,
  resolve,
} from "@brains/app";
import { Shell } from "@brains/core";
import { ConsoleLogger } from "@brains/utils/logger";
import { isRecord } from "@brains/utils/is-record";
import { MockLanguageModelV3 } from "ai/test";
import { canonicalBrain } from "../../src/model/canonical-brain";
import {
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
} from "../helpers/mocked-ai-load-services";

const VERBATIM_NOTE_BODY = `# Verbatim MCP Note

Keep **bold text**, \`inline code\`, and punctuation: alpha / beta.

- First item
- Second item — with an em dash

Final checksum: MCP-VERBATIM-7F3A.`;

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

const scriptedModel = createScriptedModel(
  process.env["CANONICAL_HEADLESS_AI_SCENARIO"],
);
const app = scriptedModel
  ? await createScriptedApp(scriptedModel)
  : App.create(config);
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

async function createScriptedApp(model: MockLanguageModelV3): Promise<App> {
  const migrationApp = App.create(config);
  await migrationApp.migrate();
  return App.create(
    config,
    Shell.createFresh(buildShellConfig(config), {
      aiService: new MockLoadAIService(new MockLoadTracker(), {
        delayMs: 0,
        model,
      }),
      embeddingService: new MockLoadEmbeddingService(new MockLoadTracker(), {
        delayMs: 0,
        dimensions: 1536,
      }),
    }),
  );
}

function createScriptedModel(
  scenario: string | undefined,
): MockLanguageModelV3 | undefined {
  const responses =
    scenario === "read"
      ? [
          toolCall("read-seeded-note", "system_get", {
            entityType: "note",
            id: "headless-proof",
          }),
          textResponse(VERBATIM_NOTE_BODY),
        ]
      : scenario === "write-confirm-read"
        ? [
            toolCall("create-evidence-note", "system_create", {
              entityType: "note",
              title: "MCP Basic Evidence Note",
              source: {
                kind: "text",
                content:
                  "# MCP Basic Evidence Note\n\nProtocol write confirmation survived.",
              },
            }),
            toolCall("read-evidence-note", "system_get", {
              entityType: "note",
              id: "mcp-basic-evidence-note",
            }),
            textResponse("Protocol write confirmation survived."),
          ]
        : undefined;
  if (!responses) return undefined;

  return new MockLanguageModelV3({
    doGenerate: async (): Promise<ScriptedModelResponse> => {
      const response = responses.shift();
      if (!response) {
        throw new Error(`Unexpected model call for ${scenario ?? "unknown"}`);
      }
      return response;
    },
  });
}

function toolCall(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): ScriptedModelResponse {
  return {
    content: [
      {
        type: "tool-call",
        toolCallId,
        toolName,
        input: JSON.stringify(input),
      },
    ],
    finishReason: { unified: "tool-calls", raw: "tool-calls" },
    usage: scriptedUsage(),
    warnings: [],
  };
}

function textResponse(text: string): ScriptedModelResponse {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: scriptedUsage(),
    warnings: [],
  };
}

type ScriptedModelResponse = Awaited<
  ReturnType<MockLanguageModelV3["doGenerate"]>
>;

function scriptedUsage(): ScriptedModelResponse["usage"] {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}
