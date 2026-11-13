import { describe, expect, it } from "bun:test";
import type {
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
} from "@brains/entity-service";
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
 * A first-party service converted from a class reads the brain's semantic
 * space as its class read it through context.semantic.project: the
 * request handed to the entity service as written, at the scope it names,
 * and the projection it answers.
 */

describe("a first-party service reading the brain's semantic space", () => {
  it("hands the request to the entity service as written", async () => {
    const asked: ProjectSemanticSpaceRequest[] = [];
    const projection: SemanticSpaceProjection = {
      origin: { kind: "centroid" },
      points: [],
      neighbors: [],
      distanceRange: { min: 0, max: 0 },
    };
    const shell = createMockShell({
      entityService: {
        ...createMockEntityService(),
        projectSemanticSpace: async (request: ProjectSemanticSpaceRequest) => {
          asked.push(request);
          return projection;
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

    const request: ProjectSemanticSpaceRequest = {
      types: ["agent"],
      origin: { entityType: "brain-character", entityId: "brain-character" },
      visibilityScope: "restricted",
    };
    expect(await runtime.entityReads.projectSemanticSpace(request)).toBe(
      projection,
    );
    expect(asked).toEqual([request]);
  });
});
