import { describe, expect, it } from "bun:test";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { ActionItemAdapter } from "../src";
import { actionItemBody, applyMove, applyNote, isBoardOwned } from "../src";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "../src";

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
    const edited = `${item.content}\nAlso confirm the caterer.\n`;
    expect(isBoardOwned(withContent(item, edited))).toBe(true);
  });

  it("claims an item someone has written a note on", () => {
    const noted = applyNote(projected(), {
      text: "Waiting on the deposit.",
      actor: niels,
      at: "2026-10-15T08:02:00.000Z",
    });
    expect(actionItemBody(noted.content)).toBe(
      actionItemBody(projected().content),
    );
    expect(isBoardOwned(noted)).toBe(true);
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
      withContent(item, `${item.content}\nAlso confirm the caterer.\n`),
      applyNote(item, {
        text: "Waiting on the deposit.",
        actor: niels,
        at: "2026-10-15T08:02:00.000Z",
      }),
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

describe("adding a note", () => {
  const sam = { kind: "user", userId: "u-sam" } as const;

  it("records who wrote it and when, leaving the body and every other field alone", () => {
    const item = projected({ status: "blocked" });
    const noted = applyNote(item, {
      text: "  Waiting on the deposit.\nCall them Friday.  ",
      actor: sam,
      actorName: "Sam Rivera",
      at: "2026-10-15T08:02:00.000Z",
    });
    const note = {
      at: "2026-10-15T08:02:00.000Z",
      actor: sam,
      displayName: "Sam Rivera",
      text: "Waiting on the deposit.\nCall them Friday.",
    };

    expect(noted.metadata).toEqual({ ...item.metadata, notes: [note] });
    expect(frontmatterOf(noted.content)).toEqual({
      ...frontmatterOf(item.content),
      notes: [note],
    });
    expect(actionItemBody(noted.content)).toBe(actionItemBody(item.content));
  });

  it("keeps notes in the order they were written", () => {
    const once = applyNote(projected(), {
      text: "Waiting on the deposit.",
      actor: sam,
      actorName: "Sam Rivera",
      at: "2026-10-15T08:02:00.000Z",
    });
    const twice = applyNote(once, {
      text: "Deposit paid.",
      actor: niels,
      at: "2026-10-16T09:00:00.000Z",
    });

    expect(twice.metadata.notes?.map((note) => note.text)).toEqual([
      "Waiting on the deposit.",
      "Deposit paid.",
    ]);
    expect(twice.metadata.notes?.[1]).toEqual({
      at: "2026-10-16T09:00:00.000Z",
      actor: niels,
      text: "Deposit paid.",
    });
  });

  it("refuses an empty note", () => {
    expect(() =>
      applyNote(projected(), {
        text: "  ",
        actor: niels,
        at: "2026-10-15T08:02:00.000Z",
      }),
    ).toThrow("text");
  });
});
