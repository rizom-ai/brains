import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createA2AInterface } from "@brains/a2a";
import {
  AgentDiscoveryPlugin,
  AgentToolsPlugin,
} from "@brains/agent-discovery";
import {
  createFakePeerFetch,
  isSafeSeedAgentUrl,
  readSeedPeers,
} from "@brains/ai-evaluation";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type Tool,
  type ToolResponse,
} from "@brains/plugins";
import type { FetchLike } from "@brains/utils/fetch-like";
import {
  confirmationArgs,
  createPluginHarness,
  expectConfirmation,
  expectSuccess,
} from "@brains/plugins/test";

const EVAL_CONTENT = join(import.meta.dir, "..", "eval-content");

/** Every `agent/` directory of the eval content, at any depth. */
function agentDirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.name === "agent" ? [path] : agentDirectories(path);
    });
}

function seedAgentUrls(): Array<{ file: string; url: string }> {
  return agentDirectories(EVAL_CONTENT).flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => {
        const path = join(dir, file);
        const url = /^url: "?([^"\n]+)"?$/m.exec(readFileSync(path, "utf8"));
        return { file: relative(EVAL_CONTENT, path), url: url?.[1] ?? "" };
      }),
  );
}

/** The A2A interface as the brain composes it, asking peers through `fetch`. */
function createA2APlugin(fetch: FetchLike): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    createA2AInterface({ fetch }),
    { port: 0 },
    { name: "@brains/a2a", version: "0.0.0-test" },
    { pluginId: "a2a" },
  );
  if (!plugin) throw new Error("The A2A definition created no plugin");
  return plugin;
}

const unreachable = (input: string | URL | Request): Promise<Response> =>
  Promise.reject(new Error(`an eval reached the network: ${String(input)}`));

describe("eval seed agents", () => {
  it("never point at a host a real brain could be on", () => {
    const seeds = seedAgentUrls();
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.filter(({ url }) => !url || !isSafeSeedAgentUrl(url))).toEqual(
      [],
    );
  });

  it("are all answered by the eval's fake peers", () => {
    for (const dir of agentDirectories(EVAL_CONTENT)) {
      expect(() => readSeedPeers(join(dir, ".."))).not.toThrow();
    }
  });
});

describe("the agent network against the eval's fake peers", () => {
  const harness = createPluginHarness<Plugin>({});

  afterEach(async () => {
    await harness.reset();
  });

  const tools = new Map<string, Tool>();

  /** Agent tools and A2A over the core seed peers; the tools by name. */
  async function installNetwork(): Promise<void> {
    const fetch = createFakePeerFetch(
      readSeedPeers(join(EVAL_CONTENT, "core")),
      unreachable,
    );
    await harness.installPlugin(new AgentDiscoveryPlugin());
    const installed = [
      await harness.installPlugin(new AgentToolsPlugin(fetch)),
      await harness.installPlugin(createA2APlugin(fetch)),
    ];
    await harness.finalizeRegistration();
    tools.clear();
    installed
      .flatMap((capabilities) => capabilities.tools)
      .forEach((tool) => tools.set(tool.name, tool));
  }

  function executeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolResponse> {
    const tool = tools.get(name);
    if (!tool) throw new Error(`No tool ${name}`);
    return tool.handler(input, {
      interfaceType: "test",
      actor: { kind: "service", serviceId: "eval-fake-peers-test" },
      userPermissionLevel: "admin",
    });
  }

  it("asks a seed peer and gets its answer", async () => {
    await installNetwork();
    const result = await executeTool("agent_call", {
      agent: "yeehaa.example",
      message: "What about ecosystem architecture?",
    });
    expectSuccess(result);
    expect(result.data).toMatchObject({
      state: "completed",
      response: expect.stringContaining(
        "the eval's stand-in for yeehaa.example",
      ),
    });
  });

  it("connects a seed peer from its card, then calls it as saved", async () => {
    await installNetwork();
    const confirmation = await executeTool("agent_connect", {
      source: { kind: "url", url: "brain-labs.example" },
    });
    expectConfirmation(confirmation);
    const connected = await executeTool(
      "agent_connect",
      confirmationArgs(confirmation),
    );
    expectSuccess(connected);
    expect(connected.data).toMatchObject({
      status: "approved",
      entityId: "brain-labs.example",
      a2aEndpoint: "https://brain-labs.example/a2a",
    });

    const asked = await executeTool("agent_call", {
      agent: "brain-labs.example",
      message: "What are you working on?",
    });
    expectSuccess(asked);
  });

  it("scans the approved peers' directories", async () => {
    await installNetwork();
    const scan = await executeTool("agent_scan_directories", {});
    expectSuccess(scan);
  });

  it("cannot verify a .example host no seed saves", async () => {
    await installNetwork();
    const result = await executeTool("agent_call", {
      agent: "unknown-agent.example",
      message: "Hello?",
    });
    expect(result).toMatchObject({
      success: false,
      code: "agent_card_unavailable",
    });
  });
});
