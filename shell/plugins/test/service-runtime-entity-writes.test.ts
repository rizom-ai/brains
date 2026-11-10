import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockEntityService } from "@brains/entity-service/test";
import type {
  CreateEntityRequest,
  UpdateEntityRequest,
} from "@brains/entity-service";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type BaseEntity,
  type EntityMutationResult,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class writes another package's
 * types as its class wrote them through context.entityService: the request
 * handed to the entity service as written, with the attribution and options
 * it names and none it does not, and no action policy beyond the store's.
 */

const post: BaseEntity = {
  id: "my-post",
  entityType: "post",
  content: "A post",
  contentHash: "hash",
  visibility: "public",
  metadata: { title: "My Post" },
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};

describe("a first-party service writing as its class wrote", () => {
  it("hands each write to the entity service as written", async () => {
    const created: CreateEntityRequest<BaseEntity>[] = [];
    const updated: UpdateEntityRequest<BaseEntity>[] = [];
    const shell = createMockShell({
      entityService: {
        ...createMockEntityService(),
        createEntity: async <T extends BaseEntity>(
          request: CreateEntityRequest<T>,
        ): Promise<EntityMutationResult> => {
          created.push(request);
          return {
            entityId: request.entity.id ?? "",
            jobId: "",
            skipped: false,
          };
        },
        updateEntity: async <T extends BaseEntity>(
          request: UpdateEntityRequest<T>,
        ): Promise<EntityMutationResult> => {
          updated.push(request);
          return { entityId: request.entity.id, jobId: "", skipped: false };
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

    // A type the package does not own, with nobody attributed.
    expect(
      await runtime.entityWrites.createEntity({
        entity: {
          id: "abc",
          entityType: "image",
          content: "data:image/png;base64,AA==",
          metadata: { title: "Photo" },
        },
      }),
    ).toEqual({ entityId: "abc", jobId: "", skipped: false });
    await runtime.entityWrites.updateEntity({
      entity: { ...post, metadata: { ...post.metadata, coverImageId: "abc" } },
      options: {
        eventContext: { actor: { kind: "user", userId: "operator" } },
      },
    });

    expect(created).toEqual([
      {
        entity: {
          id: "abc",
          entityType: "image",
          content: "data:image/png;base64,AA==",
          metadata: { title: "Photo" },
        },
      },
    ]);
    expect(updated).toEqual([
      {
        entity: {
          ...post,
          metadata: { ...post.metadata, coverImageId: "abc" },
        },
        options: {
          eventContext: { actor: { kind: "user", userId: "operator" } },
        },
      },
    ]);
    expect(Object.keys(runtime.entityWrites).sort()).toEqual([
      "createEntity",
      "updateEntity",
    ]);
  });
});
