import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import conversationMemoryPackage from "@brains/conversation-memory";
import type { EntityTypeConfig } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createActionBoardPlugins } from "./helpers/action-board-plugins";
import { runActionBoardScenario } from "./helpers/action-board-scenario";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The action board on the brain's own entity store, over action items as
 * main stored them (fixtures/conversation-memory-main-bytes.json), driven
 * through what it registers: its chat tools, the Board, its Inbox source and
 * its track follow-up. What each answered and every card it wrote match
 * what the action-board class answered and wrote on main
 * (fixtures/action-board-main.json, captured with the clock at the same
 * instant). action-item reads as its stored document, so the board reads a
 * card's header, groupings included, from its content, as it did.
 */

const rowSchema = z.object({ id: z.string(), file: z.string() });
const memory = z
  .object({
    itemCurrent: rowSchema,
    itemLegacy: rowSchema,
    itemBoard: rowSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "conversation-memory-main-bytes.json",
        ),
        "utf8",
      ),
    ),
  );
const main = z
  .object({
    answers: z.record(z.string(), z.unknown()),
    rows: z.record(
      z.string(),
      z.object({ content: z.string(), metadata: z.unknown() }).nullable(),
    ),
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "action-board-main.json"),
        "utf8",
      ),
    ),
  );

const RETIRED = [
  "spaceId",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
];

/** Each memory type's registration, as main's class registered it. */
function typeConfig(entityType: string): EntityTypeConfig {
  return entityType === "action-item"
    ? {
        retiredFields: RETIRED,
        translatedFields: ["timeRange"],
        actionPolicy: { create: "never" },
      }
    : {};
}

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  setSystemTime();
  for (const store of stores.splice(0)) await store.close();
});

describe("the action board on the entity store", () => {
  test("answers and writes as main's class did, over main's action items", async () => {
    setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    const opened = await declaredEntityStore(
      conversationMemoryPackage,
      "@brains/conversation-memory",
      "conversation-memory",
      typeConfig,
      [],
      {},
      (registry) =>
        registry.registerGrouping({
          key: "projects",
          field: "projects",
          label: "Projects",
          types: ["action-item"],
        }),
    );
    stores.push(opened);
    for (const row of [
      memory.itemCurrent,
      memory.itemLegacy,
      memory.itemBoard,
    ]) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType: "action-item", id: row.id, markdown: row.file },
      });
    }
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "action-item",
        id: "fix-the-gutter",
        markdown:
          "---\norigin: board\ncapturedAt: '2026-03-02T00:00:00.000Z'\nstatus: blocked\n---\n# Action item: Fix the gutter\n\nFix the gutter\n",
      },
    });

    const { answers, rows } = await runActionBoardScenario(
      opened,
      createActionBoardPlugins(),
    );

    expect(rows).toEqual(main.rows);
    for (const [name, answer] of Object.entries(main.answers)) {
      expect({ [name]: answers[name] }).toEqual({ [name]: answer });
    }
    expect(Object.keys(answers)).toEqual(Object.keys(main.answers));
  });
});
