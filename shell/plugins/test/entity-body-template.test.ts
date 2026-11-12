import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withBodyTemplate,
  type AnyEntityDefinition,
} from "../src";

/**
 * A first-party type whose body has a shape of its own gives the vault a
 * scaffold for it, as its adapter's body formatter gave one; a type that
 * gives none leaves the body to the writer.
 */

const metadata = z.object({ title: z.string() });

const caseStudy = withBodyTemplate(
  defineEntity({ type: "case", purpose: "A case study.", metadata }),
  "## Context\n\n<!-- Write your context here -->\n",
);
const memo = defineEntity({ type: "memo", purpose: "A memo.", metadata });

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-body-template"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "cases", entities }),
    {},
    { name: "@fixture/cases", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  return harness;
}

describe("a first-party entity type's body template", () => {
  it("is the template the definition carries", async () => {
    const harness = await install([caseStudy, memo]);
    try {
      const registry = harness.getEntityRegistry();
      expect(registry.getAdapter("case").getBodyTemplate()).toBe(
        "## Context\n\n<!-- Write your context here -->\n",
      );
      expect(registry.getAdapter("memo").getBodyTemplate()).toBe("");
    } finally {
      await harness.reset();
    }
  });

  it("leaves the definition otherwise as it was", () => {
    expect(caseStudy.type).toBe("case");
    expect(caseStudy.purpose).toBe("A case study.");
    expect(Object.isFrozen(caseStudy)).toBe(true);
  });
});
