import { describe, expect, it } from "bun:test";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { preserveSourceFrontmatter } from "@brains/entity-service";
import {
  ACTION_ITEM_RETIRED_FIELDS,
  ACTION_ITEM_TRANSLATED_FIELDS,
  ActionItemAdapter,
} from "../src";
import { actionItemBody, applyMove, applyNote, isBoardOwned } from "../src";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "../src";

const adapter = new ActionItemAdapter();

const baseMetadata: ActionItemMetadata = {
  conversationId: "conv-1",
  interfaceType: "cli",
  channelId: "cli-terminal",
  capturedAt: "2026-01-01T00:01:00.000Z",
  status: "open",
};

/** Frontmatter as the projector wrote it before the trim. */
const storedBeforeTrim = {
  conversationId: "conv-1",
  channelId: "cli-terminal",
  interfaceType: "cli",
  spaceId: "cli:cli-terminal",
  timeRange: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T00:01:00.000Z",
  },
  sourceSummaryId: "conv-1",
  sourceMessageCount: 2,
  projectionVersion: 1,
  status: "open",
  assignedTo: [
    { identity: { kind: "user", userId: "u-sam" }, displayName: "Sam Rivera" },
  ],
};

function storedItem(frontmatter: Record<string, unknown>): ActionItemEntity {
  const body = "# Action item: Book the venue\n\nBook the venue.\n";
  const stored = {
    ...frontmatter,
    projectedBodyHash: computeContentHash(body),
  };
  const content = generateMarkdown(stored, body);
  return actionItemSchema.parse({
    id: "conv-1:action-item:1:abc123abc123",
    entityType: "action-item",
    content,
    contentHash: computeContentHash(content),
    visibility: "shared",
    created: "2026-01-01T00:01:00.000Z",
    updated: "2026-01-01T00:01:00.000Z",
    metadata: stored,
  });
}

function projected(
  metadata: Partial<ActionItemMetadata> = {},
): ActionItemEntity {
  const unhashed = adapter.composeContent(
    "Action item: Book the venue",
    "Book the venue for the spring gathering.",
    { ...baseMetadata, ...metadata },
  );
  const full = {
    ...baseMetadata,
    projectedBodyHash: computeContentHash(actionItemBody(unhashed)),
    ...metadata,
  };
  const content = adapter.composeContent(
    "Action item: Book the venue",
    "Book the venue for the spring gathering.",
    full,
  );
  return actionItemSchema.parse({
    id: "conv-1:action-item:1:abc123abc123",
    entityType: "action-item",
    content,
    contentHash: computeContentHash(content),
    visibility: "shared",
    created: "2026-01-01T00:01:00.000Z",
    updated: "2026-01-01T00:01:00.000Z",
    metadata: full,
  });
}

function withContent(
  entity: ActionItemEntity,
  content: string,
): ActionItemEntity {
  return { ...entity, content, contentHash: computeContentHash(content) };
}

function frontmatterOf(content: string): Record<string, unknown> {
  return z
    .record(z.string(), z.unknown())
    .parse(readMarkdownFrontmatter(content).data);
}

describe("board ownership", () => {
  it("leaves an untouched projected item to the projector", () => {
    expect(isBoardOwned(projected())).toBe(false);
  });

  it("claims an item whose status moved off open", () => {
    expect(isBoardOwned(projected({ status: "doing" }))).toBe(true);
  });

  it("claims an item with a grouping membership", () => {
    const item = projected();
    const grouped = generateMarkdown(
      { ...frontmatterOf(item.content), projects: ["Spring gathering"] },
      actionItemBody(item.content),
    );
    expect(isBoardOwned(withContent(item, grouped))).toBe(true);
  });

  it("claims an item whose body changed after projection", () => {
    const item = projected();
    const noted = `${item.content}\n## Notes\n\n- 2026-10-15 · Niels — Waiting on the deposit.\n`;
    expect(isBoardOwned(withContent(item, noted))).toBe(true);
  });

  it("keeps every ownership signal through a markdown export and import", () => {
    const item = projected();
    const owned = [
      projected({ status: "doing" }),
      withContent(
        item,
        generateMarkdown(
          { ...frontmatterOf(item.content), projects: ["Spring gathering"] },
          actionItemBody(item.content),
        ),
      ),
      withContent(
        item,
        `${item.content}\n## Notes\n\n- Waiting on the deposit.\n`,
      ),
    ];
    for (const entity of owned) {
      const imported = adapter.fromMarkdown(adapter.toMarkdown(entity));
      const roundTripped = actionItemSchema.parse({ ...entity, ...imported });
      expect(isBoardOwned(roundTripped)).toBe(true);
    }
    const untouched = adapter.fromMarkdown(adapter.toMarkdown(item));
    expect(
      isBoardOwned(actionItemSchema.parse({ ...item, ...untouched })),
    ).toBe(false);
  });

  it("leaves an untouched item stored before the trim to the projector", () => {
    const item = storedItem(storedBeforeTrim);
    expect(actionItemBody(item.content)).toBe(
      "# Action item: Book the venue\n\nBook the venue.\n",
    );
    expect(isBoardOwned(item)).toBe(false);
  });

  it("treats an item projected before the board as projector-owned until moved or grouped", () => {
    const content = adapter.composeContent(
      "Action item: Book the venue",
      "Book the venue for the spring gathering.",
      baseMetadata,
    );
    const legacy = actionItemSchema.parse({
      ...projected(),
      content,
      metadata: baseMetadata,
    });
    expect(isBoardOwned(legacy)).toBe(false);
  });
});

