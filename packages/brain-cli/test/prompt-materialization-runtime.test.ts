import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  materializePrompts,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import promptPackage from "@brains/prompt";
import type { Template, TemplateRegistry } from "@brains/templates";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";

/**
 * Prompt copies kept in step with their defaults on the brain's own entity
 * store, with the prompt type as the prompt package declares it: a declared
 * type's ordinary reads carry the body alone, so materialization reads each
 * copy as stored: its frontmatter, authored keys included, is what it
 * compares and writes back.
 */

const services: EntityService[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const service of services.splice(0)) service.close();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

interface StoredPrompt {
  body: string;
  frontmatter: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

async function promptStore(): Promise<{
  service: EntityService;
  stored(id: string): Promise<StoredPrompt>;
}> {
  const temporary = await createTestDirectory();
  cleanups.push(temporary.cleanup);
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${temporary.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const [plugin] = instantiatePluginPackageDefinition(
    promptPackage,
    {},
    { name: "@brains/prompt", version: "0.0.0-test" },
  );
  if (!(plugin instanceof EntityPlugin)) throw new Error("No prompt plugin");
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType(plugin.entityType, plugin.schema, plugin.adapter);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${temporary.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected embedding");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  services.push(service);
  await service.initialize();
  const db = createClient(dbConfig);
  return {
    service,
    // The stored markdown is the file directory-sync exports.
    async stored(id): Promise<StoredPrompt> {
      const result = await db.execute({
        sql: "SELECT content, metadata FROM entities WHERE entityType = 'prompt' AND id = ?",
        args: [id],
      });
      const row = result.rows[0];
      if (!row) throw new Error(`Missing prompt ${id}`);
      const parsed = parseMarkdown(String(row["content"]));
      return {
        body: parsed.content.trim(),
        frontmatter: parsed.frontmatter,
        metadata: z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(String(row["metadata"]))),
      };
    },
  };
}

function templates(
  entries: Array<[key: string, name: string, basePrompt: string]>,
): Pick<TemplateRegistry, "getAll"> {
  const map = new Map<string, Template>(
    entries.map(([key, name, basePrompt]) => [
      key,
      {
        name,
        description: name,
        schema: z.object({}),
        requiredPermission: "public",
        basePrompt,
      },
    ]),
  );
  return { getAll: () => map };
}

async function edit(
  service: EntityService,
  id: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const entity = await service.getEntity({ entityType: "prompt", id });
  if (!entity) throw new Error(`Missing prompt ${id}`);
  const fields = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  await service.updateEntity({
    entity: { ...entity, content: `---\n${fields}\n---\n${body}\n` },
  });
}

describe("prompt materialization on the declared prompt type", () => {
  test("creates a copy stamped with its default's hash", async () => {
    const { service, stored } = await promptStore();

    const report = await materializePrompts(
      templates([["blog:generation", "blog:generation", "Write."]]),
      service,
    );

    expect(report.created).toEqual(["blog:generation"]);
    const copy = await stored("blog-generation");
    expect(copy.body).toBe("Write.");
    expect(copy.frontmatter).toEqual({
      title: "Blog Generation",
      target: "blog:generation",
      defaultHash: expect.any(String),
    });
    expect(copy.metadata["defaultHash"]).toBe(copy.frontmatter["defaultHash"]);
  });

  test("leaves an untouched copy alone while its default is unchanged", async () => {
    const { service } = await promptStore();
    const source = templates([
      ["blog:generation", "blog:generation", "Write."],
    ]);
    await materializePrompts(source, service);

    const report = await materializePrompts(source, service);

    expect(report).toEqual({
      created: [],
      refreshed: [],
      stamped: [],
      retitled: [],
      staleOverrides: [],
      unverifiedOverrides: [],
      removedLegacy: [],
      failed: [],
    });
  });

  test("refreshes an untouched copy when its default changes", async () => {
    const { service, stored } = await promptStore();
    await materializePrompts(
      templates([["blog:generation", "blog:generation", "Old."]]),
      service,
    );
    const before = await stored("blog-generation");

    const report = await materializePrompts(
      templates([["blog:generation", "blog:generation", "New."]]),
      service,
    );

    expect(report.refreshed).toEqual(["blog:generation"]);
    const after = await stored("blog-generation");
    expect(after.body).toBe("New.");
    expect(after.frontmatter["defaultHash"]).not.toBe(
      before.frontmatter["defaultHash"],
    );
    expect(after.metadata["defaultHash"]).toBe(
      after.frontmatter["defaultHash"],
    );
  });

  test("keeps a copy's authored frontmatter when it refreshes the copy", async () => {
    const { service, stored } = await promptStore();
    await materializePrompts(
      templates([["blog:generation", "blog:generation", "Old."]]),
      service,
    );
    const { frontmatter } = await stored("blog-generation");
    await edit(
      service,
      "blog-generation",
      { ...frontmatter, owner: "Ana" },
      "Old.",
    );

    const report = await materializePrompts(
      templates([["blog:generation", "blog:generation", "New."]]),
      service,
    );

    expect(report.refreshed).toEqual(["blog:generation"]);
    const after = await stored("blog-generation");
    expect(after.body).toBe("New.");
    expect(after.frontmatter["owner"]).toBe("Ana");
  });

  test("keeps an edited copy and reports it once its default changes", async () => {
    const { service, stored } = await promptStore();
    await materializePrompts(
      templates([["blog:generation", "blog:generation", "Old."]]),
      service,
    );
    const { frontmatter } = await stored("blog-generation");
    await edit(service, "blog-generation", frontmatter, "Mine.");

    const report = await materializePrompts(
      templates([["blog:generation", "blog:generation", "New."]]),
      service,
    );

    expect(report.staleOverrides).toEqual(["blog:generation"]);
    expect((await stored("blog-generation")).body).toBe("Mine.");
  });

  test("corrects a title still in its old generated form", async () => {
    const { service, stored } = await promptStore();
    const source = templates([
      ["social-media:linkedin", "social-media:linkedin", "Post."],
    ]);
    await materializePrompts(source, service);
    const { frontmatter } = await stored("social-media-linkedin");
    await edit(
      service,
      "social-media-linkedin",
      { ...frontmatter, title: "Social Media Linkedin" },
      "My own post rules.",
    );

    const report = await materializePrompts(source, service);

    expect(report.retitled).toEqual(["social-media:linkedin"]);
    const after = await stored("social-media-linkedin");
    expect(after.frontmatter["title"]).toBe("Social Media LinkedIn");
    expect(after.metadata["title"]).toBe("Social Media LinkedIn");
    expect(after.body).toBe("My own post rules.");
  });

  test("removes a copy materialized under the template's short name", async () => {
    const { service } = await promptStore();
    await service.createEntity({
      entity: {
        id: "about-highlights",
        entityType: "prompt",
        content:
          "---\ntitle: About Highlights\ntarget: about-highlights\n---\nHighlights.\n",
        metadata: { title: "About Highlights", target: "about-highlights" },
      },
    });

    const report = await materializePrompts(
      templates([
        [
          "professional-site:about-highlights",
          "about-highlights",
          "Highlights.",
        ],
      ]),
      service,
    );

    expect(report.removedLegacy).toEqual(["about-highlights"]);
    expect(
      await service.getEntity({ entityType: "prompt", id: "about-highlights" }),
    ).toBeNull();
  });
});
