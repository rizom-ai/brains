import { createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  playbookAdapter,
  playbookPlugin,
  playbooksPlugin,
} from "@brains/playbooks";
import { createPluginHarness } from "@brains/plugins/test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import onboardingPackage from "../src";
import { onboardingPlugin } from "./onboarding-plugin";

/** The `playbooks:lifecycle-starters` answer, as the plugin builds it. */
const startersAnswerSchema = z.object({ starters: z.array(z.unknown()) });

async function tempStorageDir(): Promise<string> {
  return createTempDataDir("brains-onboarding-");
}

/** The shell announces settled startup content once the import is in place. */
async function settleStartupContent(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<void> {
  await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
}

async function installHarness(): Promise<
  ReturnType<typeof createPluginHarness>
> {
  const harness = createPluginHarness({ dataDir: await tempStorageDir() });
  await harness.installPlugin(playbookPlugin({}));
  await harness.installPlugin(playbooksPlugin({}));
  return harness;
}

describe("onboarding", () => {
  it("default-exports its service package definition", () => {
    expect(onboardingPackage).toMatchObject({
      kind: "rizom-plugin-package",
      family: "service",
      id: "onboarding",
    });
  });

  it("registers under the plugin id its class had, after the playbook plugins", async () => {
    const harness = await installHarness();
    const plugin = onboardingPlugin({ enabled: true });
    const capabilities = await harness.installPlugin(plugin);

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "onboarding",
      "service",
      "@brains/onboarding",
    ]);
    expect(plugin.dependencies).toEqual(["playbook", "playbooks"]);
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
  });

  it("refuses an unknown config key", () => {
    // The config is strict, as the class's was.
    const config = { enabled: true, extra: 1 };
    expect(() => onboardingPlugin(config)).toThrow(/extra/);
  });

  it("does nothing when disabled", async () => {
    const harness = await installHarness();
    const plugin = onboardingPlugin({});
    await harness.installPlugin(plugin);
    await plugin.ready?.();
    await settleStartupContent(harness);

    const setup = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "onboarding",
      visibilityScope: "restricted",
    });
    const response = startersAnswerSchema.parse(
      await harness.sendMessage("playbooks:lifecycle-starters", {
        lifecycle: "onboarding",
        interfaceType: "web-chat",
        userPermissionLevel: "admin",
      }),
    );

    expect(setup).toBeNull();
    expect(response.starters).toEqual([]);
  });

  it("seeds bundled onboarding playbooks once startup content has settled", async () => {
    const harness = await installHarness();
    const plugin = onboardingPlugin({ enabled: true });
    await harness.installPlugin(plugin);
    await plugin.ready?.();

    const entityService = harness.getEntityService();
    expect(
      await entityService.getEntity({
        entityType: "playbook",
        id: "onboarding",
        visibilityScope: "restricted",
      }),
    ).toBeNull();

    await settleStartupContent(harness);
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
    expect(
      setup?.content.match(/operation: \{ content: <full markdown> \}/g),
    ).toHaveLength(2);
    expect(setup?.content).not.toContain("the `content` argument");
    expect(firstLoop?.metadata).toMatchObject({
      title: "Brain First Knowledge Loop",
      lifecycle: "onboarding",
    });
    // Only the step whose outcome is an answer in chat accepts a reply as proof.
    const loopStates = playbookAdapter.parsePlaybookContent(
      firstLoop?.content ?? "",
    ).body.states;
    expect(
      loopStates.find((state) => state.id === "retrieve-and-transform")
        ?.provenBy,
    ).toEqual(["reply"]);
    expect(
      loopStates.find((state) => state.id === "first-note"),
    ).not.toHaveProperty("provenBy");
  });

  it("does not overwrite existing onboarding playbooks", async () => {
    const harness = await installHarness();
    // A playbook the owner rewrote: still one the playbook type can read.
    const bundled = await readFile(
      join(import.meta.dir, "..", "content", "playbook", "onboarding.md"),
      "utf8",
    );
    const existingContent = bundled.replace(
      "title: Brain Onboarding",
      "title: Custom Onboarding",
    );
    expect(existingContent).not.toBe(bundled);
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
    await settleStartupContent(harness);

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
    await settleStartupContent(harness);

    const response = startersAnswerSchema.parse(
      await harness.sendMessage("playbooks:lifecycle-starters", {
        lifecycle: "onboarding",
        interfaceType: "web-chat",
        userPermissionLevel: "admin",
      }),
    );

    expect(response.starters).toEqual([
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
