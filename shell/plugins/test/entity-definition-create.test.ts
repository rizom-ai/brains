import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import type { PublishMediaData } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type AttachmentProvider,
  type EntityCreateContext,
  type EntityDefinition,
  type MediaAttachmentContext,
  type Plugin,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const caller: CreateExecutionContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "tester" },
  userPermissionLevel: "admin",
};
const visitor: CreateExecutionContext = {
  interfaceType: "web-chat",
  actor: { kind: "user", userId: "visitor" },
  userPermissionLevel: "public",
};

const noteMetadata = z.object({ title: z.string(), count: z.number() });

let dataDir = "";

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "entity-create-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<{ harness: Harness; plugins: readonly Plugin[] }> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "notes", entities }),
    {},
    { name: "@fixture/notes", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-create"),
    dataDir,
    domain: "reader.example",
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return { harness, plugins };
}

async function intercept(
  harness: Harness,
  input: CreateInput,
  context: CreateExecutionContext = caller,
): Promise<CreateInterceptionResult> {
  const interceptor = harness
    .getEntityRegistry()
    .getCreateInterceptor(input.entityType);
  if (!interceptor) throw new Error("No create interceptor registered");
  return interceptor(input, context);
}

async function saveUpload(harness: Harness, text: string): Promise<string> {
  const record = await harness
    .getMockShell()
    .getRuntimeUploadRegistry()
    .scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/api/chat/uploads",
    })
    .save({
      filename: "notes.md",
      mediaType: "text/markdown",
      content: Buffer.from(text),
    });
  return record.id;
}

describe("declared create routing", () => {
  const seen: string[] = [];
  const routed = defineEntity({
    type: "memo",
    purpose: "Routes every input shape somewhere.",
    metadata: noteMetadata,
    create: {
      fromPrompt: {
        resolve: async ({ input }) => {
          seen.push(`prompt:${input.prompt ?? ""}`);
          return { refuse: "prompt route" };
        },
      },
      fromContent: {
        resolve: async ({ input }) => {
          seen.push(`content:${input.content ?? ""}`);
          return { refuse: "content route" };
        },
      },
      fromUpload: {
        resolve: async ({ input }) => {
          seen.push(`upload:${input.from?.kind ?? ""}`);
          return { refuse: "upload route" };
        },
      },
      fromAttachment: { reject: "Memos are not rendered from attachments" },
    },
  });

  it("routes by the shape of the create request", async () => {
    seen.length = 0;
    const { harness } = await install([routed]);
    try {
      expect(
        await intercept(harness, { entityType: "memo", prompt: "draft" }),
      ).toEqual({
        kind: "handled",
        result: { success: false, error: "prompt route" },
      });
      await intercept(harness, { entityType: "memo", content: "body" });
      await intercept(harness, {
        entityType: "memo",
        from: { kind: "upload", id: "upload-1" },
      });
      expect(seen).toEqual(["prompt:draft", "content:body", "upload:upload"]);
      expect(
        await intercept(harness, {
          entityType: "memo",
          from: {
            kind: "entity-attachment",
            sourceEntityType: "deck",
            sourceEntityId: "talk",
            attachmentType: "printable",
          },
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: false,
          error: "Memos are not rendered from attachments",
        },
      });
    } finally {
      await harness.reset();
    }
  });

  it("lets an unrouted shape continue to ordinary creation", async () => {
    const promptOnly = defineEntity({
      type: "memo",
      purpose: "Routes prompts only.",
      metadata: noteMetadata,
      create: { fromPrompt: { reject: "No prompts" } },
    });
    const { harness } = await install([promptOnly]);
    try {
      const input = { entityType: "memo", content: "body" };
      expect(await intercept(harness, input)).toEqual({
        kind: "continue",
        input,
      });
    } finally {
      await harness.reset();
    }
  });

  it("registers nothing for a type without create routing", async () => {
    const { harness } = await install([
      defineEntity({
        type: "plain",
        purpose: "Ordinary creation only.",
        metadata: noteMetadata,
      }),
    ]);
    try {
      expect(
        harness.getEntityRegistry().getCreateInterceptor("plain"),
      ).toBeUndefined();
      expect(
        harness.getEntityRegistry().getCreateCheck("plain"),
      ).toBeUndefined();
    } finally {
      await harness.reset();
    }
  });
});

