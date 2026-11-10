import { createMockShell } from "@brains/plugins/test";
import { describe, expect, it, mock } from "bun:test";
import a2aInterface from "@brains/a2a";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  AtprotoPlugin,
  canonicalAtprotoLexicons,
  validateAtprotoRecord,
  type AtprotoPdsClientLike,
} from "@brains/atproto";
import { resolve } from "@brains/app";
import { createServicePluginContext } from "@brains/plugins";

import { z } from "@brains/utils/zod";
import { canonicalBrain } from "../src/model/canonical-brain";

const publicTools = [
  {
    name: "system_search",
    description: "Search public knowledge",
    pluginId: "system",
  },
];

function resolvedPluginIds(bundles: string[]): string[] {
  return (
    resolve(
      canonicalBrain,
      {},
      {
        bundleContract: "capability-bundles-v1",
        bundles,
      },
    ).plugins?.map(({ id }) => id) ?? []
  );
}

function createCardShell(options: {
  web: boolean;
}): ReturnType<typeof createMockShell> {
  const shell = createMockShell({
    domain: "brain.example.com",
    profileKind: "professional",
  });
  shell.getProfileKindRegistry().register("test", {
    kind: "professional",
    category: "person",
    fields: z.object({}),
    labels: { singular: "Professional", plural: "Professionals" },
  });
  shell.getProfileKindRegistry().finalize();
  shell.listToolsForPermissionLevel = (): typeof publicTools => publicTools;
  if (options.web) {
    const getPluginPackageName = shell.getPluginPackageName.bind(shell);
    shell.getPluginPackageName = (pluginId): string | undefined =>
      pluginId === "webserver"
        ? "@brains/webserver"
        : getPluginPackageName(pluginId);
  }
  return shell;
}

interface SkillSnapshot {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

function skillSnapshot(
  skills: readonly {
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
  }[],
): SkillSnapshot[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: skill.tags ?? [],
    examples: skill.examples ?? [],
  }));
}

/** The skills of an Agent Card as A2A serves it. */
const servedCardSchema = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()).optional(),
      examples: z.array(z.string()).optional(),
    }),
  ),
});

/**
 * The Agent Card A2A serves for a brain set up as `seed` sets up the
 * publishing brain's shell, read where a peer reads it: on the shared host.
 */
async function buildA2ACard(
  web: boolean,
  seed: (shell: ReturnType<typeof createMockShell>) => void = (): void => {},
): Promise<z.output<typeof servedCardSchema>> {
  const shell = createCardShell({ web });
  seed(shell);
  shell.addPlugin(webserverPlugin);
  const a2a = createA2APlugin();
  await a2a.register(shell);
  await a2a.ready?.();
  const route = a2a
    .getWebRoutes?.()
    .find(({ path }) => path === "/.well-known/agent-card.json");
  const response = await route?.handler(
    new Request("https://brain.example.com/.well-known/agent-card.json"),
  );
  if (!response) throw new Error("Expected A2A Agent Card route");
  return servedCardSchema.parse(await response.json());
}

describe("canonical card publication channels", () => {
  it("publishes a valid federation-only card with the same tool skills as A2A", async () => {
    const selected = resolvedPluginIds(["core", "federation"]);
    expect(selected).toContain("a2a");
    expect(selected).toContain("atproto");
    expect(selected).not.toContain("webserver");
    expect(selected).not.toContain("site-builder");

    const shell = createCardShell({ web: false });
    const a2aCard = await buildA2ACard(false);
    const putRecord = mock(async () => ({
      uri: "at://did:plc:brain/ai.rizom.brain.card/self",
      cid: "card-cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        identifier: "brain.example.com",
        appPassword: "secret",
        repoDid: "did:plc:brain",
        accountDid: "did:plc:anchor",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: async () => ({
            did: "did:plc:brain",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          }),
          createRecord: async () => ({
            uri: "at://did:plc:brain/ai.rizom.brain.card/self",
            cid: "card-cid",
          }),
          putRecord,
        }),
      },
    );

    const published = await plugin.publishBrainCard(
      createServicePluginContext(shell, "atproto"),
    );

    expect(published.record.siteUrl).toBeUndefined();
    expect(published.record.brain.did).toBe("did:plc:brain");
    expect(published.record.anchor.did).toBe("did:plc:anchor");
    expect(skillSnapshot(published.record.skills)).toEqual(
      skillSnapshot(a2aCard.skills),
    );
    expect(() =>
      validateAtprotoRecord(
        canonicalAtprotoLexicons["ai.rizom.brain.card"],
        published.record,
      ),
    ).not.toThrow();
    expect(putRecord).toHaveBeenCalledTimes(1);
  });

  it("publishes a site URL and the same entity skills when web and site are active", async () => {
    const selected = resolvedPluginIds(["core", "federation", "web", "site"]);
    expect(selected).toContain("a2a");
    expect(selected).toContain("atproto");
    expect(selected).toContain("webserver");
    expect(selected).toContain("site-builder");

    const seedSkill = (target: ReturnType<typeof createMockShell>): void => {
      target.addEntities([
        {
          id: "public-skill",
          entityType: "skill",
          content: "",
          metadata: {
            name: "Knowledge & Search",
            description: "Find useful knowledge",
            tags: ["knowledge"],
            examples: ["Find the plan"],
          },
          visibility: "public",
          contentHash: "public-skill-hash",
          created: "2026-08-18T00:00:00.000Z",
          updated: "2026-08-18T00:00:00.000Z",
        },
      ]);
    };
    const shell = createCardShell({ web: true });
    seedSkill(shell);
    const a2aCard = await buildA2ACard(true, seedSkill);
    const plugin = new AtprotoPlugin({
      repoDid: "did:plc:brain",
      accountDid: "did:plc:anchor",
    });

    const published = await plugin.publishBrainCard(
      createServicePluginContext(shell, "atproto"),
      { dryRun: true },
    );

    expect(published.record.siteUrl).toBe("https://brain.example.com/");
    expect(published.record.brain.did).toBe("did:web:brain.example.com");
    expect(published.record.anchor.did).toBe(
      "did:web:brain.example.com:anchor",
    );
    expect(skillSnapshot(published.record.skills)).toEqual(
      skillSnapshot(a2aCard.skills),
    );
    expect(skillSnapshot(published.record.skills)).toEqual([
      {
        id: "knowledge-search",
        name: "Knowledge & Search",
        description: "Find useful knowledge",
        tags: ["knowledge"],
        examples: ["Find the plan"],
      },
    ]);
  });
});

/** The shared host A2A mounts its card on, present as a registered plugin. */
const webserverPlugin: Plugin = {
  id: "webserver",
  version: "1.0.0",
  type: "interface",
  packageName: "@brains/webserver",
  register: async () => ({ tools: [], resources: [] }),
};

/** The A2A interface as the canonical brain creates it. */
function createA2APlugin(): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    a2aInterface,
    {},
    { name: "@brains/a2a", version: "0.0.0-test" },
    { pluginId: "a2a" },
  );
  if (!plugin) throw new Error("The A2A definition created no plugin");
  return plugin;
}
