import { describe, expect, it } from "bun:test";
import type { NearestToEntityRequest } from "@brains/entity-service";
import { createMockEntityService } from "@brains/entity-service/test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads the records nearest
 * one record by their stored embeddings as its class read them through
 * context.entityService: the request handed on as written, at the scope
 * it names.
 */

describe("a first-party service reading what is nearest a record", () => {
  it("hands the request to the entity service as written", async () => {
    const asked: NearestToEntityRequest[] = [];
    const shell = createMockShell({
      entityService: {
        ...createMockEntityService(),
        nearestToEntity: async (request: NearestToEntityRequest) => {
          asked.push(request);
          return [
            {
              entityId: "post-1",
              entityType: "post",
              distance: 0.12,
              metadata: { title: "Tides" },
            },
          ];
        },
      },
    });
    let runtime: ServiceRuntime | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      withTools(
        defineServicePlugin({ id: "probe", config: z.object({}) }),
        (context) => {
          runtime = serviceRuntime(context);
          return [];
        },
      ),
      {},
      { name: "@brains/probe", version: "0.1.0" },
      { pluginId: "probe" },
    );
    await plugin?.register(shell);
    if (!runtime) throw new Error("The tools slot did not run");

    const request: NearestToEntityRequest = {
      origin: { entityType: "topic", entityId: "tides" },
      types: ["post"],
      maxDistance: 0.3,
      limit: 5,
      includeMetadata: true,
      visibilityScope: "restricted",
    };
    expect(await runtime.entityReads.nearestToEntity(request)).toEqual([
      {
        entityId: "post-1",
        entityType: "post",
        distance: 0.12,
        metadata: { title: "Tides" },
      },
    ]);
    expect(asked).toEqual([request]);
  });
});
