import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createMockShell, isDeclaredEntityType } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

// Like a note: a memo's title is the one its file states, else its body's
// first heading. Its file states a title only when one was stated, so a
// memo whose title comes from its heading stays plain markdown.
const memoMetadata = z.object({
  title: z.string(),
  titleStated: z.boolean().optional(),
});

function headingOf(body: string): string {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Untitled";
}

const memo = defineEntity({
  type: "memo",
  purpose: "A memo titled by its heading unless its file states a title.",
  metadata: memoMetadata,
  markdown: {
    decode: ({ content, frontmatter }) => {
      const stated =
        typeof frontmatter["title"] === "string" && frontmatter["title"].trim()
          ? frontmatter["title"]
          : undefined;
      return {
        content,
        metadata: {
          title: stated ?? headingOf(content),
          ...(stated && { titleStated: true }),
        },
      };
    },
    encode: ({ content, metadata }) => ({
      content,
      frontmatter:
        metadata.titleStated === true ? { title: metadata.title } : {},
    }),
  },
});

let service: EntityService | undefined;
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  service?.close();
  await cleanup?.();
});

async function fixture(): Promise<{
  service: EntityService;
  update: (operation: Record<string, unknown>) => Promise<unknown>;
}> {
  const directory = await createTestDirectory();
  cleanup = directory.cleanup;
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [memo] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
  )) {
    if (!isDeclaredEntityType(plugin)) {
      throw new Error("A declared entity did not build an entity plugin");
    }
    registry.registerEntityType(
      plugin.entityType,
      plugin.schema,
      plugin.adapter,
    );
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const created = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: createRefusingEmbeddingService(),
  });
  service = created;
  await created.initialize();
  await created.createEntity({
    entity: {
      id: "context",
      entityType: "memo",
      content: "## Context\n\nSix organisations began forming a federation.\n",
      metadata: { title: "Context" },
    },
  });
  const tool = createEntityUpdateTool(
    createMockSystemServices({
      entityRegistry: registry,
      entityService: created,
    }),
  );
  const exec = (input: Record<string, unknown>): Promise<unknown> =>
    tool.handler(input, {
      interfaceType: "test",
      actor: { kind: "user", userId: "editor" },
      userPermissionLevel: "admin",
    });
  return {
    service: created,
    update: async (operation): Promise<unknown> => {
      const proposed = await exec({
        entityType: "memo",
        id: "context",
        operation,
      });
      // A refused proposal is the answer: nothing was confirmed or written.
      const proposal = z
        .object({ args: z.record(z.string(), z.unknown()) })
        .safeParse(proposed);
      return proposal.success ? exec(proposal.data.args) : proposed;
    },
  };
}

async function stored(current: EntityService): Promise<BaseEntity> {
  const entity = await current.getEntity({ entityType: "memo", id: "context" });
  if (!entity) throw new Error("The memo is gone");
  return entity;
}

/** The file the brain writes for the record, and what reading it back gives. */
function file(
  current: EntityService,
  entity: BaseEntity,
): { frontmatter: Record<string, unknown>; reread: Partial<BaseEntity> } {
  const markdown = current.serializeEntity(entity);
  return {
    frontmatter: parseMarkdownWithFrontmatter(
      markdown,
      z.record(z.string(), z.unknown()),
    ).metadata,
    reread: current.deserializeEntity(markdown, "memo"),
  };
}

describe("a field update of a declared type whose file states a field only when it was stated", () => {
  it("writes a title set through fields to the file, so reading the file back keeps it", async () => {
    const { service: current, update } = await fixture();

    const outcome = await update({
      fields: { title: "The Federation — where Rizom fits" },
    });

    expect(outcome).toMatchObject({ success: true });
    const renamed = await stored(current);
    expect(renamed.metadata["title"]).toBe("The Federation — where Rizom fits");
    const written = file(current, renamed);
    expect(written.frontmatter["title"]).toBe(
      "The Federation — where Rizom fits",
    );
    expect(written.reread.metadata?.["title"]).toBe(
      "The Federation — where Rizom fits",
    );
  });

  it("still takes a title it never stated from the heading a body edit changes", async () => {
    const { service: current, update } = await fixture();

    const outcome = await update({
      edits: [{ oldText: "## Context", newText: "# Federation fit" }],
    });

    expect(outcome).toMatchObject({ success: true });
    const edited = await stored(current);
    expect(edited.metadata["title"]).toBe("Federation fit");
    expect(file(current, edited).frontmatter).not.toHaveProperty("title");
  });
});
