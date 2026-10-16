import { describe, expect, it } from "bun:test";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { ActionItemAdapter } from "../../src/adapters/conversation-memory-adapters";
import {
  actionItemBody,
  applyMove,
  isBoardOwned,
} from "../../src/lib/action-item-board";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "../../src/schemas/conversation-memory";

const adapter = new ActionItemAdapter();
const niels = { kind: "user", userId: "u-niels" } as const;

const baseMetadata: ActionItemMetadata = {
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
};

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
  it("changes only status and history, keeping the body and every other field", () => {
    const item = projected();
    const grouped = withContent(
      item,
      generateMarkdown(
        { ...frontmatterOf(item.content), projects: ["Spring gathering"] },
        actionItemBody(item.content),
      ),
    );

    const moved = applyMove(grouped, {
      from: "open",
      to: "blocked",
      actor: niels,
      at: "2026-10-15T08:02:00.000Z",
    });

    expect(actionItemBody(moved.content)).toBe(actionItemBody(grouped.content));
    const { status, history, ...rest } = frontmatterOf(moved.content);
    const {
      status: previousStatus,
      history: previousHistory,
      ...previousRest
    } = frontmatterOf(grouped.content);
    expect(rest).toEqual(previousRest);
    expect(previousStatus).toBe("open");
    expect(previousHistory).toBeUndefined();
    expect(status).toBe("blocked");
    expect(history).toEqual([
      {
        at: "2026-10-15T08:02:00.000Z",
        actor: niels,
        from: "open",
        to: "blocked",
      },
    ]);
    expect(moved.metadata.status).toBe("blocked");
    expect(moved.metadata.history).toEqual([
      {
        at: "2026-10-15T08:02:00.000Z",
        actor: niels,
        from: "open",
        to: "blocked",
      },
    ]);
  });

  it("appends to existing history", () => {
    const first = applyMove(projected(), {
      from: "open",
      to: "doing",
      actor: niels,
      at: "2026-10-13T14:02:00.000Z",
    });
    const second = applyMove(withContent(first, first.content), {
      from: "doing",
      to: "done",
      actor: { kind: "user", userId: "u-sam" },
      at: "2026-10-15T09:40:00.000Z",
    });
    expect(second.metadata.history?.map((entry) => entry.to)).toEqual([
      "doing",
      "done",
    ]);
  });

  it("refuses a move from a status the card no longer has", () => {
    expect(() =>
      applyMove(projected({ status: "done" }), {
        from: "open",
        to: "blocked",
        actor: niels,
        at: "2026-10-15T08:02:00.000Z",
      }),
    ).toThrow("done");
  });

  it("refuses a move to the status the card already has", () => {
    expect(() =>
      applyMove(projected(), {
        from: "open",
        to: "open",
        actor: niels,
        at: "2026-10-15T08:02:00.000Z",
      }),
    ).toThrow();
  });
});
