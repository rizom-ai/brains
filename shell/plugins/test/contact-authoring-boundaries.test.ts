import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type JobEntityAccess,
  type Plugin,
  type ServicePackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const configSchema = z.object({ enabled: z.boolean().default(false) });

async function fixture(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  access: JobEntityAccess;
  definition: ServicePackageDefinition<typeof configSchema>;
  plugins: Plugin[];
}> {
  const harness = createPluginHarness();
  let access: JobEntityAccess | undefined;
  const record = defineEntity({
    type: "private-record",
    purpose: "A private operational record",
    metadata: z.object({}),
    config: {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
    },
    validatePersist: (entity) => {
      expect(Object.isFrozen(entity)).toBe(true);
      expect(Object.keys(entity).sort()).toEqual(["content", "visibility"]);
      if (entity.visibility !== "restricted")
        throw new Error("Private records only");
    },
  });
  const definition = defineServicePlugin({
    id: "intake",
    config: configSchema,
    entities: [record],
    dependsOn: (config) => (config.enabled ? ["@fixture/inbox:inbox"] : []),
    setup: ({ entities }) => {
      access = entities;
      return {};
    },
  });
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/contact", version: "0.0.0" },
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);
  if (!access) throw new Error("Missing owned access");
  return { harness, access, definition, plugins };
}
const input = {
  id: "one",
  entityType: "private-record",
  content: "Private body",
  metadata: {},
  visibility: "restricted" as const,
};

describe("Contact's declarative persistence boundaries", () => {
  it("preserves conditional create and cancellation without admitting a second write", async () => {
    const f = await fixture();
    try {
      const beforeWrite = mock(
        async (stored: {
          readonly metadata: Record<string, unknown>;
        }): Promise<void> => {
          expect(Object.isFrozen(stored)).toBe(true);
          stored.metadata["notStored"] =
            "A guard cannot patch canonical metadata";
        },
      );
      await f.access.create(input, {
        conditionalWrite: { expectedRevision: null },
        beforeWrite,
      });
      expect(beforeWrite).toHaveBeenCalledTimes(1);
      expect(
        (
          await f.access.getEntity({
            entityType: input.entityType,
            id: input.id,
            visibilityScope: "restricted",
          })
        )?.metadata,
      ).toEqual({});
      const conflict = await f.access
        .create(input, {
          conditionalWrite: { expectedRevision: null },
        })
        .catch((error: unknown) => error);
      expect(conflict).toBeInstanceOf(Error);
      const signal = AbortSignal.abort();
      const cancelled = await f.access
        .create({ ...input, id: "cancelled" }, { signal })
        .catch((error: unknown) => error);
      expect(cancelled).toBe(signal.reason);
      expect(
        await f.access.getEntity({
          entityType: input.entityType,
          id: "cancelled",
          visibilityScope: "restricted",
        }),
      ).toBeNull();
    } finally {
      await f.harness.reset();
    }
  });
  it("preserves the content-hash compare before an owned update", async () => {
    const f = await fixture();
    try {
      await f.access.create(input);
      const current = await f.access.getEntity({
        entityType: input.entityType,
        id: input.id,
        visibilityScope: "restricted",
      });
      if (!current) throw new Error("Missing record");
      expect(
        await f.access.update(
          { ...current, content: "Replacement" },
          { expectedContentHash: "stale" },
        ),
      ).toMatchObject({ skipped: true, skipReason: "content-conflict" });
      expect(
        (
          await f.access.getEntity({
            entityType: input.entityType,
            id: input.id,
            visibilityScope: "restricted",
          })
        )?.contentHash,
      ).toBe(current.contentHash);
      expect(
        await f.access.update(
          { ...current, content: "Replacement" },
          { expectedContentHash: current.contentHash },
        ),
      ).toMatchObject({ skipped: false });
    } finally {
      await f.harness.reset();
    }
  });
  it("keeps private invariants and write ownership ahead of caller guards", async () => {
    const f = await fixture();
    try {
      const refused = await f.access
        .create({ ...input, visibility: "public" })
        .catch((error: unknown) => error);
      expect(refused).toEqual(new Error("Private records only"));
      const beforeWrite = mock(async () => {});
      expect(() =>
        f.access.create({ ...input, entityType: "foreign" }, { beforeWrite }),
      ).toThrow();
      expect(beforeWrite).not.toHaveBeenCalled();
      expect(
        f.harness.getEntityRegistry().getEntityTypeConfig(input.entityType),
      ).toMatchObject({
        embeddable: false,
        fullTextSearchable: false,
        projectionSource: false,
      });
    } finally {
      await f.harness.reset();
    }
  });
  it("requires external dependencies only when the optional integration is enabled", async () => {
    const f = await fixture();
    try {
      expect(
        f.plugins.find((plugin) => plugin.type === "service")?.dependencies,
      ).toEqual([]);
      const enabled = instantiatePluginPackageDefinition(
        f.definition,
        { enabled: true },
        { name: "@fixture/contact", version: "0.0.0" },
      );
      expect(
        enabled.find((plugin) => plugin.type === "service")?.dependencies,
      ).toEqual(["@fixture/inbox:inbox"]);
    } finally {
      await f.harness.reset();
    }
  });
});
