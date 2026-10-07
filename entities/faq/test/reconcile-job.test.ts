import { expect, it, spyOn } from "bun:test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import definition from "../src";
import { faqSchema } from "../src/schemas/faq";
import { createFaqContent, faqMetadata } from "../src/lib/faq-content";

it("runs declared reconciliation through owned matching and an atomic fold", async () => {
  const harness = createPluginHarness();
  let confirmations = 0;
  harness.getMockShell().generateObject = async <T>(
    _prompt: string,
    schema: { parse(value: unknown): T },
  ): Promise<{ object: T }> => {
    confirmations++;
    return { object: schema.parse({ same: true }) };
  };
  try {
    await harness.installPlugins(
      instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@brains/faq", version: "0.0.0-test" },
      ),
    );
    await harness.finalizeRegistration();
    const service = harness.getEntityService();
    for (const [id, created, asked] of [
      ["target", "2026-01-01T00:00:00.000Z", 3],
      ["source", "2026-01-02T00:00:00.000Z", 2],
    ] as const) {
      const fields = {
        question: "How do I publish?",
        status: "draft" as const,
        asked,
      };
      await service.createEntity({
        entity: {
          entityType: "faq",
          id,
          created,
          visibility: "restricted",
          content: createFaqContent(fields, `Answer ${id}`),
          metadata: faqMetadata(fields),
        },
      });
    }
    const query = spyOn(service, "searchWithDistances").mockResolvedValue([
      { entityType: "faq", entityId: "target", distance: 0.1 },
    ]);
    const type = "@brains/faq:capture:faq-reconcile";
    expect(await harness.runJob(type, { entityId: "source" })).toEqual({
      outcome: "folded",
      into: "target",
    });
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      types: ["faq"],
      visibility: "restricted",
      excludeIds: ["source"],
      limit: 20,
    });
    expect(
      await service.getEntity({
        entityType: "faq",
        id: "source",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
    const target = await service.getEntity(
      { entityType: "faq", id: "target", visibilityScope: "restricted" },
      faqSchema,
    );
    expect(target?.metadata.asked).toBe(5);
    expect(target?.visibility).toBe("restricted");
    expect(await harness.runJob(type, { entityId: "source" })).toEqual({
      outcome: "gone",
    });
    expect(confirmations).toBe(1);
  } finally {
    await harness.reset();
  }
});
