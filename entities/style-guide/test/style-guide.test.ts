import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  styleGuideFromEntity,
  formatVoiceGuidance,
} from "@brains/sdk/entities";
import styleGuidePackage, { styleGuide } from "../src";

const PACKAGE_METADATA = { name: "@brains/style-guide", version: "0.0.0-test" };

async function install(): Promise<ReturnType<typeof createPluginHarness>> {
  const plugin = instantiatePluginPackageDefinition(
    styleGuidePackage,
    {},
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Style guide entity plugin was not created");
  const harness = createPluginHarness({
    logger: createSilentLogger("style-guide-test"),
  });
  await harness.installPlugin(plugin);
  return harness;
}

describe("style guide entity definition", () => {
  it("declares the singleton entity type", () => {
    expect(styleGuide.type).toBe("style-guide");
    expect(styleGuide.config).toEqual({ embeddable: false });
  });

  it("seeds itself after content sync completes, not before", async () => {
    const harness = await install();
    const read = (): Promise<unknown> =>
      harness
        .getEntityService()
        .getEntity({ entityType: "style-guide", id: "style-guide" });

    expect(await read()).toBeNull();
    await harness.sendMessage("sync:initial:completed", {});
    expect(await read()).toMatchObject({ id: "style-guide" });

    harness.reset();
  });

  it("does not overwrite a style guide that already exists", async () => {
    const harness = await install();
    await harness.getEntityService().createEntity({
      entity: {
        id: "style-guide",
        entityType: "style-guide",
        content: "Ours, hand written.",
        metadata: { name: "House voice" },
      },
    });

    await harness.sendMessage("sync:initial:completed", {});

    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "style-guide", id: "style-guide" });
    expect(styleGuideFromEntity(entity).name).toBe("House voice");

    harness.reset();
  });
});

describe("styleGuideFromEntity", () => {
  it("reads structured guidance from metadata and prose from content", () => {
    expect(
      styleGuideFromEntity({
        id: "style-guide",
        content: "Write plainly.",
        metadata: {
          name: "House voice",
          voice: { summary: "Decisive and evidence-led" },
        },
      }),
    ).toMatchObject({
      name: "House voice",
      guidance: "Write plainly.",
      voice: { summary: "Decisive and evidence-led" },
    });
  });

  it("degrades to the default when metadata does not satisfy the schema", () => {
    // Covers pre-migration rows, where the guide was still embedded in
    // content and metadata was empty. Those repopulate on the next import.
    expect(
      styleGuideFromEntity({
        id: "style-guide",
        content: "---\nname: Old shape\n---\nWrite plainly.",
        metadata: {},
      }).name,
    ).toBe("Default style guide");
  });

  it("degrades to the default for a missing entity", () => {
    expect(styleGuideFromEntity(null).name).toBe("Default style guide");
  });

  it("feeds voice formatting", () => {
    const guidance = formatVoiceGuidance(
      styleGuideFromEntity({
        id: "style-guide",
        content: "",
        metadata: {
          name: "House voice",
          voice: { summary: "Decisive and evidence-led" },
        },
      }),
    );
    expect(guidance).toContain("Decisive and evidence-led");
  });
});
