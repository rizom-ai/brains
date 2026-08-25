import { describe, expect, it } from "bun:test";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import type { Plugin, Tool } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import agentDiscovery, { type AgentDiscoveryConfigInput } from "../src";
import { parseAgentEntity } from "../src/lib/agent-content";
import type { FetchFn } from "../src/lib/fetch-agent-card";
import type { AgentEntity } from "../src/schemas/agent";
import { createTestAgent } from "./fixtures/agent";
import { useNetwork } from "./fixtures/agent-network";

interface MockHost {
  directory?: unknown;
  card?: unknown;
}

function createMockNetwork(hosts: Record<string, MockHost>): {
  fetch: FetchFn;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string | URL | Request): Promise<Response> => {
      const urlString = typeof url === "string" ? url : url.toString();
      calls.push(urlString);
      const { hostname, pathname } = new URL(urlString);
      const host = hosts[hostname];
      const payload =
        pathname === "/.well-known/agent-directory.json"
          ? host?.directory
          : pathname === "/.well-known/agent-card.json"
            ? host?.card
            : undefined;
      if (payload === undefined) {
        return new Response("not found", { status: 404 });
      }
      return Response.json(payload);
    },
  };
}

function createAgentCard(
  domain: string,
  name: string,
): Record<string, unknown> {
  return {
    name: `${name}'s Brain`,
    description: `${name} researches with peers.`,
    url: `https://${domain}/a2a`,
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
    capabilities: {
      extensions: [
        {
          uri: "https://rizom.ai/ext/anchor-profile/v1",
          params: { name, kind: "team", category: "team" },
        },
      ],
    },
  };
}

function directoryOf(...urls: string[]): unknown {
  return { agents: urls.map((url) => ({ name: url, url })) };
}

const PACKAGE_METADATA = {
  name: "@brains/agent-discovery",
  version: "0.1.0",
};

// A package installs several plugins and `getCapabilities` reports the last
// one, so the tools have to be collected as they are registered.
const toolsByHarness = new WeakMap<object, Tool[]>();

async function installPackage(
  harness: ReturnType<typeof createPluginHarness<Plugin>>,
  config: AgentDiscoveryConfigInput = {},
): Promise<void> {
  const plugins = instantiatePluginPackageDefinition(
    agentDiscovery,
    config,
    PACKAGE_METADATA,
  );
  const tools: Tool[] = [];
  for (const plugin of plugins as Plugin[]) {
    tools.push(...(await harness.installPlugin(plugin)).tools);
  }
  toolsByHarness.set(harness, tools);
}

function toolsOf(
  harness: ReturnType<typeof createPluginHarness<Plugin>>,
): Tool[] {
  return toolsByHarness.get(harness) ?? [];
}

