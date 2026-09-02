import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/unified-inbox` needs that the declarative surface could not
 * say: the inbox registries other packages file into, and a console link to
 * the workspace it registers.
 */

describe("a service that reads the inbox registries", () => {
  it("hands setup the sources other packages filed", async () => {
    let sourceCount: number | undefined;
    const definition = defineServicePlugin({
      id: "inbox-desk",
      config: z.object({}),
      setup: ({ inbox }) => ({
        sources: (): number => inbox.listSources().length,
      }),
      ready: ({ state }) => {
        sourceCount = state.sources();
      },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/inbox-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect(sourceCount).toBe(0);
  });
});

describe("a check that tells someone where to go", () => {
  it("reads the site url and where its own workspace was mounted", async () => {
    let seen: { siteUrl: string | undefined; inbox: string | undefined } = {
      siteUrl: "unset",
      inbox: "unset",
    };
    const definition = defineServicePlugin({
      id: "digest-desk",
      config: z.object({}),
      setup: () => ({}),
      checks: () => [
        {
          id: "daily-digest",
          cadence: "daily",
          run: async ({
            siteUrl,
            workspaceUrl,
          }): Promise<Record<never, never>> => {
            seen = { siteUrl, inbox: workspaceUrl("inbox") };
            return { alerts: [] };
          },
        },
      ],
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/digest-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const registered: Array<{
      run: (context: { signal: AbortSignal }) => Promise<unknown>;
    }> = [];
    const harness = createPluginHarness();
    stubMethod(harness.getMockShell(), "getRecurringChecks", () => ({
      register: (check: (typeof registered)[number]) => {
        registered.push(check);
        return (): void => {};
      },
    }));

    await harness.installPlugin(plugin);
    await registered[0]?.run({ signal: new AbortController().signal });

    // No Studio in the harness, so there is no page to point at — and the
    // check is told that rather than handed a path that resolves to nothing.
    expect(seen.siteUrl).toBeUndefined();
    expect(seen.inbox).toBeUndefined();

    harness.reset();
  });
});

describe("a service that offers a way in", () => {
  it("declares its console link", async () => {
    const definition = defineServicePlugin({
      id: "inbox-desk",
      config: z.object({}),
      setup: () => ({}),
      interactions: () => [
        {
          id: "unified-inbox",
          label: "Inbox",
          description: "Review source-owned items that need attention.",
          href: "/studio/workspaces/inbox",
          kind: "admin",
          priority: 20,
          visibility: "admin",
        },
      ],
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/inbox-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    expect(
      harness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).toContain("unified-inbox");
  });
});