describe("what a create route resolves to", () => {
  // Annotated: its route reads its own type, so the type cannot be inferred
  // from an initializer that refers to it.
  const memo: EntityDefinition<"memo", typeof noteMetadata> = defineEntity({
    type: "memo",
    purpose: "Decides its own creates.",
    metadata: noteMetadata,
    create: {
      fromContent: {
        resolve: async ({ input, entities }) => {
          const title = input.title ?? "untitled";
          if (title === "refused") return { refuse: "Not this one" };
          if (title === "invalid") {
            return {
              create: {
                id: "invalid",
                content: "x",
                // The runtime validates against the type's own schema.
                metadata: { title: "invalid", count: Number.NaN },
              },
            };
          }
          const existing = await entities.get(memo, title);
          if (title.startsWith("reuse")) {
            return {
              existing: { id: title },
              attachment: ({ entityId }) => ({
                mediaType: "text/markdown",
                url: `/memos/${entityId}`,
              }),
            };
          }
          return existing
            ? {
                update: {
                  id: existing.id,
                  content: input.content ?? existing.content,
                  metadata: {
                    title: existing.metadata.title,
                    count: existing.metadata.count + 1,
                  },
                },
              }
            : {
                create: {
                  id: title,
                  content: input.content ?? "",
                  metadata: { title, count: 1 },
                },
                attachment: ({ entityId }) => ({
                  mediaType: "text/markdown",
                  url: `/memos/${entityId}`,
                }),
              };
        },
      },
    },
  });

  it("writes what the route created, with the caller's visibility", async () => {
    const { harness } = await install([memo]);
    try {
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "first",
          content: "Hello",
          visibility: "shared",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: true,
          data: {
            status: "created",
            entityId: "first",
            attachment: { mediaType: "text/markdown", url: "/memos/first" },
          },
        },
      });
      const stored = await harness.getEntityService().getEntity({
        entityType: "memo",
        id: "first",
        visibilityScope: "restricted",
      });
      expect(stored?.visibility).toBe("shared");
      expect(stored?.metadata).toEqual({ title: "first", count: 1 });
    } finally {
      await harness.reset();
    }
  });

  it("updates what the route found, reading at the caller's level", async () => {
    const { harness } = await install([memo]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "kept",
          entityType: "memo",
          content: "Private",
          metadata: { title: "kept", count: 1 },
          visibility: "restricted",
        },
      });
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "kept",
          content: "Again",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: true,
          data: { status: "updated", entityId: "kept" },
        },
      });
      const stored = await harness.getEntityService().getEntity({
        entityType: "memo",
        id: "kept",
        visibilityScope: "restricted",
      });
      expect(stored?.metadata).toEqual({ title: "kept", count: 2 });

      // A public caller cannot see the restricted memo, so its route takes
      // the create path, and the runtime refuses to write over it.
      expect(
        await intercept(
          harness,
          { entityType: "memo", title: "kept", content: "Visitor" },
          visitor,
        ),
      ).toEqual({
        kind: "handled",
        result: { success: false, error: 'A memo "kept" already exists' },
      });
    } finally {
      await harness.reset();
    }
  });

  it("reports an existing entity only when it exists", async () => {
    const { harness } = await install([memo]);
    try {
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "reuse-missing",
          content: "x",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: false,
          error: 'Cannot reuse memo "reuse-missing", which does not exist',
        },
      });
      await harness.getEntityService().createEntity({
        entity: {
          id: "reuse-me",
          entityType: "memo",
          content: "There",
          metadata: { title: "reuse-me", count: 1 },
        },
      });
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "reuse-me",
          content: "x",
        }),
      ).toEqual({
        kind: "handled",
        result: {
          success: true,
          data: {
            status: "existing",
            entityId: "reuse-me",
            attachment: { mediaType: "text/markdown", url: "/memos/reuse-me" },
          },
        },
      });
    } finally {
      await harness.reset();
    }
  });

  it("refuses with the route's message or the schema's", async () => {
    const { harness } = await install([memo]);
    try {
      expect(
        await intercept(harness, {
          entityType: "memo",
          title: "refused",
          content: "x",
        }),
      ).toEqual({
        kind: "handled",
        result: { success: false, error: "Not this one" },
      });
      const invalid = await intercept(harness, {
        entityType: "memo",
        title: "invalid",
        content: "x",
      });
      expect(invalid).toMatchObject({
        kind: "handled",
        result: { success: false },
      });
      expect(
        await harness.getEntityService().getEntity({
          entityType: "memo",
          id: "invalid",
          visibilityScope: "restricted",
        }),
      ).toBeNull();
    } finally {
      await harness.reset();
    }
  });
});

