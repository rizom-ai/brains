import { describe, expect, it } from "bun:test";
import { baseEntitySchema } from "@brains/entity-service";
import { createMockEntityService } from "@brains/entity-service/test";
import { createAuthoringEntityReader } from "../src/internal/authoring-entity-access";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { createTestEntityAccess } from "../src/test/entity-access";
import { createInterfaceEntityAccess } from "../src/interface/interface-entity-access";
import { defineEntity } from "../src/public/entity-definition";
import {
  createDeclarativeDataSource,
  defineDataSource,
} from "../src/public/entity-data-source";
import { z } from "@brains/utils/zod";

const definition = defineEntity({
  type: "published-record",
  purpose: "Publication-filter forwarding",
  metadata: z.object({ status: z.string().optional() }),
});

describe("published-only curated readers", () => {
  for (const publishedOnly of [true, false]) {
    it(`preserves publishedOnly:${publishedOnly}, schemas and caller visibility`, async () => {
      const service = createMockEntityService();
      const native = createJobEntityAccess(
        service,
        new Set(),
        "reader",
        "public",
      );
      const reader = createAuthoringEntityReader(native);
      const request = {
        entityType: definition.type,
        id: "draft",
        publishedOnly,
        visibilityScope: "restricted" as const,
      };
      await reader.getEntity(request);
      expect(service.getEntity).toHaveBeenLastCalledWith({
        ...request,
        visibilityScope: "public",
      });
      await reader.getEntity(request, baseEntitySchema);
      expect(service.getEntity).toHaveBeenLastCalledWith(
        { ...request, visibilityScope: "public" },
        baseEntitySchema,
      );
      await reader.search(definition, "needle", {
        publishedOnly,
        visibilityScope: "restricted",
      });
      expect(service.search).toHaveBeenLastCalledWith({
        query: "needle",
        options: {
          types: [definition.type],
          publishedOnly,
          visibilityScope: "public",
        },
      });
      const testReader = createTestEntityAccess({ entityService: service });
      await testReader.getEntity(request, baseEntitySchema);
      expect(service.getEntity).toHaveBeenLastCalledWith(
        request,
        baseEntitySchema,
      );
      const interfaceReader = createAuthoringEntityReader(
        createInterfaceEntityAccess(service, "reader-interface"),
      );
      await interfaceReader.getEntity(request, baseEntitySchema);
      expect(service.getEntity).toHaveBeenLastCalledWith(
        request,
        baseEntitySchema,
      );
      await interfaceReader.search(definition, "needle", { publishedOnly });
      expect(service.search).toHaveBeenLastCalledWith({
        query: "needle",
        options: { types: [definition.type], publishedOnly },
      });
      const dataRequest = {
        entityType: definition.type,
        id: "draft",
        publishedOnly,
      };
      const source = createDeclarativeDataSource(
        defineDataSource({
          id: "publication-source",
          name: "Publication source",
          description: "Publication forwarding",
          fetch: async (_query, entities) => {
            await entities.getEntity(dataRequest, baseEntitySchema);
            return null;
          },
        }),
        "reader:publication-source",
      );
      await source.fetch({}, z.null(), { entityService: service });
      expect(service.getEntity).toHaveBeenLastCalledWith(
        dataRequest,
        baseEntitySchema,
      );
      expect(request.visibilityScope).toBe("restricted");
      expect("getEntityRaw" in reader).toBe(false);
      expect("registry" in reader).toBe(false);
    });
  }
});
