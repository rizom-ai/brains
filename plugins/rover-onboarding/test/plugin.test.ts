import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { playbookPlugin } from "@brains/playbook";
import { playbooksPlugin } from "@brains/playbooks";
import { createPluginHarness } from "@brains/plugins/test";
import { roverOnboardingPlugin } from "../src";

async function tempStorageDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "brains-rover-onboarding-"));
}

async function installHarness(): Promise<
  ReturnType<typeof createPluginHarness>
> {
  const harness = createPluginHarness({ dataDir: await tempStorageDir() });
  await harness.installPlugin(playbookPlugin({}));
  await harness.installPlugin(playbooksPlugin({}));
  return harness;
}

describe("RoverOnboardingPlugin", () => {
  it("does nothing when disabled", async () => {
    const harness = await installHarness();
    const plugin = roverOnboardingPlugin({});
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const setup = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "rover-onboarding",
      visibilityScope: "restricted",
    });
    const response = await harness.sendMessage<
      {
        lifecycle: string;
        interfaceType: string;
        userPermissionLevel: "anchor";
      },
      { starters: Array<{ id: string }> }
    >("playbooks:lifecycle-starters", {
      lifecycle: "onboarding",
      interfaceType: "web-chat",
      userPermissionLevel: "anchor",
    });

    expect(setup).toBeNull();
    expect(response?.starters).toEqual([]);
  });

  it("seeds bundled onboarding playbooks when missing", async () => {
    const harness = await installHarness();
    const plugin = roverOnboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const entityService = harness.getEntityService();
    const setup = await entityService.getEntity({
      entityType: "playbook",
      id: "rover-onboarding",
      visibilityScope: "restricted",
    });
    const firstLoop = await entityService.getEntity({
      entityType: "playbook",
      id: "rover-first-knowledge-loop",
      visibilityScope: "restricted",
    });

    expect(setup?.metadata).toMatchObject({
      title: "Rover Onboarding",
      trigger: "first-anchor-web-chat",
      lifecycle: "onboarding",
    });
    expect(firstLoop?.metadata).toMatchObject({
      title: "Rover First Knowledge Loop",
      lifecycle: "onboarding",
    });
  });

  it("does not overwrite existing onboarding playbooks", async () => {
    const harness = await installHarness();
    const existingContent = "---\ntitle: Custom Onboarding\n---\n\n# Custom";
    harness.addEntities([
      {
        id: "rover-onboarding",
        entityType: "playbook",
        content: existingContent,
        metadata: { title: "Custom Onboarding" },
        visibility: "public",
      },
    ]);

    const plugin = roverOnboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const setup = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "rover-onboarding",
      visibilityScope: "restricted",
    });

    expect(setup?.content).toBe(existingContent);
    expect(setup?.metadata).toMatchObject({ title: "Custom Onboarding" });
  });

  it("registers the first web-chat onboarding starter", async () => {
    const harness = await installHarness();
    const plugin = roverOnboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const response = await harness.sendMessage<
      {
        lifecycle: string;
        interfaceType: string;
        userPermissionLevel: "anchor";
      },
      {
        starters: Array<{
          id: string;
          title: string;
          description?: string;
          playbookId: string;
          lifecycle: string;
          starterPrompt: string;
        }>;
      }
    >("playbooks:lifecycle-starters", {
      lifecycle: "onboarding",
      interfaceType: "web-chat",
      userPermissionLevel: "anchor",
    });

    expect(response?.starters).toEqual([
      {
        id: "onboarding",
        title: "Set up Rover",
        description:
          "Tune Rover's identity and anchor profile before using the knowledge loop.",
        playbookId: "rover-onboarding",
        lifecycle: "onboarding",
        starterPrompt: "Start playbook rover-onboarding.",
      },
    ]);
  });
});