describe("what a create route is given", () => {
  it("hands it a frozen copy of the request, scoped reads and the shared uploads", async () => {
    let given: EntityCreateContext | undefined;
    const memo = defineEntity({
      type: "memo",
      purpose: "Reads the upload it was handed.",
      metadata: noteMetadata,
      create: {
        fromUpload: {
          resolve: async (context) => {
            given = context;
            const from = context.input.from;
            if (from?.kind !== "upload") return { refuse: "No upload" };
            const upload = await context.uploads.read(from.id);
            const record = await context.uploads.readRecord(from.id);
            return {
              create: {
                id: "imported",
                content: upload.content.toString("utf8"),
                metadata: { title: record.filename, count: 1 },
              },
            };
          },
        },
      },
    });
    const { harness } = await install([memo]);
    try {
      const uploadId = await saveUpload(harness, "# Imported");
      const input: CreateInput = {
        entityType: "memo",
        from: { kind: "upload", id: uploadId },
      };
      expect(await intercept(harness, input)).toMatchObject({
        result: { success: true, data: { entityId: "imported" } },
      });
      if (!given) throw new Error("The route was not given a context");
      expect(Object.isFrozen(given)).toBe(true);
      expect(Object.isFrozen(given.input)).toBe(true);
      expect(Object.isFrozen(given.uploads)).toBe(true);
      expect(given.input).not.toBe(input);
      expect(given.input).toEqual(input);
      expect(Object.keys(given).sort()).toEqual([
        "entities",
        "input",
        "uploads",
      ]);
      const stored = await harness.getEntityService().getEntity({
        entityType: "memo",
        id: "imported",
      });
      expect(stored?.content).toContain("# Imported");
      expect(stored?.metadata).toEqual({ title: "notes.md", count: 1 });
    } finally {
      await harness.reset();
    }
  });

  it("claims media types from the upload endpoint through the same route", async () => {
    const memo = defineEntity({
      type: "memo",
      purpose: "Claims markdown uploads.",
      metadata: noteMetadata,
      create: {
        fromUpload: {
          mediaTypes: ["text/markdown", "text/plain"],
          resolve: async ({ input }) =>
            input.from?.kind === "upload"
              ? {
                  create: {
                    id: input.title ?? "upload",
                    content: "imported",
                    metadata: { title: input.title ?? "upload", count: 1 },
                  },
                }
              : { refuse: "No upload" },
        },
      },
    });
    const { harness } = await install([memo]);
    try {
      const registration = harness
        .getEntityRegistry()
        .getUploadSaveHandler("text/markdown");
      expect(registration?.entityType).toBe("memo");
      expect(
        harness.getEntityRegistry().getUploadSaveHandler("image/png"),
      ).toBeUndefined();
      expect(
        await registration?.handler(
          {
            upload: { kind: "upload", id: "upload-1" },
            title: "saved",
            visibility: "public",
          },
          caller,
        ),
      ).toEqual({
        success: true,
        data: { status: "created", entityId: "saved" },
      });
    } finally {
      await harness.reset();
    }
  });
});

