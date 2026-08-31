import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/onboarding` needs that the declarative surface could not say:
 * work that runs once after every plugin has registered, against other
 * packages' entity types, ordered behind the packages it seeds for.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
  name: string,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name,
    version: "0.1.0",
  });
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

describe("declarative service ready", () => {
  it("runs after registration with entities, messaging and a logger", async () => {
    const order: string[] = [];
    const definition = defineServicePlugin({
      id: "seeder",
      config: z.object({}),
      setup: ({ logger }) => {
        order.push("setup");
        logger.debug("seeder setup");
        return {};
      },
      ready: async ({ entities, messaging, logger }) => {
        order.push("ready");
        logger.debug("seeder ready");
        // Reading another package's type is the point: a seeder asks whether
        // the entity exists before creating it.
        const existing = await entities.getEntity({
          entityType: "playbook",
          id: "onboarding",
          visibilityScope: "restricted",
        });
        expect(existing).toBeNull();
        await messaging.send({
          type: "seeder:announce",
          payload: { seeded: true },
        });
      },
    });
    const harness = createPluginHarness();
    const announced: unknown[] = [];
    harness.subscribe("seeder:announce", async (message) => {
      announced.push(message.payload);
      return { success: true, data: {} };
    });
    const plugin = instantiate(definition, {}, "@fixture/seeder");
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    expect(order).toEqual(["setup"]);

    await plugin.ready?.();
    expect(order).toEqual(["setup", "ready"]);
    expect(announced).toEqual([{ seeded: true }]);
  });

  it("orders itself behind the packages it declares", () => {
    const definition = defineServicePlugin({
      id: "ordered",
      config: z.object({}),
      dependsOn: ["playbook", "playbooks"],
    });
    const plugin = instantiate(definition, {}, "@fixture/ordered");
    expect(plugin.dependencies).toEqual(["playbook", "playbooks"]);
  });

  it("seeds another package's entity declaratively, and never overwrites", async () => {
    // Job-scoped writes refuse types the package does not own, and that rule
    // must hold. A seeder therefore *declares* what should exist and the
    // runtime performs the write — the package never holds a cross-type
    // write capability.
    let loads = 0;
    const definition = defineServicePlugin({
      id: "md-seeder",
      config: z.object({}),
      seeds: () => [
        {
          entityType: "playbook",
          id: "onboarding",
          markdown: (): string => {
            loads += 1;
            return "---\ntitle: Onboarding\n---\nBody";
          },
        },
      ],
    });
    const harness = createPluginHarness();
    const created: { entityType: string; id: string }[] = [];
    const service = harness.getMockShell().getEntityService();
    const originalCreate = service.createEntityFromMarkdown.bind(service);
    service.createEntityFromMarkdown = async (
      request,
    ): ReturnType<typeof originalCreate> => {
      created.push({
        entityType: request.input.entityType,
        id: request.input.id,
      });
      return originalCreate(request);
    };
    // The seed's existence check must see what was written, or idempotence
    // cannot be observed against a mock that always answers null.
    const originalGet = service.getEntity.bind(service);
    const seededEntity = <T extends BaseEntity>(hit: {
      entityType: string;
      id: string;
    }): T =>
      ({
        id: hit.id,
        entityType: hit.entityType,
        content: "",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        visibility: "restricted",
        metadata: {},
        contentHash: "seeded",
      }) as T;
    service.getEntity = async <T extends BaseEntity>(
      request: Parameters<typeof originalGet>[0],
    ): Promise<T | null> => {
      const hit = created.find(
        (entry) =>
          entry.entityType === request.entityType && entry.id === request.id,
      );
      if (hit) return seededEntity<T>(hit);
      return originalGet<T>(request);
    };
    const plugin = instantiate(definition, {}, "@fixture/md-seeder");
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    await plugin.ready?.();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      entityType: "playbook",
      id: "onboarding",
    });

    // Second dispatch: the entity exists, so nothing loads and nothing writes.
    const existing = created.length;
    await plugin.ready?.();
    expect(created).toHaveLength(existing);
    expect(loads).toBe(1);
  });
});
