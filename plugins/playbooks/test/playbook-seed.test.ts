import { describe, expect, it } from "bun:test";
import { playbookSeedContract } from "@brains/contracts";
import {
  createPluginHarness,
  createServicePluginContext,
  createTempDataDir,
} from "@brains/plugins/test";
import { playbookAdapter, playbookPlugin } from "../src";

/**
 * The playbook type's steward plants a playbook another package bundles, as
 * onboarding bundles its own: only where no playbook with that id exists at
 * any visibility, so a seed never overwrites what an owner wrote.
 */

// A playbook as a package bundles it: valid markdown the playbook type reads.
const bundled = playbookAdapter.createPlaybookContent(
  {
    title: "Bundled Guide",
    status: "active",
    audience: "admin",
    completionMode: "agent-confirmed",
  },
  {
    purpose: "Guide a first step.",
    operatingRules: ["Ask one question at a time."],
    initialState: "welcome",
    states: [
      {
        id: "welcome",
        title: "Welcome",
        instructions: ["Say hello."],
        requiredDetails: [],
        doneWhen: ["Greeted."],
        transitions: [],
      },
    ],
    finalStates: ["welcome"],
    nextPrompts: [],
  },
);

async function installPlaybook(): Promise<
  ReturnType<typeof createPluginHarness>
> {
  const harness = createPluginHarness({
    dataDir: await createTempDataDir("brains-playbook-seed-"),
  });
  await harness.installPlugin(playbookPlugin({}));
  return harness;
}

describe("seeding a bundled playbook", () => {
  it("creates the playbook where none exists", async () => {
    const harness = await installPlaybook();
    const asker = createServicePluginContext(
      harness.getMockShell(),
      "onboarding",
    );

    expect(
      await asker.messaging.request(playbookSeedContract, {
        id: "bundled-guide",
        markdown: bundled,
      }),
    ).toEqual({ status: "answered", data: { created: true } });
    const stored = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "bundled-guide",
      visibilityScope: "restricted",
    });
    expect(stored?.metadata).toMatchObject({ title: "Bundled Guide" });
  });

  it("leaves a playbook an owner wrote, even one only they can see", async () => {
    const owned = bundled.replace("title: Bundled Guide", "title: Mine");
    expect(owned).not.toBe(bundled);
    const harness = await installPlaybook();
    harness.addEntities([
      {
        id: "bundled-guide",
        entityType: "playbook",
        content: owned,
        metadata: { title: "Mine" },
        visibility: "restricted",
      },
    ]);
    const asker = createServicePluginContext(
      harness.getMockShell(),
      "onboarding",
    );

    expect(
      await asker.messaging.request(playbookSeedContract, {
        id: "bundled-guide",
        markdown: bundled,
      }),
    ).toEqual({ status: "answered", data: { created: false } });
    const stored = await harness.getEntityService().getEntity({
      entityType: "playbook",
      id: "bundled-guide",
      visibilityScope: "restricted",
    });
    expect(stored?.content).toBe(owned);
  });
});
