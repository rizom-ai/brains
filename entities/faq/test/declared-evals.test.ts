import { expect, test, spyOn } from "bun:test";
import {
  instantiatePluginPackageDefinition,
  type EvalHandler,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import definition from "../src";

for (const { threshold, distance, same } of [
  { threshold: 0.25, distance: 0.1, same: true },
  { threshold: 0.25, distance: 0.4, same: false },
  { threshold: 0.45, distance: 0.4, same: true },
])
  test(`canonical FAQ eval uses configured ${threshold} threshold for distance ${distance} with private fixtures`, async () => {
    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    const handlers = new Map<string, EvalHandler>();
    shell.registerEvalHandler = (_owner, name, handler): void => {
      handlers.set(name, handler);
    };
    let confirmations = 0;
    shell.generateObject = async <T>(
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
          { sameQuestionDistance: threshold },
          { name: "@brains/faq", version: "0.0.0-test" },
        ),
      );
      await harness.finalizeRegistration();
      expect(confirmations).toBe(0);
      const service = harness.getEntityService();
      await service.createEntity({
        entity: {
          entityType: "note",
          id: "unrelated",
          content: "Keep this private note",
          visibility: "restricted",
          metadata: {},
        },
      });
      const search = spyOn(service, "searchWithDistances").mockResolvedValue([
        { entityType: "faq", entityId: "eval-stored-faq", distance },
      ]);
      const evaluate = handlers.get("sameQuestion");
      if (!evaluate) throw new Error("Missing declared FAQ eval");
      const pair = {
        stored: { question: "How do I publish?", answer: "Use publish." },
        incoming: { question: "How can I publish?", answer: "Use publish." },
      };
      for (let run = 0; run < 2; run++) {
        expect(await evaluate(pair)).toEqual({
          distance,
          shortlisted: same,
          sameQuestion: same,
        });
        expect(
          await service.getEntity({
            entityType: "faq",
            id: "eval-stored-faq",
            visibilityScope: "public",
          }),
        ).toBeNull();
        expect(
          (
            await service.getEntity({
              entityType: "faq",
              id: "eval-stored-faq",
              visibilityScope: "restricted",
            })
          )?.visibility,
        ).toBe("restricted");
      }
      expect(search.mock.calls[0]?.[0]).toMatchObject({
        visibility: "restricted",
        maxDistance: 2,
        limit: 1,
      });
      expect(search.mock.calls[1]?.[0]).toMatchObject({
        visibility: "restricted",
        maxDistance: threshold,
        limit: 20,
      });
      expect(confirmations).toBe(same ? 2 : 0);
      expect(
        (
          await service.getEntity({
            entityType: "note",
            id: "unrelated",
            visibilityScope: "restricted",
          })
        )?.content,
      ).toBe("Keep this private note");
    } finally {
      await harness.reset();
    }
  });
