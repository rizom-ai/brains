import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createPlaybooksPlugins } from "./playbooks-plugins";

/** The instructions the playbook type's plugin registers, as the brain reads them. */
async function instructions(): Promise<string | undefined> {
  const [playbookType] = createPlaybooksPlugins();
  if (!playbookType) throw new Error("The package installs no playbook type");
  return (await createPluginHarness().installPlugin(playbookType)).instructions;
}

describe("PlaybookPlugin instructions", () => {
  it("routes playbook status checks to the canonical tool", async () => {
    const text = await instructions();

    expect(text).toContain("call playbook_manage action=status");
    expect(text).not.toContain("playbook_status");
  });
});
