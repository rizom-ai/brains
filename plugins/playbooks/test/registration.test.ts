import { describe, expect, it } from "bun:test";
import {
  agentActionContract,
  agentContextContract,
  lifecycleStarterRegistrationContract,
  playbookSeedContract,
} from "@brains/contracts";
import {
  conversationMessageAddedChannel,
  entityCreatedChannel,
  entityUpdatedChannel,
} from "@brains/plugins";
import { createPluginHarness, createTempDataDir } from "@brains/plugins/test";
import { createPlaybooksPlugins } from "./playbooks-plugins";

/**
 * What the playbooks package registers, pinned as the playbook entity
 * plugin class and the playbooks service class registered it: agents,
 * evals, onboarding and stored runs name these by string.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  installs: {
    id: string;
    type: string;
    packageName: string;
    tools: {
      name: string;
      visibility: string | undefined;
      sideEffects: string | undefined;
      input: string[];
    }[];
    instructions: string | undefined;
  }[];
}> {
  const harness = createPluginHarness({
    dataDir: await createTempDataDir("brains-playbooks-registration-"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  // A class registered its instructions on the shell, or returned them with
  // its capabilities, which the shell registers: either way they are the
  // plugin's.
  const registered = new Map<string, string>();
  harness.getMockShell().registerInstructions = (pluginId, text): void => {
    registered.set(pluginId, text);
  };
  const installs = [];
  for (const plugin of createPlaybooksPlugins({
    lifecycle: {
      onboarding: {
        trigger: "first-admin-web-chat",
        playbookId: "onboarding",
        starterText: "Set up",
        starterPrompt: "Start playbook onboarding.",
      },
    },
  })) {
    const capabilities = await harness.installPlugin(plugin);
    installs.push({
      id: plugin.id,
      type: plugin.type,
      packageName: plugin.packageName,
      tools: capabilities.tools.map((tool) => ({
        name: tool.name,
        visibility: tool.visibility,
        sideEffects: tool.sideEffects,
        input: Object.keys(tool.inputSchema).sort(),
      })),
      instructions: registered.get(plugin.id) ?? capabilities.instructions,
    });
  }
  return { harness, evals, installs };
}

describe("the playbooks package's registered surface", () => {
  it("registers the playbook type under the playbook plugin", async () => {
    const { harness, installs } = await installed();
    const [entity] = installs;
    expect(entity).toMatchObject({
      id: "playbook",
      type: "entity",
      packageName: "@brains/playbooks",
      tools: [],
    });
    expect(entity?.instructions).toContain(
      "call playbook_manage action=status directly",
    );
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("playbook")).toMatchObject({
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(registry.getAdapter("playbook").purpose).toBe(
      "A guided multi-step workflow the assistant runs together with the user.",
    );
  });

  it("registers playbook_manage, its instructions and its eval under playbooks", async () => {
    const { evals, installs } = await installed();
    const [, service] = installs;
    expect(service).toMatchObject({
      id: "playbooks",
      type: "service",
      packageName: "@brains/playbooks",
      tools: [
        {
          name: "playbook_manage",
          visibility: "admin",
          sideEffects: "writes",
          input: [
            "action",
            "context",
            "event",
            "fromState",
            "lifecycle",
            "playbookId",
            "runId",
          ],
        },
      ],
    });
    expect(service?.instructions).toContain("onboarding");
    expect(evals).toEqual(["playbooks:goalCheck"]);
  });

  it("answers its channels and hears the conversation and the entities", async () => {
    const { harness } = await installed();
    const bus = harness.getMockShell().getMessageBus();
    expect(
      Object.fromEntries(
        [
          playbookSeedContract.name,
          lifecycleStarterRegistrationContract.name,
          "playbooks:lifecycle-starters",
          agentContextContract.name,
          agentActionContract.name,
          conversationMessageAddedChannel.name,
          entityCreatedChannel.name,
          entityUpdatedChannel.name,
        ].map((channel) => [channel, bus.getHandlerCount(channel)]),
      ),
    ).toEqual({
      "playbooks:seed": 1,
      "playbooks:register-lifecycle-starter": 1,
      "playbooks:lifecycle-starters": 1,
      "agent:context:request": 1,
      "agent:action:request": 1,
      "conversation:messageAdded": 1,
      "entity:created": 1,
      "entity:updated": 1,
    });
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual([]);
  });
});
