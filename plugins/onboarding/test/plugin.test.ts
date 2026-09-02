import { createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import playbooksPackage from "@brains/playbooks";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { onboardingPlugin } from "./helpers/install";

async function tempStorageDir(): Promise<string> {
  return createTempDataDir("brains-onboarding-");
}

async function installHarness(): Promise<
  ReturnType<typeof createPluginHarness>
> {
  const harness = createPluginHarness({ dataDir: await tempStorageDir() });
  // One package now, entity and service both: onboarding needs the playbook
  // type registered as much as the runs that walk it.
  const metadata = { name: "@brains/playbooks", version: "0.0.0" };
  bindPluginPackageMetadata(playbooksPackage, metadata);
  await Promise.all(
    instantiatePluginPackageDefinition(playbooksPackage, {}, metadata).map(
      (plugin) => harness.installPlugin(plugin),
    ),
  );
  return harness;
}

describe("onboarding service", () => {
  it("does nothing when disabled", async () => {
    const harness = await installHarness();
    const plugin = onboardingPlugin({});
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const setup = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "onboarding",
      visibilityScope: "restricted",
    });
    const response = await harness.sendMessage<
      {
        lifecycle: string;
        interfaceType: string;
        userPermissionLevel: "admin";
      },
      { starters: Array<{ id: string }> }
    >("playbooks:lifecycle-starters", {
      lifecycle: "onboarding",
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
    });

    expect(setup).toBeNull();
    expect(response?.starters).toEqual([]);
  });

  it("seeds bundled onboarding playbooks when missing", async () => {
    const harness = await installHarness();
    const plugin = onboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const entityService = harness.getEntityService();
    const setup = await entityService.getEntity({
      entityType: "playbook",
      id: "onboarding",
      visibilityScope: "restricted",
    });
    const firstLoop = await entityService.getEntity({
      entityType: "playbook",
      id: "first-knowledge-loop",
      visibilityScope: "restricted",
    });

    expect(setup?.metadata).toMatchObject({
      title: "Brain Onboarding",
      trigger: "first-admin-web-chat",
      lifecycle: "onboarding",
    });
    expect(firstLoop?.metadata).toMatchObject({
      title: "Brain First Knowledge Loop",
      lifecycle: "onboarding",
    });
  });

  it("does not overwrite existing onboarding playbooks", async () => {
    const harness = await installHarness();
    const existingContent = "---\ntitle: Custom Onboarding\n---\n\n# Custom";
    harness.addEntities([
      {
        id: "onboarding",
        entityType: "playbook",
        content: existingContent,
        metadata: { title: "Custom Onboarding" },
        visibility: "public",
      },
    ]);

    const plugin = onboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const setup = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "onboarding",
      visibilityScope: "restricted",
    });

    expect(setup?.content).toBe(existingContent);
    expect(setup?.metadata).toMatchObject({ title: "Custom Onboarding" });
  });

  it("registers the first web-chat onboarding starter", async () => {
    const harness = await installHarness();
    const plugin = onboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const response = await harness.sendMessage<
      {
        lifecycle: string;
        interfaceType: string;
        userPermissionLevel: "admin";
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
      userPermissionLevel: "admin",
    });

    expect(response?.starters).toEqual([
      {
        id: "onboarding",
        title: "Set up your brain",
        description:
          "Tune the brain identity and anchor profile before using the knowledge loop.",
        playbookId: "onboarding",
        lifecycle: "onboarding",
        starterPrompt: "Start playbook onboarding.",
      },
    ]);
  });
});
