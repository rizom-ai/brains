import { describe, expect, it } from "bun:test";
import { inboundEmailContract } from "@brains/contracts";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createEmailWorkflowsPlugins } from "./email-workflows-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

async function installed(
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const plugins = createEmailWorkflowsPlugins();
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  return { shell, plugins, capabilities };
}

/**
 * What the email-workflows package registers, pinned as its mail-item
 * entity plugin class and its email-workflows service class registered
 * it: the mailbox hands it inbound email over its contract, operators
 * read the triage list through its tool and its Inbox source, and mail
 * items are stored only restricted.
 */
describe("the email-workflows package's registered surface", () => {
  it("is the mail-item entity and the email-workflows service", async () => {
    const { plugins } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      ["mail-item", "entity", "@brains/email-workflows", []],
      ["email-workflows", "service", "@brains/email-workflows", []],
    ]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers the mail-item type, kept restricted and out of projections", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getEntityTypeConfig("mail-item")).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
      retiredFields: ["source.senderKey", "source.domain"],
    });
    expect(registry.getPersistValidator("mail-item")).toBeFunction();
  });

  it("registers email_triage_list in every process, and no resources or instructions", async () => {
    for (const executionOnly of [false, true]) {
      const { capabilities } = await installed({ executionOnly });
      expect(
        capabilities.flatMap(({ tools }) =>
          tools.map((tool) => ({
            name: tool.name,
            visibility: tool.visibility,
            sideEffects: tool.sideEffects,
            cli: tool.cli,
            input: Object.keys(tool.inputSchema),
          })),
        ),
      ).toEqual([
        {
          name: "email_triage_list",
          visibility: "admin",
          sideEffects: "none",
          cli: undefined,
          input: ["category", "priority", "status", "needsReply", "limit"],
        },
      ]);
      expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
      expect(capabilities.map(({ instructions }) => instructions)).toEqual([
        undefined,
        undefined,
      ]);
    }
  });

  it("offers the Email Triage Inbox source, and answers inbound email in the main process only", async () => {
    const main = await installed();
    main.shell.getInboxRegistry().finalize();
    expect(
      main.shell
        .getInboxRegistry()
        .listSources()
        .map(({ sourceId, displayName }) => [sourceId, displayName]),
    ).toEqual([["mail-items", "Email Triage"]]);
    expect(
      main.shell.getMessageBus().getHandlerCount(inboundEmailContract.name),
    ).toBe(1);

    const worker = await installed({ executionOnly: true });
    expect(
      worker.shell.getMessageBus().getHandlerCount(inboundEmailContract.name),
    ).toBe(0);
  });
});