/** Run one of the package's tools as an admin. */
async function runTool(
  harness: ReturnType<typeof createPluginHarness<Plugin>>,
  name: string,
  input: Record<string, unknown> = {},
): Promise<Awaited<ReturnType<Tool["handler"]>>> {
  const tool = toolsOf(harness).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} not registered`);
  return tool.handler(input, {
    interfaceType: "test",
    actor: { kind: "user", userId: "operator" },
    userPermissionLevel: "admin",
  });
}

async function setupHarness(network: {
  fetch: FetchFn;
}): Promise<ReturnType<typeof createPluginHarness<Plugin>>> {
  useNetwork(network.fetch);
  const harness = createPluginHarness<Plugin>({ domain: "self.brain" });
  await installPackage(harness);
  return harness;
}

type AgentDiscoveryTestHarness = ReturnType<typeof createPluginHarness<Plugin>>;
type AgentDiscoveryTestShell = ReturnType<
  AgentDiscoveryTestHarness["getMockShell"]
>;
type CapturedRecurringCheck = Parameters<
  ReturnType<AgentDiscoveryTestShell["getRecurringChecks"]>["register"]
>[0];

async function setupRecurringCheck(
  network: { fetch: FetchFn },
  config: AgentDiscoveryConfigInput = {},
): Promise<{
  harness: AgentDiscoveryTestHarness;
  check: CapturedRecurringCheck;
}> {
  useNetwork(network.fetch);
  const harness = createPluginHarness<Plugin>({ domain: "self.brain" });
  const shell = harness.getMockShell();
  // The package declares two: the agent type refreshes known cards, and the
  // service scans peer directories. Selected by id rather than by which
  // registered last.
  const registered: CapturedRecurringCheck[] = [];
  shell.getRecurringChecks = (): ReturnType<
    typeof shell.getRecurringChecks
  > => ({
    register: (definition): (() => void) => {
      registered.push(definition);
      return () => {};
    },
  });

  await installPackage(harness, config);
  // Scoped to the service that declared it.
  const check = registered.find(({ id }) => id.endsWith("directory-scan"));
  if (!check) throw new Error("Directory recurring check was not registered");
  return { harness, check };
}

describe("agents_scan-directories", () => {
  it("reports new agents while suppressing notification delivery by default", async () => {
    const network = createMockNetwork({
      "kai.brain": {
        directory: directoryOf("https://vale.example/a2a"),
      },
      "vale.example": { card: createAgentCard("vale.example", "Vale") },
    });
    const { harness, check } = await setupRecurringCheck(network);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });

    const result = await check.run({ signal: new AbortController().signal });

    expect(check.deliverAlerts).toBe(false);
    expect(check.includeInInbox).toBeUndefined();
    expect(result.alerts).toEqual([
      expect.objectContaining({
        includeInInbox: false,
        title: "1 new agent sighting",
        body: "Found vale.example, introduced through kai.brain. Review in Agent sightings.",
      }),
    ]);
    expect(
      await harness.getEntityService().getEntity({
        entityType: "agent",
        id: "vale.example",
      }),
    ).not.toBeNull();
    await harness.finalizeRegistration();
    const inboxSource = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("agent-sightings");
    expect(inboxSource).toMatchObject({
      sourceId: "agent-sightings",
      displayName: "Agent sightings",
    });
    expect(await inboxSource?.list()).toMatchObject([
      {
        id: "vale.example",
        actions: [
          { id: "connect", label: "Connect" },
          { id: "dismiss", label: "Dismiss" },
        ],
      },
    ]);
    harness.reset();
  });

  it("notifies on new agents when explicitly enabled", async () => {
    const network = createMockNetwork({
      "kai.brain": {
        directory: directoryOf("https://vale.example/a2a"),
      },
      "vale.example": { card: createAgentCard("vale.example", "Vale") },
    });
    const { harness, check } = await setupRecurringCheck(network, {
      notifyOnNewAgents: true,
    });
    await harness.getEntityService().createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });

    const result = await check.run({ signal: new AbortController().signal });

    expect(check.deliverAlerts).toBe(true);
    expect(check.includeInInbox).toBeUndefined();
    expect(result.alerts).toEqual([
      expect.objectContaining({
        includeInInbox: false,
        title: "1 new agent sighting",
        body: "Found vale.example, introduced through kai.brain. Review in Agent sightings.",
      }),
    ]);
    harness.reset();
  });

  it("registers as a trusted external tool", async () => {
    const network = createMockNetwork({});
    const harness = await setupHarness(network);

    const tool = toolsOf(harness).find(
      (candidate) => candidate.name === "agents_scan-directories",
    );
    expect(tool?.visibility).toBe("trusted");
    expect(tool?.sideEffects).toBe("external");
    expect(tool?.description).toContain("/.well-known/agent-directory.json");

    harness.reset();
  });

  it("aborts in-flight directory requests through the tool signal", async () => {
    const controller = new AbortController();
    const abortReason = new Error("scan canceled");
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fetchFn: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        markStarted?.();
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    const harness = await setupHarness({ fetch: fetchFn });
    await harness.getEntityService().createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });
    const tool = toolsOf(harness).find(
      (candidate) => candidate.name === "agents_scan-directories",
    );
    if (!tool) throw new Error("agents_scan-directories not registered");
    const run = tool.handler(
      {},
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "operator" },
        userPermissionLevel: "admin",
        signal: controller.signal,
      },
    );
    await started;

    controller.abort(abortReason);

    // The reason survives: a declared tool reports failure rather than
    // throwing, and the runtime carries the message through.
    expect(await run).toMatchObject({
      success: false,
      error: abortReason.message,
    });
    harness.reset();
  });

  it("sights agents reported by approved peers' directories with provenance", async () => {
    const network = createMockNetwork({
      "kai.brain": {
        directory: directoryOf(
          "https://vale.example/a2a",
          // Both must be skipped: ourselves, and an already-saved agent.
          "https://self.brain/a2a",
          "https://lumen.brain/a2a",
        ),
      },
      "lumen.brain": {
        directory: directoryOf(
          "https://vale.example/a2a",
          // Listed but serves no agent card — must not be saved.
          "https://ghost.example/a2a",
        ),
      },
      "vale.example": { card: createAgentCard("vale.example", "Vale") },
    });
    const harness = await setupHarness(network);
    const entityService = harness.getEntityService();

    await entityService.createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });
    await entityService.createEntity({
      entity: createTestAgent({ id: "lumen.brain", status: "approved" }),
    });
    // Approved but unreachable peer: tolerated, reported, not fatal.
    await entityService.createEntity({
      entity: createTestAgent({ id: "mute.brain", status: "approved" }),
    });
    // Not approved: its directory must never be fetched.
    await entityService.createEntity({
      entity: createTestAgent({ id: "noor.brain", status: "discovered" }),
    });

    const result = await runTool(harness, "agents_scan-directories");

    expectSuccess(result);
    expect(result.data).toMatchObject({
      peersScanned: 3,
      unreachablePeers: 1,
      created: 1,
      updated: 0,
      alreadyKnown: 1,
      unverified: 1,
    });

    const sighted = await entityService.getEntity<AgentEntity>({
      entityType: "agent",
      id: "vale.example",
    });
    expect(sighted?.metadata.status).toBe("discovered");
    expect(sighted?.metadata.name).toBe("Vale");
    expect(sighted?.visibility).toBe("public");
    const parsed = parseAgentEntity(sighted as AgentEntity);
    // Sighting provenance rides on the agent entity.
    expect(parsed.frontmatter.introducedBy).toEqual([
      "kai.brain",
      "lumen.brain",
    ]);
    expect(parsed.frontmatter.hops).toBe(2);
    // Everything else comes from the pointee's own verified card.
    expect(parsed.frontmatter.kind).toBe("team");
    expect(parsed.frontmatter.brainName).toBe("Vale's Brain");
    expect(parsed.frontmatter.url).toBe("https://vale.example/a2a");
    expect(parsed.body.skills).toEqual([
      {
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ]);
    expect(parsed.body.about).toContain("Vale researches with peers.");

    for (const id of ["self.brain", "ghost.example"]) {
      expect(
        await entityService.getEntity({ entityType: "agent", id }),
      ).toBeNull();
    }
    expect(network.calls.some((url) => url.includes("noor.brain"))).toBe(false);
    expect(network.calls.some((url) => url.includes("self.brain"))).toBe(false);

    harness.reset();
  });

  it("merges new introducers into an existing sighting without refetching its card", async () => {
    const network = createMockNetwork({
      "lumen.brain": {
        directory: directoryOf("https://vale.example/a2a"),
      },
    });
    const harness = await setupHarness(network);
    const entityService = harness.getEntityService();

    await entityService.createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });
    await entityService.createEntity({
      entity: createTestAgent({ id: "lumen.brain", status: "approved" }),
    });
    await entityService.createEntity({
      entity: createTestAgent({
        id: "vale.example",
        name: "Vale",
        url: "https://vale.example/a2a",
        status: "discovered",
        introducedBy: ["kai.brain"],
        hops: 2,
      }),
    });

    const result = await runTool(harness, "agents_scan-directories");

    expectSuccess(result);
    expect(result.data).toMatchObject({ created: 0, updated: 1 });

    const sighted = await entityService.getEntity<AgentEntity>({
      entityType: "agent",
      id: "vale.example",
    });
    const parsed = parseAgentEntity(sighted as AgentEntity);
    expect(parsed.frontmatter.introducedBy).toEqual([
      "kai.brain",
      "lumen.brain",
    ]);
    expect(parsed.frontmatter.status).toBe("discovered");
    // Provenance merge only — the sighting's card is not refetched.
    expect(network.calls.some((url) => url.includes("vale.example"))).toBe(
      false,
    );

    harness.reset();
  });

  it("does not attach provenance to agents known first-hand", async () => {
    const network = createMockNetwork({
      "kai.brain": {
        directory: directoryOf("https://noor.brain/a2a"),
      },
    });
    const harness = await setupHarness(network);
    const entityService = harness.getEntityService();

    await entityService.createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });
    // Discovered first-hand (e.g. via ATProto) — a peer report must not
    // demote it to a second-order sighting.
    await entityService.createEntity({
      entity: createTestAgent({ id: "noor.brain", status: "discovered" }),
    });

    const result = await runTool(harness, "agents_scan-directories");

    expectSuccess(result);
    expect(result.data).toMatchObject({
      created: 0,
      updated: 0,
      alreadyKnown: 1,
    });

    const noor = await entityService.getEntity<AgentEntity>({
      entityType: "agent",
      id: "noor.brain",
    });
    const parsed = parseAgentEntity(noor as AgentEntity);
    expect(parsed.frontmatter.introducedBy).toBeUndefined();

    harness.reset();
  });

  it("is a no-op when peers report nothing new", async () => {
    const network = createMockNetwork({
      "kai.brain": {
        directory: directoryOf("https://vale.example/a2a"),
      },
    });
    const harness = await setupHarness(network);
    const entityService = harness.getEntityService();

    await entityService.createEntity({
      entity: createTestAgent({ id: "kai.brain", status: "approved" }),
    });
    await entityService.createEntity({
      entity: createTestAgent({
        id: "vale.example",
        name: "Vale",
        url: "https://vale.example/a2a",
        status: "discovered",
        introducedBy: ["kai.brain"],
        hops: 2,
      }),
    });

    const before = await entityService.getEntity<AgentEntity>({
      entityType: "agent",
      id: "vale.example",
    });
    const result = await runTool(harness, "agents_scan-directories");

    expectSuccess(result);
    expect(result.data).toMatchObject({ created: 0, updated: 0 });

    const after = await entityService.getEntity<AgentEntity>({
      entityType: "agent",
      id: "vale.example",
    });
    expect(after?.updated).toBe(before?.updated ?? "");
    const parsed = parseAgentEntity(after as AgentEntity);
    expect(parsed.frontmatter.introducedBy).toEqual(["kai.brain"]);

    harness.reset();
  });
});
