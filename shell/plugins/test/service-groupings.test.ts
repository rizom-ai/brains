import { issueRouteCaller } from "../src/internal/route-caller-authority";
import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type InterfaceCaller,
} from "../src";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { createOperatorGroupings } from "../src/service/operator-groupings";
import { createOperatorEntities } from "../src/service/operator-entities";
import { operatorValidationCause } from "../src/service/operator-validation";

const policy = z.record(
  z.string(),
  z.object({ multiple: z.boolean(), values: z.array(z.string()).min(1) }),
);
const readPolicy = (content: string): z.output<typeof policy> =>
  policy.parse(JSON.parse(content));
const vocabulary = defineEntity({
  type: "fixture-vocabulary",
  purpose: "Repairable policy",
  metadata: z.object({}),
  singleton: true,
  hasBody: false,
  config: {
    embeddable: false,
    actionPolicy: {
      create: "admin",
      update: "admin",
      delete: "admin",
      publish: "never",
    },
  },
  validatePersist: ({ content, visibility }) => {
    readPolicy(content);
    if (visibility !== "shared") throw new Error("Policy must be shared");
  },
  markdown: {
    reconstruct: (content) => ({ content, metadata: {} }),
    encode: ({ content }) => ({ content, frontmatter: {} }),
  },
});
const note = defineEntity({
  type: "group-note",
  purpose: "Contributing record",
  metadata: z.object({}),
});
const definition = defineServicePlugin(
  { id: "collections", config: z.object({}), entities: [vocabulary] },
  {
    groupings: () => ({
      definitions: [
        { key: "labels", label: "Labels", field: "labels", types: [note.type] },
      ],
      vocabulary: { entity: vocabulary, read: readPolicy },
    }),
  },
);

async function fixture(): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness();
  for (const plugin of createEntityPackagePlugins(
    [note],
    [],
    { name: "@fixture/notes", version: "0.0.0" },
    (id) => id,
  ))
    await harness.installPlugin(plugin);
  for (const plugin of instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/collections", version: "0.0.0" },
  ))
    await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
  guest = issueRouteCaller(guest, harness.getMockShell().getAuthRegistry());
  admin = issueRouteCaller(admin, harness.getMockShell().getAuthRegistry());
  return harness;
}

let guest: InterfaceCaller = {
  actor: { id: "guest" },
  permission: "public",
  isAnchor: false,
};
let admin: InterfaceCaller = {
  actor: { id: "admin" },
  permission: "admin",
  isAnchor: true,
};

