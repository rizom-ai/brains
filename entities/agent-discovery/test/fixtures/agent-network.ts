import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Plugin,
  PluginCapabilities,
  Tool,
  ToolContext,
} from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import type { createPluginHarness } from "@brains/plugins/test";
import { stubMethod } from "@brains/test-utils";
import agentDiscovery, { type AgentDiscoveryConfigInput } from "../../src";
import type { AtprotoBrainCardDiscoveredPayload } from "@brains/atproto-contracts";
import type { FetchFn } from "../../src/lib/fetch-agent-card";
import type { AgentEntity, AgentStatus } from "../../src/schemas/agent";
import { createTestAgent } from "./agent";

export type AgentHarness = ReturnType<typeof createPluginHarness<Plugin>>;

/**
 * The agent entity plugin, as the runtime names it.
 *
 * Notes are filed under the package, so a context built with any of the
 * package's plugin ids reaches the same ones — but the id still has to be
 * one the runtime would produce.
 */
export const AGENT_PLUGIN_ID = "@brains/agent-discovery:agent";

const PACKAGE_METADATA = {
  name: "@brains/agent-discovery",
  version: "0.1.0",
};

/**
 * Install the package and keep hold of what it registered.
 *
 * A package installs several plugins, and `getCapabilities` reports only the
 * last, so anything spread across them has to be collected here.
 */
const registeredByHarness = new WeakMap<
  object,
  { tools: Tool[]; capabilities: PluginCapabilities[] }
>();

export async function installAgentDiscovery(
  harness: AgentHarness,
  config: AgentDiscoveryConfigInput = {},
): Promise<void> {
  const plugins = instantiatePluginPackageDefinition(
    agentDiscovery,
    config,
    PACKAGE_METADATA,
  );
  const tools: Tool[] = [];
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins as Plugin[]) {
    const installed = await harness.installPlugin(plugin);
    capabilities.push(installed);
    tools.push(...installed.tools);
  }
  registeredByHarness.set(harness, { tools, capabilities });
}

export function toolsOf(harness: AgentHarness): Tool[] {
  return registeredByHarness.get(harness)?.tools ?? [];
}

export function capabilitiesOf(harness: AgentHarness): PluginCapabilities[] {
  return registeredByHarness.get(harness)?.capabilities ?? [];
}

export function requireTool(harness: AgentHarness, name: string): Tool {
  const tool = toolsOf(harness).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(
      `${name} is not registered; found ${toolsOf(harness)
        .map(({ name: found }) => found)
        .join(", ")}`,
    );
  }
  return tool;
}

/**
 * Run one of the package's tools as an admin.
 *
 * The actor matches the harness default — a service, not a person — so a
 * test that does not care who is calling behaves as it did before. Pass one
 * when the caller's identity is the thing under test.
 */
export async function runTool(
  harness: AgentHarness,
  name: string,
  input: Record<string, unknown> = {},
  actor: ToolContext["actor"] = {
    kind: "service",
    serviceId: "plugin-test-harness",
  },
): Promise<Awaited<ReturnType<Tool["handler"]>>> {
  return requireTool(harness, name).handler(input, {
    interfaceType: "test",
    actor,
    userPermissionLevel: "admin",
  });
}

/**
 * The checks the package registered, captured as they register.
 *
 * A check is bound to its context at registration, so this is the only way
 * to reach one without going through the scheduler.
 */
type CapturedCheck = Parameters<
  ReturnType<
    ReturnType<AgentHarness["getMockShell"]>["getRecurringChecks"]
  >["register"]
>[0];

export function captureChecks(harness: AgentHarness): CapturedCheck[] {
  const shell = harness.getMockShell();
  const registered: CapturedCheck[] = [];
  shell.getRecurringChecks = (): ReturnType<
    typeof shell.getRecurringChecks
  > => ({
    register: (definition): (() => void) => {
      registered.push(definition);
      return () => {};
    },
  });
  return registered;
}

/**
 * What the package fetches with, for the duration of a test.
 *
 * A declared tool takes no constructor, so injection happens where the code
 * actually reads it: the global.
 */
export function useNetwork(fetchFn: FetchFn): void {
  const original = globalThis.fetch;
  // A whole fetch, not a cast of half of one: the global carries
  // `preconnect` too, and asserting a stub matches is how a stub drifts.
  const stub: typeof globalThis.fetch = Object.assign(
    (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) =>
      fetchFn(input, init),
    { preconnect: (): void => {} },
  );
  stubMethod(globalThis, "fetch", stub);
  afterEach(() => {
    globalThis.fetch = original;
  });
}

export function makeAgentEntity(status: AgentStatus): AgentEntity {
  return createTestAgent({
    id: "yeehaa.io",
    name: "Yeehaa",
    brainName: "Yeehaa",
    url: "https://yeehaa.io/a2a",
    status,
    about: "A saved agent.",
  });
}

export function createAgentCard(domain: string): Record<string, unknown> {
  return {
    name: "Remote Brain",
    description: "A verified peer brain.",
    url: `https://${domain}/a2a`,
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
  };
}

const tempDirs: string[] = [];

export async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-agent-discovery-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

export function createMockAgentCardFetch(
  cards: Record<string, Record<string, unknown>>,
): { fetch: FetchFn; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === "string" ? url : url.toString();
      calls.push(urlString);
      const hostname = new URL(urlString).hostname;
      const card = cards[hostname];
      if (!card) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(card), { status: 200 });
    },
  };
}

export function resolvePublicHostname(): Promise<string[]> {
  return Promise.resolve(["93.184.216.34"]);
}

export function createMockPdsFetch(input: {
  repoDid: string;
  cid: string;
  record: typeof testBrainCardPayload.record;
}): { fetch: FetchFn; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === "string" ? url : url.toString();
      calls.push(urlString);
      if (urlString === `https://plc.directory/${input.repoDid}`) {
        return Response.json({
          service: [
            {
              id: "#atproto_pds",
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: "https://pds.example.com",
            },
          ],
        });
      }
      if (urlString.startsWith("https://pds.example.com/xrpc/")) {
        return Response.json({
          uri: `at://${input.repoDid}/ai.rizom.brain.card/self`,
          cid: input.cid,
          value: input.record,
        });
      }
      return new Response("not found", { status: 404 });
    },
  };
}

export function createMockJwksFetch(jwksByDomain: Record<string, unknown>): {
  fetch: FetchFn;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === "string" ? url : url.toString();
      calls.push(urlString);
      const hostname = new URL(urlString).hostname;
      const jwks = jwksByDomain[hostname];
      if (!jwks) return new Response("not found", { status: 404 });
      return Response.json(jwks);
    },
  };
}

export const testBrainCardPayload: AtprotoBrainCardDiscoveredPayload = {
  repoDid: "did:plc:peer",
  uri: "at://did:plc:peer/ai.rizom.brain.card/self",
  cid: "bafy-peer-card",
  record: {
    $type: "ai.rizom.brain.card" as const,
    siteUrl: "https://peer.example.com",
    brain: {
      did: "did:web:peer.example.com",
      name: "Peer Brain",
      role: "assistant",
      purpose: "A peer brain discovered through ATProto.",
      values: ["collaboration"],
    },
    anchor: {
      did: "did:plc:anchor",
      name: "Peer Owner",
      category: "person",
      kind: "professional",
    },
    model: "ranger",
    version: "0.2.0-test",
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
    createdAt: "2026-06-02T12:00:00.000Z",
    updatedAt: "2026-06-02T12:30:00.000Z",
  },
};
