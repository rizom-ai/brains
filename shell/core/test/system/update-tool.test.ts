import { expectToolError } from "@brains/mcp-service/test";
import { beforeEach, describe, expect, it } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import { updateInputSchema } from "../../src/system/schemas";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import {
  BaseEntityAdapter,
  EntityRegistry,
  baseEntitySchema,
} from "@brains/entity-service";
import {
  AnchorProfileAdapter,
  BrainCharacterAdapter,
} from "@brains/identity-service";
import { PermissionService } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

const confirmationArgsSchema = z.record(z.string(), z.unknown());

const metadataBackedFrontmatterSchema = z.object({
  title: z.string(),
  publishedAt: z.string().datetime().optional(),
});
const metadataBackedEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("metadata-backed-test"),
  metadata: metadataBackedFrontmatterSchema,
});
type MetadataBackedTestEntity = z.infer<typeof metadataBackedEntitySchema>;
type MetadataBackedTestMetadata = z.infer<
  typeof metadataBackedFrontmatterSchema
>;

/** Exercises the production BaseEntityAdapter metadata persistence path. */
class MetadataBackedTestAdapter extends BaseEntityAdapter<
  MetadataBackedTestEntity,
  MetadataBackedTestMetadata,
  MetadataBackedTestMetadata
> {
  constructor() {
    super({
      entityType: "metadata-backed-test",
      purpose: "Test metadata-backed field persistence.",
      schema: metadataBackedEntitySchema,
      frontmatterSchema: metadataBackedFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<MetadataBackedTestEntity> {
    return {
      content: markdown,
      entityType: "metadata-backed-test",
      metadata: this.parseFrontMatter(
        markdown,
        metadataBackedFrontmatterSchema,
      ),
    };
  }
}

class UnprobeableMetadataBackedTestAdapter extends MetadataBackedTestAdapter {
  public override extractMetadata(
    _entity: MetadataBackedTestEntity,
  ): MetadataBackedTestMetadata {
    throw new Error("adapter cannot extract metadata");
  }
}

const sourceOwnedEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("source-owned-test"),
  metadata: z.object({}),
});
type SourceOwnedTestEntity = z.infer<typeof sourceOwnedEntitySchema>;

/** Domain fields live only in Markdown, not schema-admitted root properties. */
class SourceOwnedTestAdapter extends BaseEntityAdapter<
  SourceOwnedTestEntity,
  Record<string, never>,
  { title: string }
> {
  constructor() {
    super({
      entityType: "source-owned-test",
      purpose: "Test source-owned field persistence.",
      schema: sourceOwnedEntitySchema,
      frontmatterSchema: z.object({ title: z.string() }),
      hasBody: false,
    });
  }

  public fromMarkdown(content: string): Partial<SourceOwnedTestEntity> {
    return { entityType: "source-owned-test", content, metadata: {} };
  }

  public override extractMetadata(): Record<string, never> {
    return {};
  }
}

const updateEntityRequestSchema = z.looseObject({
  options: z
    .object({
      eventContext: z
        .object({
          conversationId: z.string().optional(),
          channelId: z.string().optional(),
          runId: z.string().optional(),
          toolCallId: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

describe("system_update tool", () => {
  it("describes id as accepting entity id, slug, or title", () => {
    expect(updateInputSchema.shape.id.description).toContain(
      "Entity ID, slug, or title",
    );
  });

  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      {
        id: "old-agent.io",
        entityType: "agent",
        content:
          "---\nname: Old Agent\nkind: person\nurl: https://old-agent.io/a2a\nstatus: active\ndiscoveredAt: 2026-03-10T10:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-1",
        visibility: "public",
        metadata: {
          name: "Old Agent",
          url: "https://old-agent.io/a2a",
          status: "active",
        },
        created: new Date("2026-03-10T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-10T10:00:00.000Z").toISOString(),
      },
      {
        id: "approved-agent.io",
        entityType: "agent",
        content:
          "---\nname: Approved Agent\nkind: person\nurl: https://approved-agent.io/a2a\nstatus: approved\ndiscoveredAt: 2026-03-11T09:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-approved",
        visibility: "public",
        metadata: {
          name: "Approved Agent",
          url: "https://approved-agent.io/a2a",
          status: "approved",
        },
        created: new Date("2026-03-11T09:00:00.000Z").toISOString(),
        updated: new Date("2026-03-11T09:00:00.000Z").toISOString(),
      },
      {
        id: "pending-agent.io",
        entityType: "agent",
        content:
          "---\nname: Pending Agent\nkind: person\nurl: https://pending-agent.io/a2a\nstatus: discovered\ndiscoveredAt: 2026-03-11T10:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-2",
        visibility: "public",
        metadata: {
          name: "Pending Agent",
          url: "https://pending-agent.io/a2a",
          status: "discovered",
        },
        created: new Date("2026-03-11T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-11T10:00:00.000Z").toISOString(),
      },
      {
        id: "woodchuck-note",
        entityType: "base",
        content: "Woodchucks and woodpeckers are different animals.",
        contentHash: "hash-base-note",
        visibility: "public",
        metadata: { title: "Woodchuck note" },
        created: new Date("2026-03-12T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-12T10:00:00.000Z").toISOString(),
      },
      {
        id: "newsletter-1",
        entityType: "newsletter",
        content:
          "---\nsubject: Notes on Living Systems\nstatus: draft\n---\n\nNewsletter body.",
        contentHash: "hash-4",
        visibility: "public",
        metadata: {
          subject: "Notes on Living Systems",
          status: "draft",
        },
        created: new Date("2026-03-13T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-13T10:00:00.000Z").toISOString(),
      },
      {
        id: "site-info",
        entityType: "site-info",
        content: "---\ntitle: Test Site\n---\n",
        contentHash: "hash-site-info",
        visibility: "public",
        metadata: { title: "Test Site" },
        created: new Date("2026-03-14T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-14T10:00:00.000Z").toISOString(),
      },
      {
        id: "linkedin-update",
        entityType: "social-post",
        content:
          "---\ntitle: LinkedIn Update\nstatus: draft\n---\n\nPost body.",
        contentHash: "hash-social-draft",
        visibility: "public",
        metadata: { title: "LinkedIn Update", status: "draft" },
        created: new Date("2026-03-15T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T10:00:00.000Z").toISOString(),
      },
      {
        id: "workflow-card",
        entityType: "workflow-card",
        content: "---\ntitle: Workflow Card\nstatus: draft\n---\n\nTask body.",
        contentHash: "hash-workflow-draft",
        visibility: "public",
        metadata: { title: "Workflow Card", status: "draft" },
        created: new Date("2026-03-15T11:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T11:00:00.000Z").toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  });

  async function exec(
    input: Record<string, unknown>,
    userPermissionLevel: "admin" | "trusted" | "public" = "admin",
  ): Promise<ToolResponse> {
    const tool = tools.find((t) => t.name === "system_update");
    if (!tool) throw new Error("system_update not found");
    return tool.handler(input, {
      interfaceType: "test",
      actor: { kind: "user", userId: "test" },
      userPermissionLevel,
    });
  }

  function expectConfirmationArgs(
    result: ToolResponse,
  ): Record<string, unknown> {
    if (!("needsConfirmation" in result)) {
      throw new Error(
        `Expected a confirmation response, got: ${JSON.stringify(result)}`,
      );
    }
    return confirmationArgsSchema.parse(result.args);
  }

  /** Propose, then replay the approval args — the flow interfaces drive. */
  async function execConfirmed(
    input: Record<string, unknown>,
    userPermissionLevel: "admin" | "trusted" | "public" = "admin",
  ): Promise<ToolResponse> {
    const confirmation = await exec(input, userPermissionLevel);
    return exec(expectConfirmationArgs(confirmation), userPermissionLevel);
  }

  async function execDelete(
    input: Record<string, unknown>,
    userPermissionLevel: "admin" | "trusted" | "public" = "admin",
  ): Promise<ToolResponse> {
    const tool = tools.find((t) => t.name === "system_delete");
    if (!tool) throw new Error("system_delete not found");
    return tool.handler(input, {
      interfaceType: "test",
      actor: { kind: "user", userId: "test" },
      userPermissionLevel,
    });
  }

  it.each([
    {},
    { fields: { title: "New" } },
    { content: "replacement" },
    { edits: [{ oldText: "Woodchucks", newText: "Groundhogs" }] },
    { operation: { kind: "unknown", fields: {} } },
    { operation: { kind: "fields", fields: {}, content: "replacement" } },
    { operation: { kind: "content", content: "replacement", fields: {} } },
    {
      operation: {
        kind: "edits",
        edits: [{ oldText: "Woodchucks", newText: "Groundhogs" }],
        fields: {},
      },
    },
    {
      operation: { kind: "fields", fields: {} },
      content: "legacy replacement",
    },
  ])(
    "rejects missing, flat, unknown, or mixed update contracts without writing: %j",
    async (input) => {
      expect(
        await exec({ entityType: "base", id: "woodchuck-note", ...input }),
      ).toMatchObject({
        success: false,
        error: expect.stringContaining("Invalid input"),
      });
      expect(services.getLastUpdateRequest()).toBeUndefined();
    },
  );

  it("passes separate conversation, channel, run, and tool call provenance to confirmed entity updates", async () => {
    const tool = tools.find((candidate) => candidate.name === "system_update");
    if (!tool) throw new Error("system_update not found");

    const confirmation = await exec({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "fields", fields: { status: "approved" } },
    });
    const args = expectConfirmationArgs(confirmation);

    const result = await tool.handler(args, {
      interfaceType: "test",
      actor: { kind: "user", userId: "test" },
      conversationId: "conversation-1",
      channelId: "channel-1",
      runId: "run-1",
      toolCallId: "call-1",
      userPermissionLevel: "admin",
    });

    expect("success" in result && result.success).toBe(true);
    const request = updateEntityRequestSchema.parse(
      services.getLastUpdateRequest(),
    );
    expect(request.options?.eventContext).toEqual({
      conversationId: "conversation-1",
      channelId: "channel-1",
      runId: "run-1",
      toolCallId: "call-1",
    });
  });

  it("rejects a confirmed update with no pending approval", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "fields", fields: { status: "approved" } },
      confirmed: true,
      contentHash: "hash-1",
    });

    expect(result).toMatchObject({ success: false });
    expect("error" in result ? result.error : "").toContain(
      "No pending update confirmation",
    );
  });

  it("rejects update confirmation args tampered after approval", async () => {
    const confirmation = await exec({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "fields", fields: { status: "approved" } },
    });
    const args = expectConfirmationArgs(confirmation);

    const result = await exec({
      ...args,
      operation: { kind: "fields", fields: { status: "retired" } },
    });

    expect(result).toMatchObject({ success: false });
    expect("error" in result ? result.error : "").toContain(
      "do not match the pending approval",
    );
  });

  it("uses non-title metadata as the display label in update confirmations", async () => {
    const result = await exec({
      entityType: "newsletter",
      id: "newsletter-1",
      operation: { kind: "fields", fields: { status: "queued" } },
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_update",
      summary: expect.stringContaining('Update "Notes on Living Systems"?'),
      completionSummary: "Updated newsletter.",
    });
  });

  it("uses note as the completion label for base entity updates", async () => {
    const result = await exec({
      entityType: "base",
      id: "woodchuck-note",
      operation: {
        kind: "content",
        content:
          "Woodchucks and woodpeckers are different animals. The distinction is useful.",
      },
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_update",
      summary: expect.stringContaining('Update "Woodchuck note"?'),
      completionSummary: "Updated note.",
    });
  });

  it("uses non-title metadata as the display label in delete confirmations", async () => {
    const result = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_delete",
      summary: expect.stringContaining('Delete "Notes on Living Systems"?'),
    });
  });

  it("rejects delete for an unregistered entity type without leaking registry internals", async () => {
    const result = await execDelete({
      entityType: "blog-post",
      id: "queens-are-not-invincible",
    });

    expect(result).toMatchObject({ success: false });
    const error = expectToolError(result).error;
    expect(error).toContain(
      'Entity type "blog-post" is not available in this brain.',
    );
    // The internal registry string must never reach the operator.
    expect(error).not.toContain("No adapter registered");
  });

  it("does not delete when confirmed is passed without a pending confirmation token", async () => {
    const result = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
      confirmed: true,
    });

    // A confirmed call with no matching pending approval is rejected outright
    // (consistent with system_create), and nothing is
    // deleted.
    expect(result).toMatchObject({ success: false });
    expect(expectToolError(result).error).toContain(
      "No pending delete confirmation",
    );
    expect(services.getEntities().get("newsletter-1")).toBeDefined();
  });

  it("deletes after the pending confirmation args are submitted", async () => {
    const confirmation = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
    });

    const result = await execDelete(expectConfirmationArgs(confirmation));

    expect(result).toMatchObject({
      success: true,
      data: { deleted: "newsletter-1" },
    });
    expect(services.getEntities().get("newsletter-1")).toBeUndefined();
  });

  it("refuses to delete singleton records even when confirmed", async () => {
    const result = await execDelete({
      entityType: "site-info",
      id: "site-info",
      confirmed: true,
    });

    expect(result).toMatchObject({
      success: false,
      error:
        "site-info is a singleton entity and cannot be deleted through system tools. Update it instead.",
    });
    expect(services.getEntities().get("site-info")).toBeDefined();
  });

  describe("exact-match content edits", () => {
    function seedContent(content: string): void {
      const original = expectDefined(
        services.getEntities().get("woodchuck-note"),
        "original note",
      );
      services.addEntities([{ ...original, content }]);
    }

    it("proposes a small patch without writing or returning the full note in approval args", async () => {
      const original =
        "# Plan\nReview: monthly.\n" +
        "Hard break\\\nLiteral pair\\\\\n".repeat(700);
      seedContent(original);
      const edits = [
        { oldText: "Review: monthly.", newText: "Review: weekly." },
      ];
      const proposal = await exec({
        entityType: "base",
        id: "woodchuck-note",
        operation: { kind: "edits", edits },
      });
      expect(proposal).toMatchObject({
        needsConfirmation: true,
        preview: "- Review: monthly.\n+ Review: weekly.",
      });
      const args = expectConfirmationArgs(proposal);
      expect(args["operation"]).toEqual({ kind: "edits", edits });
      expect(args).not.toHaveProperty("content");
      expect(args["operation"]).not.toHaveProperty("content");
      expect(services.getLastUpdateRequest()).toBeUndefined();
      expect(services.getEntities().get("woodchuck-note")?.content).toBe(
        original,
      );
      expect(await exec(args)).toMatchObject({ success: true });
      expect(services.getLastUpdateRequest()?.entity.content).toBe(
        original.replace("monthly", "weekly"),
      );
      expect(services.getLastUpdateRequest()).toMatchObject({
        options: { expectedContentHash: "hash-base-note" },
      });
      expect(await exec(args)).toMatchObject({ success: false });
    });

    it("applies edits against the original text, not the output of previous edits", async () => {
      seedContent("First: alpha\r\nSecond: beta\r\nUnchanged: \\ $& 🦊\r\n");
      const result = await execConfirmed({
        entityType: "base",
        id: "woodchuck-note",
        operation: {
          kind: "edits",
          edits: [
            { oldText: "alpha", newText: "beta" },
            { oldText: "beta", newText: "$&\\gamma" },
          ],
        },
      });
      expect(result).toMatchObject({ success: true });
      expect(services.getLastUpdateRequest()?.entity.content).toBe(
        "First: beta\r\nSecond: $&\\gamma\r\nUnchanged: \\ $& 🦊\r\n",
      );
    });

    it("supports exact deletion", async () => {
      seedContent("First\nRemove me\nLast");
      expect(
        await execConfirmed({
          entityType: "base",
          id: "woodchuck-note",
          operation: {
            kind: "edits",
            edits: [{ oldText: "Remove me\n", newText: "" }],
          },
        }),
      ).toMatchObject({ success: true });
      expect(services.getLastUpdateRequest()?.entity.content).toBe(
        "First\nLast",
      );
    });

    it.each([
      {
        content: "alpha beta",
        edits: [{ oldText: "missing", newText: "new" }],
      },
      { content: "alpha alpha", edits: [{ oldText: "alpha", newText: "new" }] },
      { content: "aaa", edits: [{ oldText: "aa", newText: "new" }] },
      {
        content: "alpha beta",
        edits: [
          { oldText: "alpha", newText: "new" },
          { oldText: "pha beta", newText: "other" },
        ],
      },
      {
        content: "alpha beta",
        edits: [
          { oldText: "alpha", newText: "new" },
          { oldText: "missing", newText: "other" },
        ],
      },
      { content: "alpha", edits: [{ oldText: "", newText: "new" }] },
      { content: "alpha", edits: [] },
    ])(
      "rejects ambiguous, missing, overlapping, or empty edits atomically: %j",
      async ({ content, edits }) => {
        seedContent(content);
        expect(
          await exec({
            entityType: "base",
            id: "woodchuck-note",
            operation: { kind: "edits", edits },
          }),
        ).toMatchObject({ success: false });
        expect(services.getLastUpdateRequest()).toBeUndefined();
        expect(services.getEntities().get("woodchuck-note")?.content).toBe(
          content,
        );
      },
    );

    it.each([
      { content: "replacement" },
      { content: "" },
      { fields: { title: "new" } },
      { fields: {} },
    ])("rejects edits mixed with another update mode: %j", async (other) => {
      seedContent("alpha");
      expect(
        await exec({
          entityType: "base",
          id: "woodchuck-note",
          operation: {
            kind: "edits",
            edits: [{ oldText: "alpha", newText: "beta" }],
            ...other,
          },
        }),
      ).toMatchObject({ success: false });
      expect(services.getLastUpdateRequest()).toBeUndefined();
    });

    it("rejects changes to approved edits", async () => {
      seedContent("alpha");
      const args = expectConfirmationArgs(
        await exec({
          entityType: "base",
          id: "woodchuck-note",
          operation: {
            kind: "edits",
            edits: [{ oldText: "alpha", newText: "beta" }],
          },
        }),
      );
      expect(
        await exec({
          ...args,
          operation: {
            kind: "edits",
            edits: [{ oldText: "alpha", newText: "tampered" }],
          },
        }),
      ).toMatchObject({ success: false });
      expect(services.getLastUpdateRequest()).toBeUndefined();
    });

    it("rejects a stale approval even when the exact target still exists", async () => {
      seedContent("alpha");
      const args = expectConfirmationArgs(
        await exec({
          entityType: "base",
          id: "woodchuck-note",
          operation: {
            kind: "edits",
            edits: [{ oldText: "alpha", newText: "beta" }],
          },
        }),
      );
      const entity = expectDefined(
        services.getEntities().get("woodchuck-note"),
        "note",
      );
      services.addEntities([
        {
          ...entity,
          content: "alpha\nConcurrent change",
          contentHash: "new-hash",
        },
      ]);
      expect(await exec(args)).toMatchObject({
        success: false,
        error: expect.stringContaining("modified since"),
      });
      expect(services.getLastUpdateRequest()).toBeUndefined();
    });

    it("reports a conflict rather than success if storage rejects a concurrent write", async () => {
      seedContent("alpha");
      const args = expectConfirmationArgs(
        await exec({
          entityType: "base",
          id: "woodchuck-note",
          operation: {
            kind: "edits",
            edits: [{ oldText: "alpha", newText: "beta" }],
          },
        }),
      );
      services.entityService.updateEntity = async (): ReturnType<
        typeof services.entityService.updateEntity
      > => ({
        entityId: "woodchuck-note",
        jobId: "",
        skipped: true,
        skipReason: "content-conflict",
      });
      expect(await exec(args)).toMatchObject({
        success: false,
        error: expect.stringContaining("modified"),
      });
    });

    it("does not allow patches to bypass publish permissions", async () => {
      services.permissionService = new PermissionService({
        entityActions: {
          "social-post": { update: "trusted", publish: "admin" },
        },
      });
      expect(
        await exec(
          {
            entityType: "social-post",
            id: "linkedin-update",
            operation: {
              kind: "edits",
              edits: [
                { oldText: "status: draft", newText: "status: published" },
              ],
            },
          },
          "trusted",
        ),
      ).toMatchObject({ success: false });
      expect(services.getLastUpdateRequest()).toBeUndefined();
    });
  });

  describe("long-note update regressions", () => {
    it.each([
      { fields: { title: "New title" }, content: "Replacement body" },
      { fields: { title: "New title" }, content: "" },
      { fields: {}, content: "Replacement body" },
      { fields: { title: "New title" }, content: '{"status":"draft"}' },
    ])(
      "rejects mixed fields/content instead of silently dropping content: %j",
      async (input) => {
        const original = expectDefined(
          services.getEntities().get("woodchuck-note"),
          "original note",
        );
        const result = await exec({
          entityType: "base",
          id: original.id,
          operation: { kind: "fields", ...input },
        });

        expect(result).toMatchObject({
          success: false,
          error: expect.stringContaining("Invalid input"),
        });
        expect(services.getLastUpdateRequest()).toBeUndefined();
        expect(services.getEntities().get(original.id)).toEqual(original);
      },
    );

    it.each([7_000, 14_000, 17_000])(
      "preserves backslashes and untouched markdown through approval of a %i-byte note",
      async (size) => {
        // Include Markdown hard breaks, literal double backslashes, and code.
        const sample =
          "Hard break\\\nNext line\nLiteral pair\\\\\n```text\nC:\\notes\\file\n```\n";
        const originalContent = sample
          .repeat(Math.ceil(size / sample.length))
          .slice(0, size);
        const original = expectDefined(
          services.getEntities().get("woodchuck-note"),
          "original note",
        );
        services.addEntities([{ ...original, content: originalContent }]);
        const replacement = originalContent.replace(
          "Next line",
          "Updated line",
        );

        const proposal = await exec({
          entityType: "base",
          id: original.id,
          operation: { kind: "content", content: replacement },
        });
        const args = expectConfirmationArgs(proposal);
        expect(args["operation"]).toEqual({
          kind: "content",
          content: replacement,
        });
        expect(services.getLastUpdateRequest()).toBeUndefined();
        expect(services.getEntities().get(original.id)?.content).toBe(
          originalContent,
        );

        // Exercise the JSON boundary used when transporting confirmation args.
        const result = await exec(
          confirmationArgsSchema.parse(JSON.parse(JSON.stringify(args))),
        );
        expect(result).toMatchObject({ success: true });
        expect(services.getLastUpdateRequest()?.entity.content).toBe(
          replacement,
        );
        expect(services.getEntities().get(original.id)?.content).toBe(
          replacement,
        );
      },
    );

    it.each([
      {
        before: "First\nSecond\nThird",
        after: "First\nInserted\nSecond\nThird",
        preview: "+ Inserted",
      },
      {
        before: "First\nRemoved\nSecond\nThird",
        after: "First\nSecond\nThird",
        preview: "- Removed",
      },
      { before: "First\nSecond", after: "First\n\nSecond", preview: "+ " },
    ])(
      "shows only changed lines, not a shifted suffix: %j",
      async ({ before, after, preview }) => {
        const original = expectDefined(
          services.getEntities().get("woodchuck-note"),
          "original note",
        );
        services.addEntities([{ ...original, content: before }]);
        const result = await exec({
          entityType: "base",
          id: original.id,
          operation: { kind: "content", content: after },
        });

        expect(result).toMatchObject({ needsConfirmation: true, preview });
        expect(services.getLastUpdateRequest()).toBeUndefined();
      },
    );

    it("does not render an unchanged 17 KB suffix as replacements after a one-line insertion", async () => {
      const suffix = Array.from(
        { length: 500 },
        (_, index) => `Unchanged line ${index}: reference material.`,
      ).join("\n");
      expect(Buffer.byteLength(suffix)).toBeGreaterThan(17_000);
      const original = expectDefined(
        services.getEntities().get("woodchuck-note"),
        "original note",
      );
      services.addEntities([{ ...original, content: `# Note\n${suffix}` }]);
      const result = await exec({
        entityType: "base",
        id: original.id,
        operation: {
          kind: "content",
          content: `# Note\nOne inserted line\n${suffix}`,
        },
      });

      expect(result).toMatchObject({
        needsConfirmation: true,
        preview: "+ One inserted line",
      });
      expect(services.getLastUpdateRequest()).toBeUndefined();
    });
  });

  it("keeps JSON-wrapped fields literal inside a content operation", async () => {
    const content = JSON.stringify({ fields: { status: "archived" } });
    expect(
      await execConfirmed({
        entityType: "base",
        id: "woodchuck-note",
        operation: { kind: "content", content },
      }),
    ).toMatchObject({ success: true });
    const updated = expectDefined(services.getEntities().get("woodchuck-note"));
    expect(updated.content).toBe(content);
    expect(updated.metadata["status"]).toBeUndefined();
  });

  it("updates visibility as a top-level field and normalizes private", async () => {
    const result = await execConfirmed({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "fields", fields: { visibility: "private" } },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = expectDefined(
      services.getEntities().get("old-agent.io"),

      "updated entity",
    );
    expect(updated.visibility).toBe("restricted");
    expect(updated.metadata).not.toHaveProperty("visibility");
  });

  it("removes optional metadata fields when a field update sets them to null", async () => {
    services.addEntities([
      {
        id: "resilience-in-distributed-systems",
        entityType: "post",
        content:
          "---\ntitle: Resilience Is Not Redundancy\nslug: resilience-in-distributed-systems\nstatus: published\npublishedAt: '2025-08-15T00:00:00.000Z'\n---\n\nPost body.",
        contentHash: "hash-post-published",
        visibility: "public",
        metadata: {
          title: "Resilience Is Not Redundancy",
          slug: "resilience-in-distributed-systems",
          status: "published",
          publishedAt: "2025-08-15T00:00:00.000Z",
        },
        created: new Date("2026-03-16T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-16T10:00:00.000Z").toISOString(),
      },
    ]);

    const originalUpdateEntity = services.entityService.updateEntity.bind(
      services.entityService,
    );
    const postUpdateSchema = z
      .object({
        metadata: z
          .object({
            publishedAt: z.string().datetime().optional(),
          })
          .passthrough(),
      })
      .passthrough();
    services.entityService.updateEntity = async (
      request,
    ): ReturnType<typeof originalUpdateEntity> => {
      if (request.entity.entityType === "post") {
        postUpdateSchema.parse(request.entity);
      }
      return originalUpdateEntity(request);
    };

    const result = await execConfirmed({
      entityType: "post",
      id: "resilience-in-distributed-systems",
      operation: {
        kind: "fields",
        fields: { status: "draft", publishedAt: null },
      },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "resilience-in-distributed-systems" },
    });

    const updated = expectDefined(
      services.getEntities().get("resilience-in-distributed-systems"),
      "updated entity",
    );
    expect(updated.metadata["status"]).toBe("draft");
    expect(updated.metadata).not.toHaveProperty("publishedAt");

    const updateRequest = services.getLastUpdateRequest();
    if (!updateRequest) throw new Error("Expected an update to be recorded");
    expect(
      z.looseObject({ status: z.string() }).parse(updateRequest.entity).status,
    ).toBe("draft");
    expect(updateRequest.entity).not.toHaveProperty("publishedAt");
  });

  it("rejects coverImageId field updates for entity types without cover support", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "fields", fields: { coverImageId: "hero-banner" } },
    });

    expect(result).toMatchObject({
      success: false,
      error: "Entity type 'agent' doesn't support cover images",
    });
  });

  it("rejects placeholder coverImageId updates before confirmation", async () => {
    const result = await exec({
      entityType: "social-post",
      id: "linkedin-update",
      operation: { kind: "fields", fields: { coverImageId: "__PENDING__" } },
    });

    expect(result).toMatchObject({
      success: false,
      error: "coverImageId must reference an existing image id or be null",
    });
  });

  it("rejects upload refs as coverImageId updates before confirmation", async () => {
    const result = await exec({
      entityType: "social-post",
      id: "linkedin-update",
      operation: {
        kind: "fields",
        fields: {
          coverImageId: "upload-00000000-0000-4000-8000-000000000912",
        },
      },
    });

    expect(result).toMatchObject({
      success: false,
      error: "coverImageId must reference an existing image id or be null",
    });
  });

  it("writes coverImageId field updates to frontmatter for entity types with cover support", async () => {
    const result = await execConfirmed({
      entityType: "social-post",
      id: "linkedin-update",
      operation: { kind: "fields", fields: { coverImageId: "hero-banner" } },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "linkedin-update" },
    });
    const updated = expectDefined(
      services.getEntities().get("linkedin-update"),
      "updated entity",
    );
    expect(updated.content).toContain("coverImageId: hero-banner");
    expect(updated.metadata).not.toHaveProperty("coverImageId");
  });

  it("writes ogImageId field updates to frontmatter", async () => {
    const result = await execConfirmed({
      entityType: "social-post",
      id: "linkedin-update",
      operation: { kind: "fields", fields: { ogImageId: "social-card" } },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "linkedin-update" },
    });
    const updated = expectDefined(
      services.getEntities().get("linkedin-update"),
      "updated entity",
    );
    expect(updated.content).toContain("ogImageId: social-card");
    expect(updated.metadata).not.toHaveProperty("ogImageId");
  });

  it("clears coverImageId through system_update fields", async () => {
    services.addEntities([
      {
        id: "covered-post",
        entityType: "social-post",
        content:
          "---\ntitle: Covered Post\nstatus: draft\ncoverImageId: hero-banner\n---\n\nPost body.",
        contentHash: "hash-covered",
        visibility: "public",
        metadata: { title: "Covered Post", status: "draft" },
        created: new Date("2026-03-15T12:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T12:00:00.000Z").toISOString(),
      },
    ]);

    const result = await execConfirmed({
      entityType: "social-post",
      id: "covered-post",
      operation: { kind: "fields", fields: { coverImageId: null } },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "covered-post" },
    });
    expect(services.getEntities().get("covered-post")?.content).not.toContain(
      "coverImageId",
    );
  });

  it("re-parses visibility from frontmatter on full content replacement", async () => {
    const newMarkdown =
      "---\nname: Old Agent\nkind: person\nurl: https://old-agent.io/a2a\nstatus: active\ndiscoveredAt: 2026-03-10T10:00:00.000Z\ndiscoveredVia: manual\nvisibility: private\n---\n";

    const result = await execConfirmed({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "content", content: newMarkdown },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = expectDefined(
      services.getEntities().get("old-agent.io"),

      "updated entity",
    );
    expect(updated.visibility).toBe("restricted");
  });

  // Previously this cleared the entity back to public. That treated "the file
  // omits the key" as an explicit reset, but export never writes
  // `visibility: public` — omission is the ordinary shape of content, not a
  // demotion request, so the old behaviour silently published restricted
  // entities on any content replacement. Demoting now requires an explicit
  // `visibility: public` (covered in write-tools-visibility.test.ts).
  it("keeps non-default visibility when replacement markdown omits the field", async () => {
    // Seed agent as restricted, then replace with markdown that has no visibility key.
    const restricted = services.getEntities().get("old-agent.io");
    if (restricted) {
      services.getEntities().set("old-agent.io", {
        ...restricted,
        visibility: "restricted",
      });
    }

    const newMarkdown =
      "---\nname: Old Agent\nkind: person\nurl: https://old-agent.io/a2a\nstatus: active\ndiscoveredAt: 2026-03-10T10:00:00.000Z\ndiscoveredVia: manual\n---\n";

    const result = await execConfirmed({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "content", content: newMarkdown },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = expectDefined(
      services.getEntities().get("old-agent.io"),

      "updated entity",
    );
    expect(updated.visibility).toBe("restricted");
  });

  it("keeps plain JSON content literal rather than interpreting fields", async () => {
    const content = JSON.stringify({ status: "archived" });
    expect(
      await execConfirmed({
        entityType: "base",
        id: "woodchuck-note",
        operation: { kind: "content", content },
      }),
    ).toMatchObject({ success: true });
    const updated = expectDefined(services.getEntities().get("woodchuck-note"));
    expect(updated.content).toBe(content);
    expect(updated.metadata["status"]).toBeUndefined();
  });

  async function proposeAgentApproval(
    id: string,
  ): Promise<Record<string, unknown>> {
    return expectConfirmationArgs(
      await exec({
        entityType: "agent",
        id,
        operation: { kind: "fields", fields: { status: "approved" } },
      }),
    );
  }

  it.each([undefined, { kind: "content", content: " " }])(
    "rejects omitted or blank operations rather than repairing an approval (%p)",
    async (operation) => {
      const args = await proposeAgentApproval("pending-agent.io");
      const { operation: _operation, ...withoutOperation } = args;
      expect(
        await exec({
          ...withoutOperation,
          ...(operation ? { operation } : {}),
        }),
      ).toMatchObject({ success: false });
      expect(services.getLastUpdateRequest()).toBeUndefined();
      expect(
        services.getEntities().get("pending-agent.io")?.metadata["status"],
      ).toBe("discovered");
      // A malformed replay did not execute or consume the exact valid approval.
      expect(await exec(args)).toMatchObject({ success: true });
      expect(
        services.getEntities().get("pending-agent.io")?.metadata["status"],
      ).toBe("approved");
    },
  );

  it("replays an approved note field operation exactly", async () => {
    const args = expectConfirmationArgs(
      await exec({
        entityType: "base",
        id: "woodchuck-note",
        operation: { kind: "fields", fields: { title: "New title" } },
      }),
    );
    expect(await exec(args)).toMatchObject({ success: true });
    expect(
      services.getEntities().get("woodchuck-note")?.metadata["title"],
    ).toBe("New title");
  });

  it.each([
    { kind: "content", content: "A complete replacement." },
    {
      kind: "edits",
      edits: [{ oldText: "Woodchucks", newText: "Groundhogs" }],
    },
  ])(
    "replays stored content operations exactly once (%p)",
    async (operation) => {
      const args = expectConfirmationArgs(
        await exec({ entityType: "base", id: "woodchuck-note", operation }),
      );
      const replay = confirmationArgsSchema.parse(
        JSON.parse(JSON.stringify(args)),
      );
      expect(await exec(replay)).toMatchObject({ success: true });
      expect(services.getEntities().get("woodchuck-note")?.content).toBe(
        operation.content ??
          "Groundhogs and woodpeckers are different animals.",
      );
      expect(await exec(replay)).toMatchObject({ success: false });
    },
  );

  it("rejects approval for another type with the same id", async () => {
    const args = await proposeAgentApproval("pending-agent.io");
    const entity = expectDefined(
      services.getEntities().get("pending-agent.io"),
    );
    services.addEntities([{ ...entity, entityType: "note" }]);
    expect(await exec({ ...args, entityType: "note" })).toMatchObject({
      success: false,
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("rejects an approved field operation when its reviewed hash is stale", async () => {
    const args = await proposeAgentApproval("pending-agent.io");
    const entity = expectDefined(
      services.getEntities().get("pending-agent.io"),
    );
    services.addEntities([{ ...entity, contentHash: "changed" }]);
    expect(await exec(args)).toMatchObject({
      success: false,
      error: expect.stringContaining("modified since"),
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("keeps an already-approved agent unchanged through an exact valid replay", async () => {
    const args = await proposeAgentApproval("approved-agent.io");
    expect(await exec(args)).toMatchObject({ success: true });
    expect(
      services.getEntities().get("approved-agent.io")?.metadata["status"],
    ).toBe("approved");
  });

  it("rejects a fabricated approval with no pending proposal", async () => {
    expect(
      await exec({
        entityType: "agent",
        id: "pending-agent.io",
        operation: { kind: "fields", fields: { status: "approved" } },
        confirmed: true,
      }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("No pending update confirmation"),
    });
    expect(
      services.getEntities().get("pending-agent.io")?.metadata["status"],
    ).toBe("discovered");
  });

  it("rejects an approval replayed against another entity", async () => {
    const args = await proposeAgentApproval("approved-agent.io");
    expect(
      await exec({ ...args, id: "pending-agent.io", contentHash: "hash-2" }),
    ).toMatchObject({ success: false });
    expect(
      services.getEntities().get("pending-agent.io")?.metadata["status"],
    ).toBe("discovered");
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("rejects trusted updates when entity action policy requires Admin", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        agent: { update: "admin" },
      },
    });

    const result = await exec(
      {
        entityType: "agent",
        id: "old-agent.io",
        operation: { kind: "fields", fields: { status: "archived" } },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Updating `agent` requires Admin permission; your current permission is Trusted.",
    });
  });

  // Locks the policy check above the confirmation branch: if a future refactor
  // hoisted `confirmed: true` ahead of checkEntityActionPermission, this would catch it.
  it("rejects trusted updates with confirmed: true when policy requires Admin", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        agent: { update: "admin" },
      },
    });

    const result = await exec(
      {
        entityType: "agent",
        id: "old-agent.io",
        operation: { kind: "fields", fields: { status: "archived" } },
        confirmed: true,
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Updating `agent` requires Admin permission; your current permission is Trusted.",
    });

    const unchanged = expectDefined(
      services.getEntities().get("old-agent.io"),

      "unchanged entity",
    );
    expect(unchanged.metadata["status"]).toBe("active");
  });

  it("requires publish permission when a publish-aware status enters the publish set", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "admin" },
      },
    });

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        operation: { kind: "fields", fields: { status: "queued" } },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Admin permission; your current permission is Trusted.",
    });
  });

  it("requires publish permission when a publish-aware status stays in the publish set", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "admin" },
      },
    });
    const existing = services.getEntities().get("linkedin-update");
    if (existing) {
      services.getEntities().set("linkedin-update", {
        ...existing,
        metadata: { ...existing.metadata, status: "queued" },
      });
    }

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        operation: { kind: "fields", fields: { status: "failed" } },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Admin permission; your current permission is Trusted.",
    });
  });

  it("requires publish permission for manual failed retry", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "admin" },
      },
    });
    const existing = services.getEntities().get("linkedin-update");
    if (existing) {
      services.getEntities().set("linkedin-update", {
        ...existing,
        metadata: { ...existing.metadata, status: "failed" },
      });
    }

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        operation: { kind: "fields", fields: { status: "queued" } },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Admin permission; your current permission is Trusted.",
    });
  });

  it("does not require publish permission for matching status names on non-publish-aware entity types", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "workflow-card": { update: "trusted", publish: "admin" },
      },
    });

    const result = await exec(
      {
        entityType: "workflow-card",
        id: "workflow-card",
        operation: { kind: "fields", fields: { status: "queued" } },
      },
      "trusted",
    );

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_update",
    });
  });

  it("requires publish permission for full content replacements entering the publish set", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "admin" },
      },
    });

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        operation: {
          kind: "content",
          content:
            "---\ntitle: LinkedIn Update\nstatus: queued\n---\n\nPost body.",
        },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Admin permission; your current permission is Trusted.",
    });
  });

  it("rejects trusted deletes when entity action policy requires Admin", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "*": { delete: "admin" },
      },
    });

    const result = await execDelete(
      {
        entityType: "newsletter",
        id: "newsletter-1",
        confirmed: true,
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Deleting `newsletter` requires Admin permission; your current permission is Trusted.",
    });
  });

  it("rejects deletes marked never even for Admin callers", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        newsletter: { delete: "never" },
      },
    });

    const result = await execDelete(
      {
        entityType: "newsletter",
        id: "newsletter-1",
        confirmed: true,
      },
      "admin",
    );

    expect(result).toEqual({
      success: false,
      error: "Deleting `newsletter` is not allowed through system tools.",
    });
    expect(services.getEntities().has("newsletter-1")).toBe(true);
  });

  function useBrainCharacterAdapter(): void {
    const adapter = new BrainCharacterAdapter();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType("brain-character", adapter.schema, adapter);
    services.entityRegistry = registry;
    services.addEntities([
      {
        id: "brain-character",
        entityType: "brain-character",
        content: adapter.createCharacterContent({
          name: "Research Brain",
          role: "Assistant",
          purpose: "Organize research",
          values: ["Curiosity"],
        }),
        contentHash: "hash-brain-character",
        visibility: "public",
        metadata: { role: "Assistant", values: ["Curiosity"] },
        created: new Date("2026-03-16T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-16T10:00:00.000Z").toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  }

  function useMetadataBackedAdapter(
    adapter: MetadataBackedTestAdapter = new MetadataBackedTestAdapter(),
  ): void {
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(
      "metadata-backed-test",
      adapter.schema,
      adapter,
    );
    services.entityRegistry = registry;
    services.addEntities([
      {
        id: "metadata-backed-1",
        entityType: "metadata-backed-test",
        content:
          "---\ntitle: Original title\npublishedAt: '2026-03-01T00:00:00.000Z'\n---\n\nBody.",
        contentHash: "hash-metadata-backed",
        visibility: "public",
        metadata: {
          title: "Original title",
          publishedAt: "2026-03-01T00:00:00.000Z",
        },
        created: new Date("2026-03-16T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-16T10:00:00.000Z").toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  }

  function useAnchorProfileAdapter(): void {
    const adapter = new AnchorProfileAdapter();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(adapter.entityType, adapter.schema, adapter);
    services.entityRegistry = registry;
    services.addEntities([
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: "---\nname: Alex Chen\nkind: person\nrole: architect\n---\n",
        contentHash: "anchor-hash",
        visibility: "public",
        metadata: { name: "Alex Chen" },
        created: "2026-03-16T10:00:00.000Z",
        updated: "2026-03-16T10:00:00.000Z",
      },
    ]);
    tools = createSystemTools(services);
  }

  it("rejects anchor profile name changes through the real persistence probe", async () => {
    useAnchorProfileAdapter();
    const result = await exec({
      entityType: "anchor-profile",
      id: "anchor-profile",
      operation: { kind: "fields", fields: { name: "Research partner" } },
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("does not persist name through 'fields'"),
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("allows persisted anchor profile visibility changes", async () => {
    useAnchorProfileAdapter();
    const proposal = await exec({
      entityType: "anchor-profile",
      id: "anchor-profile",
      operation: { kind: "fields", fields: { visibility: "shared" } },
    });
    const result = await exec(expectConfirmationArgs(proposal));
    expect(result).toMatchObject({ success: true });
    expect(services.getEntities().get("anchor-profile")?.visibility).toBe(
      "shared",
    );
  });

  it("rejects values a real body-backed adapter would retain from content", async () => {
    useBrainCharacterAdapter();

    const result = await exec({
      entityType: "brain-character",
      id: "brain-character",
      operation: {
        kind: "fields",
        fields: {
          role: "Research partner",
          purpose: "Accelerate research",
        },
      },
    });

    expect(result).toEqual({
      success: false,
      error:
        "brain-character does not persist role, purpose through 'fields'. " +
        "The update would report success without changing anything. " +
        "Provide full markdown with frontmatter via 'content' instead.",
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("rejects a field that only survives until entity-schema validation", async () => {
    const adapter = new SourceOwnedTestAdapter();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(adapter.entityType, adapter.schema, adapter);
    services.entityRegistry = registry;
    services.addEntities([
      {
        id: "source-owned",
        entityType: adapter.entityType,
        content: "---\ntitle: Original\n---\n",
        contentHash: "hash-source-owned",
        visibility: "shared",
        metadata: {},
        created: "2026-09-25T10:00:00.000Z",
        updated: "2026-09-25T10:00:00.000Z",
      },
    ]);
    tools = createSystemTools(services);

    const result = await exec({
      entityType: adapter.entityType,
      id: "source-owned",
      operation: { kind: "fields", fields: { title: "Changed" } },
    });

    expect(result).toEqual({
      success: false,
      error:
        "source-owned-test does not persist title through 'fields'. " +
        "The update would report success without changing anything. " +
        "Provide full markdown with frontmatter via 'content' instead.",
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("refreshes metadata derived from replacement content instead of persisting the previous title", async () => {
    useMetadataBackedAdapter();
    expect(
      await execConfirmed({
        entityType: "metadata-backed-test",
        id: "metadata-backed-1",
        operation: {
          kind: "content",
          content: "---\ntitle: New title\n---\n\nNew body.",
        },
      }),
    ).toMatchObject({ success: true });
    expect(services.getLastUpdateRequest()?.entity.metadata["title"]).toBe(
      "New title",
    );
    expect(services.getLastUpdateRequest()?.entity.metadata).not.toHaveProperty(
      "publishedAt",
    );
  });

  it("keeps the stored frontmatter when replacement content is body-only", async () => {
    useMetadataBackedAdapter();
    expect(
      await execConfirmed({
        entityType: "metadata-backed-test",
        id: "metadata-backed-1",
        operation: { kind: "content", content: "New body.\n" },
      }),
    ).toMatchObject({ success: true });
    const updated = services.getLastUpdateRequest()?.entity;
    expect(updated?.content).toBe(
      "---\ntitle: Original title\npublishedAt: '2026-03-01T00:00:00.000Z'\n---\nNew body.\n",
    );
    expect(updated?.metadata).toEqual({
      title: "Original title",
      publishedAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("keeps restricted visibility frontmatter on a body-only note replacement", async () => {
    const note = expectDefined(
      services.getEntities().get("woodchuck-note"),
      "note",
    );
    services.addEntities([
      {
        ...note,
        content: "---\nvisibility: restricted\n---\nOld body.",
        visibility: "restricted",
      },
    ]);
    expect(
      await execConfirmed({
        entityType: "base",
        id: note.id,
        operation: { kind: "content", content: "Replacement body." },
      }),
    ).toMatchObject({ success: true });
    const updated = services.getLastUpdateRequest()?.entity;
    expect(updated?.content).toBe(
      "---\nvisibility: restricted\n---\nReplacement body.",
    );
    expect(updated?.visibility).toBe("restricted");
  });

  it("rejects body-only replacement content for a type without a body", async () => {
    const adapter = new SourceOwnedTestAdapter();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    registry.registerEntityType(adapter.entityType, adapter.schema, adapter);
    services.entityRegistry = registry;
    services.addEntities([
      {
        id: "source-owned",
        entityType: adapter.entityType,
        content: "---\ntitle: Original\n---\n",
        contentHash: "hash-source-owned",
        visibility: "public",
        metadata: {},
        created: "2026-09-25T10:00:00.000Z",
        updated: "2026-09-25T10:00:00.000Z",
      },
    ]);
    tools = createSystemTools(services);

    expect(
      await exec({
        entityType: adapter.entityType,
        id: "source-owned",
        operation: { kind: "content", content: "title: Changed" },
      }),
    ).toEqual({
      success: false,
      error:
        "source-owned-test has no body. Replace its full markdown, including frontmatter.",
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("preserves curated metadata when its source has not changed", async () => {
    useMetadataBackedAdapter();
    const entity = expectDefined(
      services.getEntities().get("metadata-backed-1"),
      "entity",
    );
    services.addEntities([
      { ...entity, metadata: { ...entity.metadata, title: "Curated title" } },
    ]);
    expect(
      await execConfirmed({
        entityType: entity.entityType,
        id: entity.id,
        operation: {
          kind: "edits",
          edits: [{ oldText: "Body.", newText: "Edited body." }],
        },
      }),
    ).toMatchObject({ success: true });
    expect(services.getLastUpdateRequest()?.entity.metadata["title"]).toBe(
      "Curated title",
    );
  });

  it("allows a value persisted by a real metadata-backed adapter", async () => {
    useMetadataBackedAdapter();

    const result = await exec({
      entityType: "metadata-backed-test",
      id: "metadata-backed-1",
      operation: { kind: "fields", fields: { title: "Updated title" } },
    });

    expect(() => expectConfirmationArgs(result)).not.toThrow();
  });

  it("allows a null deletion persisted by a real metadata-backed adapter", async () => {
    useMetadataBackedAdapter();

    const result = await execConfirmed({
      entityType: "metadata-backed-test",
      id: "metadata-backed-1",
      operation: { kind: "fields", fields: { publishedAt: null } },
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "metadata-backed-1" },
    });
    const updateRequest = services.getLastUpdateRequest();
    if (!updateRequest) throw new Error("Expected an update to be recorded");
    expect(updateRequest.entity.metadata).not.toHaveProperty("publishedAt");
  });

  it("leaves fields updates alone when the adapter cannot be probed", async () => {
    useMetadataBackedAdapter(new UnprobeableMetadataBackedTestAdapter());

    const result = await exec({
      entityType: "metadata-backed-test",
      id: "metadata-backed-1",
      operation: { kind: "fields", fields: { title: "Updated title" } },
    });

    expect(() => expectConfirmationArgs(result)).not.toThrow();
  });

  it("rejects invalid content replacement before requesting confirmation", async () => {
    services.addEntities([
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content:
          "---\nname: Alex Chen\nkind: person\nrole: architect\naudience: builders\nexpertise:\n  - systems\navailability: advisory\n---\n",
        contentHash: "hash-anchor-profile",
        visibility: "public",
        metadata: { name: "Alex Chen", kind: "person" },
        created: new Date("2026-03-16T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-16T10:00:00.000Z").toISOString(),
      },
    ]);

    const originalRegistry = services.entityRegistry;
    services.entityRegistry = {
      ...originalRegistry,
      getEffectiveFrontmatterSchema: (
        type: string,
      ): ReturnType<typeof originalRegistry.getEffectiveFrontmatterSchema> =>
        type === "anchor-profile"
          ? z.object({
              name: z.string(),
              kind: z.enum(["person", "team", "organization"]),
              role: z.string(),
              audience: z.string(),
              expertise: z.array(z.string()),
              availability: z.string(),
            })
          : originalRegistry.getEffectiveFrontmatterSchema(type),
    };
    tools = createSystemTools(services);

    const result = await exec({
      entityType: "anchor-profile",
      id: "anchor-profile",
      operation: {
        kind: "content",
        content:
          "---\nname: Yeehaa\nkind: person\nrole: \naudience: \nexpertise:\n  - \navailability: \n---\n",
      },
    });

    expect(result).toEqual({
      success: false,
      error:
        "Invalid content replacement for this entity type. Provide full markdown with valid frontmatter, or use 'fields' for partial updates.",
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  it("rejects blank content replacement for frontmatter entities", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      operation: { kind: "content", content: " " },
      confirmed: true,
    });

    expect(result).toEqual({
      success: false,
      error:
        "Full content replacement cannot be empty for this entity type. Use 'fields' for partial updates.",
    });

    const updated = expectDefined(
      services.getEntities().get("old-agent.io"),

      "updated entity",
    );
    expect(updated.content).toContain("name: Old Agent");
    expect(updated.metadata["status"]).toBe("active");
  });
});