describe("bounded declarative groupings", () => {
  it("enforces groupings registered after vocabulary finalization and returns safe operator issues", async () => {
    const h = await fixture();
    try {
      h.getEntityRegistry().registerGrouping({
        key: "later",
        label: "Later",
        field: "later",
        types: [note.type],
      });
      const content = JSON.stringify({
        later: { multiple: false, values: ["Allowed"] },
      });
      const service = h.getEntityService();
      const refused = await service
        .createEntity({
          entity: {
            entityType: vocabulary.type,
            id: "wrong",
            content,
            metadata: {},
            visibility: "shared",
          },
        })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(z.ZodError);
      await service.createEntity({
        entity: {
          entityType: vocabulary.type,
          id: vocabulary.type,
          content,
          metadata: {},
          visibility: "shared",
        },
      });
      const operator = createOperatorEntities(h.getMockShell(), {
        interfaceType: "studio",
      });
      const result = await operator.create(
        {
          entityType: note.type,
          entity: {
            id: "bad",
            entityType: note.type,
            content: "---\nlater: [Denied]\n---\nPrivate body",
            metadata: {},
            visibility: "public",
          },
        },
        admin,
      );
      expect(result).toEqual({
        kind: "invalid",
        issues: [
          {
            path: ["later"],
            message: "Later: choose values from the configured list.",
          },
        ],
      });
      expect(JSON.stringify(result)).not.toContain("Private body");
      expect(
        await service.getEntity({ entityType: note.type, id: "bad" }),
      ).toBeNull();
      expect(
        await operator.delete(
          { entityType: vocabulary.type, id: vocabulary.type },
          guest,
        ),
      ).toMatchObject({ kind: "not-found" });
      expect(
        await operator.delete(
          { entityType: vocabulary.type, id: vocabulary.type },
          issueRouteCaller(
            { ...guest, permission: "trusted" },
            h.getMockShell().getAuthRegistry(),
          ),
        ),
      ).toMatchObject({ kind: "denied" });
      expect(
        await operator.delete(
          { entityType: vocabulary.type, id: vocabulary.type },
          admin,
        ),
      ).toMatchObject({ kind: "deleted" });
    } finally {
      await h.reset();
    }
  });

  it("checks the registered vocabulary floor, not a forged declaration alias", async () => {
    const weak = defineEntity({
      type: "weak-policy",
      purpose: "Weak source",
      metadata: z.object({}),
      singleton: true,
    });
    const alias = defineEntity({
      type: weak.type,
      purpose: "Alias",
      metadata: z.object({}),
      singleton: true,
      config: {
        actionPolicy: { create: "admin", update: "admin", delete: "admin" },
      },
    });
    const consumer = defineServicePlugin(
      { id: "weak-consumer", config: z.object({}), entities: [weak] },
      {
        groupings: () => ({
          definitions: [],
          vocabulary: { entity: alias, read: readPolicy },
        }),
      },
    );
    const h = createPluginHarness();
    try {
      for (const plugin of instantiatePluginPackageDefinition(
        consumer,
        {},
        { name: "@fixture/weak", version: "0.0.0" },
      ))
        await h.installPlugin(plugin);
      const refused = await h
        .finalizeRegistration()
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
      expect(String(refused)).toContain("admin action policy floor");
    } finally {
      await h.reset();
    }
  });

  it("enforces live source-backed membership on foreign contributor writes and upserts", async () => {
    const h = await fixture();
    try {
      const service = h.getEntityService();
      await service.createEntity({
        entity: {
          id: vocabulary.type,
          entityType: vocabulary.type,
          content: JSON.stringify({
            labels: { multiple: false, values: ["Allowed"] },
          }),
          metadata: {},
          visibility: "shared",
        },
      });
      const input = {
        id: "n",
        entityType: note.type,
        content: "---\nlabels: [Denied]\n---\nBody",
        metadata: { labels: ["Allowed"] },
        visibility: "public" as const,
      };
      const refused = await service
        .createEntity({ entity: input })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(z.ZodError);
      expect(
        await service.getEntity({ entityType: note.type, id: "n" }),
      ).toBeNull();
      await service.createEntity({
        entity: { ...input, content: "---\nlabels: [Allowed]\n---\nBody" },
      });
      const stored = await service.getEntity({
        entityType: note.type,
        id: "n",
      });
      if (!stored) throw new Error("Missing record");
      expect(stored.metadata["labels"]).toEqual(["Allowed"]);
      const deniedUpsert = await service
        .upsertEntity({ entity: { ...stored, content: input.content } })
        .catch((error: unknown) => error);
      expect(deniedUpsert).toBeInstanceOf(z.ZodError);
      await service.updateEntity({
        entity: { ...stored, content: "---\nlabels: [Allowed]\n---\nChanged" },
      });
      expect(
        h.getEntityRegistry().getEntityTypeConfig(vocabulary.type).actionPolicy
          ?.update,
      ).toBe("admin");
      expect(
        h
          .getMockShell()
          .getPermissionService()
          .canPerformEntityAction("trusted", vocabulary.type, "update"),
      ).toBe(false);
      const source = await service.getEntity({
        entityType: vocabulary.type,
        id: vocabulary.type,
        visibilityScope: "restricted",
      });
      if (!source) throw new Error("Missing policy");
      await service.updateEntity({
        entity: {
          ...source,
          content: JSON.stringify({
            labels: { multiple: false, values: ["Denied"] },
          }),
        },
      });
      const stale = await service
        .createEntity({
          entity: {
            ...input,
            id: "new",
            content: "---\nlabels: [Allowed]\n---\nBody",
          },
        })
        .catch((error: unknown) => error);
      expect(stale).toBeInstanceOf(z.ZodError);
      await service.createEntity({ entity: { ...input, id: "new" } });
    } finally {
      await h.reset();
    }
  });

  it("reconstructs malformed source without relaxing writes or other codecs", async () => {
    const h = await fixture();
    try {
      const malformed = "---\nlabels: [unfinished\n---\n";
      const adapter = h.getEntityRegistry().getAdapter(vocabulary.type);
      expect(adapter.fromMarkdown(malformed)).toEqual({
        content: malformed,
        metadata: {},
      });
      expect(adapter.hasBody).toBe(false);
      expect(() =>
        h.getEntityRegistry().getAdapter(note.type).fromMarkdown(malformed),
      ).toThrow();
      const refused = await h
        .getEntityService()
        .createEntity({
          entity: {
            id: vocabulary.type,
            entityType: vocabulary.type,
            content: malformed,
            metadata: {},
            visibility: "shared",
          },
        })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
      expect(
        await h.getEntityService().getEntity({
          entityType: vocabulary.type,
          id: vocabulary.type,
          visibilityScope: "restricted",
        }),
      ).toBeNull();
    } finally {
      await h.reset();
    }
  });

  it("binds queries to caller visibility and returns detached fixture members", async () => {
    const h = await fixture();
    try {
      const service = h.getEntityService();
      for (const visibility of ["public", "restricted"] as const)
        await service.createEntity({
          entity: {
            id: visibility,
            entityType: note.type,
            visibility,
            metadata: {},
            content: "---\nlabels: [Allowed]\n---\nBody",
          },
        });
      const groups = createOperatorGroupings(h.getMockShell());
      const request = {
        grouping: "labels",
        entityTypes: [note.type, "foreign"],
        visibilityScope: "restricted" as const,
      };
      expect(await groups.catalog(request, guest)).toEqual({
        total: 1,
        values: [{ value: "Allowed", count: 1 }],
      });
      expect(await groups.catalog(request, admin)).toEqual({
        total: 1,
        values: [{ value: "Allowed", count: 2 }],
      });
      const page = await groups.members(
        { ...request, value: "Allowed" },
        guest,
      );
      expect(page.entities.map((entity) => entity.id)).toEqual(["public"]);
      if (!page.entities[0]) throw new Error("Missing member");
      page.entities[0].metadata["labels"] = ["Forged"];
      expect((await groups.catalog(request, guest)).values[0]?.value).toBe(
        "Allowed",
      );
      const cancelled = AbortSignal.abort();
      const error: unknown = await groups
        .catalog({ ...request, signal: cancelled }, guest)
        .catch((cause: unknown) => cause);
      expect(error).toMatchObject({ code: "cancelled", cause: undefined });
      if (typeof error !== "object" || error === null)
        throw new Error("Expected coded error");
      expect(operatorValidationCause(error)).toBe(cancelled.reason);
      expect(
        await groups
          .catalog({ ...request, limit: 101 }, guest)
          .catch((cause: unknown) => cause),
      ).toMatchObject({ code: "invalid_input", cause: undefined });
    } finally {
      await h.reset();
    }
  });
});
