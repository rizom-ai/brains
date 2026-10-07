import { randomUUID } from "node:crypto";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { defineEntityPackage } from "@brains/sdk/entities";
import { faq } from "../../src/faq-entity";

/** Install the real declaration without starting capture/model jobs. */
export async function faqEntityHarness(): Promise<
  ReturnType<typeof createPluginHarness>
> {
  const harness = createPluginHarness({
    dataDir: `/tmp/test-faq-entity-${randomUUID()}`,
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "faq", entities: [faq] }),
    {},
    { name: "@brains/faq", version: "0.0.0-test" },
  ))
    await harness.installPlugin(plugin);
  return harness;
}
