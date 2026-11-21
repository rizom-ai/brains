import { afterEach, expect, test } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  storedDocumentCodec,
  withFrontmatterSchema,
  type AnyEntityDefinition,
} from "@brains/plugins";
import { createMockShell, isDeclaredEntityType } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

/**
 * Grouping fields on a declared type, whose reads hand back its body alone:
 * the frontmatter a grouping keeps lives only in the stored document, so a
 * field update confirms the stored value and keeps every other field the
 * document carries, as it does for an entity plugin class's type.
 */

const memo = defineEntity({
  type: "memo",
  purpose: "A memo in a grouping.",
  metadata: z.object({ title: z.string(), summary: z.string().optional() }),
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

/**
 * A memo read as its stored document, whose file states a layout its
 * metadata does not hold: the header presents it, as the grouping
 * definitions document presents its groupings, but the type never writes
 * it from its fields.
 */
const layoutHeader = z.looseObject({ title: z.string() });
const layoutMemo = withFrontmatterSchema(
  defineEntity({
    type: "memo",
    purpose: "A memo whose file states a layout.",
    metadata: z.object({ title: z.string() }),
    markdown: storedDocumentCodec<
      typeof layoutHeader,
      z.ZodObject<{ title: z.ZodString }>
    >({
      header: layoutHeader,
      deriveMetadata: (header) => ({ title: header.title }),
      readAsWritten: true,
    }),
  }),
  z.object({ title: z.string(), layout: z.string().optional() }),
);

async function fixture(
  definition: AnyEntityDefinition = memo,
  markdown = "---\ntitle: Member\nclients: [Acme]\nprojects: [Launch]\nunclaimed: null\n---\nBody\n",
): Promise<{
  stored: () => Promise<string>;
  exec: (
    input: Record<string, unknown>,
  ) => ReturnType<ReturnType<typeof createEntityUpdateTool>["handler"]>;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [definition] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
  )) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
  }
  for (const field of ["clients", "projects"]) {
    registry.registerGrouping({
      key: field,
      field,
      label: field,
      types: ["memo"],
    });
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: createRefusingEmbeddingService(),
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  await service.createEntityFromMarkdown({
    input: {
      entityType: "memo",
      id: "member",
      markdown,
    },
  });
  const tool = createEntityUpdateTool(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: service,
    }),
  );
  return {
    stored: async () =>
      (
        await service.getEntity({
          entityType: "memo",
          id: "member",
          visibilityScope: "restricted",
          source: true,
        })
      )?.content ?? "",
    exec: (input) =>
      tool.handler(input, {
        interfaceType: "test",
        actor: { kind: "user", userId: "editor" },
        userPermissionLevel: "admin",
      }),
  };
}

const confirmation = z.object({
  needsConfirmation: z.literal(true),
  preview: z.string(),
  args: z.record(z.string(), z.unknown()),
});

test("confirms the stored value and keeps the document's other fields", async () => {
  const { stored, exec } = await fixture();
  const proposal = confirmation.parse(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { clients: ["Beta"], title: "Renamed" } },
    }),
  );
  expect(proposal.preview).toContain('clients: ["Acme"] → ["Beta"]');
  expect(await exec(proposal.args)).toMatchObject({ success: true });
  expect(await stored()).toBe(
    "---\ntitle: Renamed\nclients:\n  - Beta\nprojects:\n  - Launch\nunclaimed: null\n---\nBody\n",
  );
});

test("removes a field and keeps the others", async () => {
  const { stored, exec } = await fixture();
  const proposal = confirmation.parse(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { clients: null } },
    }),
  );
  expect(proposal.preview).toContain('clients: ["Acme"] → (removed)');
  expect(await exec(proposal.args)).toMatchObject({ success: true });
  expect(await stored()).toBe(
    "---\ntitle: Member\nprojects:\n  - Launch\nunclaimed: null\n---\nBody\n",
  );
});

// The document a field update writes is the stored one, every key in its
// place: a field of the type's own that the update removes stays removed.
test("removes a field of the type's own beside a grouping field", async () => {
  const { stored, exec } = await fixture();
  const setting = confirmation.parse(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { summary: "Short", clients: ["Beta"] } },
    }),
  );
  expect(await exec(setting.args)).toMatchObject({ success: true });
  expect(await stored()).toBe(
    "---\ntitle: Member\nclients:\n  - Beta\nprojects:\n  - Launch\nunclaimed: null\nsummary: Short\n---\nBody\n",
  );

  const removing = confirmation.parse(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { summary: null, clients: ["Gamma"] } },
    }),
  );
  expect(await exec(removing.args)).toMatchObject({ success: true });
  expect(await stored()).toBe(
    "---\ntitle: Member\nclients:\n  - Gamma\nprojects:\n  - Launch\nunclaimed: null\n---\nBody\n",
  );
});

// A key the document holds that the type does not write from its fields is
// the file's own: a field update cannot change it, and says so rather than
// reporting a change it does not make.
test("refuses to write a header key the type does not write from its fields", async () => {
  const { stored, exec } = await fixture(
    layoutMemo,
    "---\ntitle: Member\nlayout: wide\n---\nBody\n",
  );
  const before = await stored();
  expect(
    await exec({
      entityType: "memo",
      id: "member",
      operation: { fields: { layout: "narrow" } },
    }),
  ).toMatchObject({
    success: false,
    error: expect.stringContaining("does not persist layout through 'fields'"),
  });
  expect(await stored()).toBe(before);
});
