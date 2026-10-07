import { expect, test } from "bun:test";
import { scopeEntityReads } from "@brains/entity-service";
import { createMockEntityService } from "@brains/entity-service/test";
import { z } from "@brains/utils/zod";
import {
  createDeclarativeDataSource,
  defineDataSource,
} from "../src/public/entity-data-source";

test.each([true, false, undefined])(
  "data sources receive detached frozen publication metadata: %s",
  async (publishedOnly) => {
    const service = createMockEntityService();
    const native = {
      entityService: scopeEntityReads(service, {
        publishedOnly: true,
        visibilityScope: "public",
      }),
      ...(publishedOnly === undefined ? {} : { publishedOnly }),
    };
    Object.defineProperty(native, "privateRuntime", {
      get() {
        throw new Error("Must not read unknown runtime fields");
      },
    });
    let retained: { readonly publishedOnly?: boolean | undefined } | undefined;
    const source = createDeclarativeDataSource(
      defineDataSource({
        id: "context",
        name: "Context",
        description: "Read-only metadata",
        fetch: async (_query, entities, context) => {
          retained = context;
          expect(context).toEqual(
            publishedOnly === undefined ? {} : { publishedOnly },
          );
          expect(Object.isFrozen(context)).toBe(true);
          expect(Reflect.set(context, "publishedOnly", false)).toBe(false);
          expect("entityService" in context).toBe(false);
          expect("getEntityRaw" in entities).toBe(false);
          await entities.getEntity({
            entityType: "note",
            id: "draft",
            publishedOnly: false,
          });
          return null;
        },
      }),
      "owner:context",
    );
    await source.fetch({}, z.null(), native);
    expect(service.getEntity).toHaveBeenLastCalledWith({
      entityType: "note",
      id: "draft",
      publishedOnly: true,
      visibilityScope: "public",
    });
    Reflect.set(native, "publishedOnly", !publishedOnly);
    expect(retained?.publishedOnly).toBe(publishedOnly);
  },
);

test("malformed runtime metadata is rejected before invoking author code", async () => {
  let called = false;
  const source = createDeclarativeDataSource(
    defineDataSource({
      id: "context",
      name: "Context",
      description: "Validation",
      fetch: async () => {
        called = true;
        return null;
      },
    }),
    "owner:context",
  );
  const context = {
    entityService: createMockEntityService(),
    publishedOnly: true,
  };
  Reflect.set(context, "publishedOnly", "false");
  const failure = await source
    .fetch({}, z.null(), context)
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(z.ZodError);
  expect(called).toBe(false);
});