describe("moving a card", () => {
  it("changes only status, keeping the body and every other field", () => {
    const item = projected();
    const grouped = withContent(
      item,
      generateMarkdown(
        { ...frontmatterOf(item.content), projects: ["Spring gathering"] },
        actionItemBody(item.content),
      ),
    );

    const moved = applyMove(grouped, { from: "open", to: "blocked" });

    expect(actionItemBody(moved.content)).toBe(actionItemBody(grouped.content));
    expect(frontmatterOf(moved.content)).toEqual({
      ...frontmatterOf(grouped.content),
      status: "blocked",
    });
    expect(moved.metadata).toEqual({ ...grouped.metadata, status: "blocked" });
  });

  it("writes an item stored before the trim in the trimmed shape, keeping its groupings", () => {
    const moved = applyMove(
      storedItem({ ...storedBeforeTrim, projects: ["Spring gathering"] }),
      { from: "open", to: "doing" },
    );

    const { projectedBodyHash, ...frontmatter } = frontmatterOf(moved.content);
    expect(typeof projectedBodyHash).toBe("string");
    expect(frontmatter).toEqual({
      conversationId: "conv-1",
      channelId: "cli-terminal",
      interfaceType: "cli",
      capturedAt: "2026-01-01T00:01:00.000Z",
      status: "doing",
      assignedTo: [{ name: "Sam Rivera", id: "user:u-sam" }],
      projects: ["Spring gathering"],
    });
    expect(actionItemBody(moved.content)).toBe(
      "# Action item: Book the venue\n\nBook the venue.\n",
    );
  });

  it("is written by the adapter in the trimmed shape, so any save migrates it", () => {
    const item = storedItem({
      ...storedBeforeTrim,
      projects: ["Spring gathering"],
    });

    const { projectedBodyHash, ...frontmatter } = frontmatterOf(
      adapter.toMarkdown(item),
    );
    expect(typeof projectedBodyHash).toBe("string");
    expect(frontmatter).toEqual({
      conversationId: "conv-1",
      channelId: "cli-terminal",
      interfaceType: "cli",
      capturedAt: "2026-01-01T00:01:00.000Z",
      status: "open",
      assignedTo: [{ name: "Sam Rivera", id: "user:u-sam" }],
      projects: ["Spring gathering"],
    });
    expect(actionItemBody(adapter.toMarkdown(item))).toBe(
      actionItemBody(item.content),
    );
  });

  it("is stored without any pre-trim field, timeRange included", () => {
    const item = storedItem(storedBeforeTrim);
    // As the entity service stores it: the adapter's markdown, plus any
    // stored field the type does not claim and has not retired.
    const markdown = preserveSourceFrontmatter(
      item.content,
      adapter.toMarkdown(item),
      adapter.frontmatterSchema,
      [],
      [],
      [...ACTION_ITEM_RETIRED_FIELDS, ...ACTION_ITEM_TRANSLATED_FIELDS],
    );

    const stored = frontmatterOf(markdown);
    for (const field of [
      "timeRange",
      "spaceId",
      "sourceSummaryId",
      "sourceMessageCount",
      "projectionVersion",
    ])
      expect(stored).not.toHaveProperty(field);
    expect(stored["capturedAt"]).toBe("2026-01-01T00:01:00.000Z");
  });

  it("refuses a move from a status the card no longer has", () => {
    expect(() =>
      applyMove(projected({ status: "done" }), { from: "open", to: "blocked" }),
    ).toThrow("done");
  });

  it("refuses a move to the status the card already has", () => {
    expect(() =>
      applyMove(projected(), { from: "open", to: "open" }),
    ).toThrow();
  });
});

describe("adding a note", () => {
  it("appends a dated, named line under Notes, keeping the text and every field", () => {
    const item = projected({ status: "blocked" });
    const noted = applyNote(item, {
      text: "Waiting on the\n deposit.",
      actorName: "Sam Rivera",
      at: "2026-10-15T08:02:00.000Z",
    });
    expect(actionItemBody(noted.content)).toBe(
      `${actionItemBody(item.content)}\n## Notes\n\n- 2026-10-15 · Sam Rivera — Waiting on the deposit.\n`,
    );
    expect(frontmatterOf(noted.content)).toEqual(frontmatterOf(item.content));
    expect(noted.metadata).toEqual(item.metadata);
    expect(
      isBoardOwned({
        ...noted,
        metadata: { ...noted.metadata, status: "open" },
      }),
    ).toBe(true);

    const twice = applyNote(noted, {
      text: "Deposit paid.",
      at: "2026-10-16T09:00:00.000Z",
    });
    expect(actionItemBody(twice.content)).toBe(
      `${actionItemBody(noted.content)}- 2026-10-16 · A team member — Deposit paid.\n`,
    );
  });

  it("refuses an empty note", () => {
    expect(() =>
      applyNote(projected(), { text: "  ", at: "2026-10-15T08:02:00.000Z" }),
    ).toThrow("text");
  });
});
