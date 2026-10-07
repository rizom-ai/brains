import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity, type InterfaceCaller } from "../src";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { createRuntimeRoute } from "../src/interface/route-runtime";
import { createPluginHarness } from "../src/test/harness";
import { createOperatorEntities } from "../src/service/operator-entities";
import { createOperatorGroupings } from "../src/service/operator-groupings";
import { operatorValidationCause } from "../src/service/operator-validation";

import type { WebRouteDefinition } from "../src/types/web-routes";

type Harness = ReturnType<typeof createPluginHarness>;
const claims: InterfaceCaller = {
  actor: { id: "operator" },
  permission: "admin",
  isAnchor: true,
};
const request = {
  entityType: "guarded-note",
  entity: {
    id: "one",
    entityType: "guarded-note",
    content: "Body",
    metadata: {},
    visibility: "restricted" as const,
  },
};
async function fixture(): Promise<Harness> {
  const h = createPluginHarness();
  const entity = defineEntity({
    type: request.entityType,
    purpose: "Foreign-owned record",
    metadata: z.object({}),
    config: {
      actionPolicy: { create: "admin", update: "admin", delete: "admin" },
    },
  });
  for (const plugin of createEntityPackagePlugins(
    [entity],
    [],
    { name: "@fixture/owner", version: "0.0.0" },
    (id) => id,
  ))
    await h.installPlugin(plugin);
  await h.finalizeRegistration();
  return h;
}
function route(
  h: Harness,
  handle: (caller: InterfaceCaller) => Promise<unknown>,
): WebRouteDefinition {
  return createRuntimeRoute(
    {
      kind: "rizom-interface-route",
      method: "POST",
      path: "/authority",
      security: { kind: "protocol", authenticate: () => claims.actor },
      response: z.unknown(),
      handle: async ({ caller }) => {
        if (!caller) throw new Error("Missing resolved caller");
        return handle(caller);
      },
    },
    {
      declarationId: "console",
      permissions: { getUserLevel: () => "admin", isAnchor: () => true },
      auth: () => h.getMockShell().getAuthRegistry(),
    },
  );
}
const caught = (error: unknown): unknown => error;

describe("runtime-owned operator caller authority", () => {
  it("rejects fabricated callers before reads or writes", async () => {
    const h = await fixture();
    try {
      const writes = createOperatorEntities(h.getMockShell(), {
        interfaceType: "unprivileged",
      });
      const groups = createOperatorGroupings(h.getMockShell());
      expect(Object.isFrozen(writes)).toBe(true);
      // Policy presentation is advisory; a positive affordance is not authority.
      expect(writes.allows(request.entityType, "create", claims)).toBe(true);
      expect(await writes.create(request, claims).catch(caught)).toMatchObject({
        code: "unauthenticated",
      });
      expect(
        await writes
          .delete({ entityType: request.entityType, id: "one" }, claims)
          .catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
      expect(
        await writes
          .upload(
            { filename: "x", mediaType: "unknown", content: Buffer.alloc(0) },
            claims,
          )
          .catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
      expect(await groups.definitions(claims).catch(caught)).toMatchObject({
        code: "unauthenticated",
      });
      expect(
        await groups
          .catalog(
            { grouping: "labels", entityTypes: [request.entityType] },
            claims,
          )
          .catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
      expect(
        await groups
          .members(
            {
              grouping: "labels",
              value: "secret",
              entityTypes: [request.entityType],
            },
            claims,
          )
          .catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
      expect(
        await h
          .getEntityService()
          .getEntity({ entityType: request.entityType, id: "one" }),
      ).toBeNull();
    } finally {
      await h.reset();
    }
  });

  it("admits a live resolved caller but rejects copies, other runtimes and reuse after return", async () => {
    const h = await fixture();
    const other = await fixture();
    let retained: InterfaceCaller | undefined;
    try {
      const writes = createOperatorEntities(h.getMockShell(), {
        interfaceType: "console",
      });
      const foreign = createOperatorEntities(other.getMockShell(), {
        interfaceType: "console",
      });
      const response = await route(h, async (caller) => {
        retained = caller;
        expect(Object.isFrozen(caller)).toBe(true);
        expect(Object.isFrozen(caller.actor)).toBe(true);
        expect(
          await writes.create(request, { ...caller }).catch(caught),
        ).toMatchObject({ code: "unauthenticated" });
        expect(
          await foreign.create(request, caller).catch(caught),
        ).toMatchObject({ code: "unauthenticated" });
        const result = await writes.create(request, caller);
        expect(result).toMatchObject({ kind: "created" });
        return result;
      }).handler(new Request("http://localhost/authority", { method: "POST" }));
      expect(response.status).toBe(200);
      if (!retained) throw new Error("Caller not captured");
      expect(
        await writes
          .delete({ entityType: request.entityType, id: "one" }, retained)
          .catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
    } finally {
      await h.reset();
      await other.reset();
    }
  });

  it("revokes failed requests and refuses cancelled requests", async () => {
    const h = await fixture();
    let retained: InterfaceCaller | undefined;
    try {
      const writes = createOperatorEntities(h.getMockShell(), {
        interfaceType: "console",
      });
      const abort = new AbortController();
      const response = await route(h, async (caller) => {
        retained = caller;
        abort.abort();
        expect(
          await writes.create(request, caller).catch(caught),
        ).toMatchObject({ code: "cancelled" });
        throw new Error("private handler failure");
      }).handler(
        new Request("http://localhost/authority", {
          method: "POST",
          signal: abort.signal,
        }),
      );
      expect(response.status).toBe(408);
      if (!retained) throw new Error("Caller not captured");
      expect(
        await createOperatorGroupings(h.getMockShell())
          .definitions(retained)
          .catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
    } finally {
      await h.reset();
    }
  });

  it("keeps deletion storage failures private while preserving diagnostics", async () => {
    const h = await fixture();
    try {
      const writes = createOperatorEntities(h.getMockShell(), {
        interfaceType: "console",
      });
      const original = new Error("private database path", {
        cause: "private token",
      });
      const response = await route(h, async (caller) => {
        expect(await writes.create(request, caller)).toMatchObject({
          kind: "created",
        });
        h.getEntityService().deleteEntity = async (): Promise<never> => {
          throw original;
        };
        const error = await writes
          .delete({ entityType: request.entityType, id: "one" }, caller)
          .catch(caught);
        expect(error).toMatchObject({
          code: "handler_failed",
          cause: undefined,
        });
        expect(JSON.stringify(error)).not.toContain("private");
        if (typeof error !== "object" || error === null)
          throw new Error("Expected coded error");
        expect(operatorValidationCause(error)).toBe(original);
        return { checked: true };
      }).handler(new Request("http://localhost/authority", { method: "POST" }));
      expect(response.status).toBe(200);
    } finally {
      await h.reset();
    }
  });
});
