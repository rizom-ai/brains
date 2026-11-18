import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { ConflictStore } from "../../src/lib/conflict-store";
import { conflictType } from "../conflict-plugins";

const postFrontmatter = z.object({
  title: z.string(),
  status: z.string().optional(),
});

/** A plain text type a conflict can be about: a title, an optional status. */
class PostAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Conflict test target",
      schema: baseEntitySchema,
      frontmatterSchema: postFrontmatter,
    });
  }
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown, metadata: this.parseFrontmatter(markdown) };
  }
}

class ImageAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "image",
      purpose: "Conflict test image",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }
  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }
}

export interface Brain {
  service: EntityService;
  store: ConflictStore;
  clock: { now: Date };
  /** Types whose updates the action policy refuses. */
  locked: Set<string>;
}

export const doc = (title: string, extra = ""): string =>
  `---\ntitle: ${title}\n${extra}---\n\nBody of ${title}\n`;

/** A real entity store holding the conflict type and two types to edit. */
export async function openBrain(dir: string): Promise<Brain> {
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  const conflict = conflictType();
  registry.registerEntityType("conflict", conflict.schema, conflict.adapter);
  const conflictImage = conflictType("conflict-image");
  registry.registerEntityType(
    "conflict-image",
    conflictImage.schema,
    conflictImage.adapter,
    { binaryStorage: "asset" },
  );
  // An image as the brain stores one: nothing but a reference to its bytes.
  registry.registerEntityType("image", baseEntitySchema, new ImageAdapter(), {
    binaryStorage: "asset",
  });
  registry.registerEntityType(
    "post",
    baseEntitySchema,
    new PostAdapter("post"),
    {
      publish: { publishStatuses: ["published"] },
    },
  );
  registry.registerEntityType(
    "site-content",
    baseEntitySchema,
    new PostAdapter("site-content"),
  );
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: createRefusingEmbeddingService(),
  });
  const clock = { now: new Date("2026-11-18T10:20:30.000Z") };
  const locked = new Set<string>();
  return {
    service,
    clock,
    locked,
    store: new ConflictStore({
      reads: service,
      writes: service,
      now: () => clock.now,
      permissions: {
        assertEntityActionAllowed: (entityType, action, context): void => {
          if (locked.has(entityType)) {
            throw new Error(`To ${action} \`${entityType}\` is not allowed.`);
          }
          if (action === "publish" && context.userPermissionLevel !== "admin") {
            throw new Error("Publishing requires admin permission.");
          }
        },
      },
    }),
  };
}

export async function seed(
  brain: Brain,
  entityType: string,
  id: string,
  content: string,
  visibility: "public" | "shared" | "restricted" = "public",
): Promise<BaseEntity> {
  await brain.service.createEntity({
    entity: {
      id,
      entityType,
      content,
      visibility,
      // As the type would read them from the document.
      metadata: Object.fromEntries(
        [...content.matchAll(/^(title|status): (.*)$/gm)].map((match) => [
          match[1] ?? "",
          match[2] ?? "",
        ]),
      ),
    },
  });
  const stored = await brain.service.getEntity({
    entityType,
    id,
    visibilityScope: "restricted",
    source: true,
  });
  if (!stored) throw new Error("Seed failed");
  return stored;
}