describe("declared create checks", () => {
  const memo = defineEntity({
    type: "memo",
    purpose: "Asks before it saves.",
    metadata: noteMetadata,
    create: {
      fromContent: {
        check: async ({ input }) =>
          input.title
            ? { kind: "ready", title: input.title, fields: { count: 1 } }
            : {
                kind: "question",
                asks: "fields",
                question: "What should the memo be called?",
                answerWith: "Pass the answer as title.",
              },
        resolve: async () => ({ refuse: "unused" }),
      },
      fromPrompt: { resolve: async () => ({ refuse: "unused" }) },
      fromAttachment: { reject: "No attachments" },
    },
  });

  it("checks a create before it is confirmed, through the route that will run", async () => {
    const { harness } = await install([memo]);
    try {
      const check = harness.getEntityRegistry().getCreateCheck("memo");
      if (!check) throw new Error("No create check registered");
      expect(await check({ entityType: "memo", content: "x" }, caller)).toEqual(
        {
          kind: "question",
          asks: "fields",
          question: "What should the memo be called?",
          answerWith: "Pass the answer as title.",
        },
      );
      expect(
        await check(
          { entityType: "memo", content: "x", title: "Named" },
          caller,
        ),
      ).toEqual({ kind: "ready", title: "Named", fields: { count: 1 } });
      // A route without a check, or no route at all, is ready to confirm.
      expect(await check({ entityType: "memo", prompt: "x" }, caller)).toEqual({
        kind: "ready",
      });
      expect(await check({ entityType: "memo" }, caller)).toEqual({
        kind: "ready",
      });
      // A rejecting route says so before anyone is asked to confirm.
      expect(
        await check(
          {
            entityType: "memo",
            from: {
              kind: "entity-attachment",
              sourceEntityType: "deck",
              sourceEntityId: "talk",
              attachmentType: "printable",
            },
          },
          caller,
        ),
      ).toEqual({ kind: "error", error: "No attachments" });
    } finally {
      await harness.reset();
    }
  });
});

describe("declared attachments", () => {
  it("builds each provider from a frozen media context and registers it", async () => {
    let given: MediaAttachmentContext | undefined;
    const memo = defineEntity({
      type: "memo",
      purpose: "Renders a printable memo.",
      metadata: noteMetadata,
      attachments: [
        {
          type: "printable",
          provider: (context): AttachmentProvider => {
            given = context;
            return {
              metadata: { outputEntityType: "document" },
              resolve: async ({
                sourceEntityId,
              }): Promise<PublishMediaData | undefined> => {
                const entity = await context.entityService.getEntity({
                  entityType: "memo",
                  id: sourceEntityId,
                });
                return entity
                  ? {
                      type: "document",
                      data: Buffer.from(entity.content),
                      mimeType: "application/pdf",
                      filename: `${entity.id}.pdf`,
                    }
                  : undefined;
              },
            };
          },
        },
      ],
    });
    const { harness, plugins } = await install([memo]);
    try {
      expect(Object.isFrozen(given)).toBe(true);
      expect(Object.keys(given ?? {}).sort()).toEqual([
        "domain",
        "entityService",
        "identity",
        "themeCSS",
        "views",
      ]);
      expect(Object.keys(given?.entityService ?? {}).sort()).toEqual([
        "getEntity",
        "listEntities",
      ]);
      expect(Object.isFrozen(given?.entityService)).toBe(true);
      expect(given?.domain).toBe("reader.example");
      expect(typeof given?.identity.getProfile()).toBe("object");

      await harness.getEntityService().createEntity({
        entity: {
          id: "printed",
          entityType: "memo",
          content: "Print me",
          metadata: { title: "printed", count: 1 },
        },
      });
      const attachments = harness.getMockShell().getAttachmentRegistry();
      expect(attachments.hasProvider("memo", "printable")).toBe(true);
      expect(attachments.getProviderMetadata("memo", "printable")).toEqual({
        outputEntityType: "document",
      });
      expect(
        await attachments.resolve({
          sourceEntityType: "memo",
          sourceEntityId: "printed",
          attachmentType: "printable",
        }),
      ).toMatchObject({ type: "document", filename: "printed.pdf" });

      // A provider reads public records; a request cannot name another scope.
      await harness.getEntityService().createEntity({
        entity: {
          id: "secret",
          entityType: "memo",
          content: "Private",
          metadata: { title: "secret", count: 1 },
          visibility: "restricted",
        },
      });
      const widened = {
        entityType: "memo",
        id: "secret",
        visibilityScope: "restricted",
      };
      expect(await given?.entityService.getEntity(widened)).toBeNull();
      expect(
        (
          await given?.entityService.listEntities({
            entityType: "memo",
            options: { limit: 10 },
          })
        )?.map(({ id }) => id),
      ).toEqual(["printed"]);

      await Promise.all(
        plugins.map(async (plugin): Promise<void> => plugin.shutdown?.()),
      );
      expect(attachments.hasProvider("memo", "printable")).toBe(false);
    } finally {
      await harness.reset();
    }
  });
});
