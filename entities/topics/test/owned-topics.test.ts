import { describe, expect, it } from "bun:test";
import { caughtError, createMockProgressReporter } from "@brains/test-utils";
import { defineJob, defineServicePlugin, z } from "@brains/sdk/services";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { topic } from "../src/topic-entity";
import { createTopicBody } from "../src/lib/topic-body";
import { ownedTopics } from "../src/lib/owned-topics";

describe("Topics issued-snapshot removal", () => {
  it.each(["unchanged", "body", "visibility"] as const)(
    "uses the installed job's full revision (%s)",
    async (change) => {
      const harness = createPluginHarness({ logContext: "owned-topic-job" });
      const service = harness.getEntityService();
      const probe = defineJob({
        name: "probe",
        input: z.object({}),
        output: z.object({}),
      });
      const definition = defineServicePlugin(
        { id: "maintenance", config: z.object({}), entities: [topic] },
        {
          jobs: () => [
            probe.handle(async (context) => {
              const access = ownedTopics(context.entities, "public");
              const [selected] = await access.readTopics();
              if (!selected) throw new Error("Missing selected topic");
              if (change !== "unchanged")
                await service.updateEntity({
                  entity: {
                    ...selected.entity,
                    ...(change === "body"
                      ? {
                          content: createTopicBody({
                            title: "Candidate",
                            content: "Concurrent authored change",
                          }),
                        }
                      : { visibility: "restricted" }),
                  },
                });
              await access.deleteTopic(selected.entity.id, selected.version);
              return {};
            }),
          ],
        },
      );
      try {
        for (const plugin of instantiatePluginPackageDefinition(
          definition,
          {},
          { name: "@fixture/owned-topics", version: "1" },
        ))
          await harness.installPlugin(plugin);
        await service.createEntity({
          entity: {
            id: "candidate",
            entityType: "topic",
            content: createTopicBody({
              title: "Candidate",
              content: "Original",
            }),
            metadata: {},
            visibility: "public",
          },
        });
        const handler = harness
          .getMockShell()
          .getJobQueueService()
          .getHandler("@fixture/owned-topics:maintenance:probe");
        if (!handler) throw new Error("Missing installed handler");
        const result = await handler
          .process(
            {},
            "probe",
            createMockProgressReporter(),
            new AbortController().signal,
          )
          .catch(caughtError);
        const current = await service.getEntity({
          entityType: "topic",
          id: "candidate",
          visibilityScope: "restricted",
        });
        if (change === "unchanged") {
          expect(result).toEqual({});
          expect(current).toBeNull();
        } else {
          expect(result).toMatchObject({ code: "conflict" });
          expect(current).not.toBeNull();
          if (change === "body")
            expect(current?.content).toContain("Concurrent authored change");
          else expect(current?.visibility).toBe("restricted");
        }
      } finally {
        await harness.reset();
      }
    },
  );
});
