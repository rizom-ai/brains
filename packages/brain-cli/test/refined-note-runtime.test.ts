import { afterEach, describe, expect, test } from "bun:test";
import type { EntityGrouping, EntityRegistry } from "@brains/entity-service";
import notePackage from "@brains/note";
import refinedNotePackage from "@brains/refined-note";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";
import { declaredType } from "./helpers/declared-type";

/**
 * The declared refined notes on the brain's own entity store: a refined
 * note is stored as its title and summary over its body, is refused without
 * them, and, where a grouping applies to it, is refused unless its file
 * states a value in one. What the generation writes is placed in the
 * grouping the brain chooses, and the field is kept in the stored file.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

// A closed grouping the refined notes take part in.
const projects: EntityGrouping = {
  key: "projects",
  label: "Projects",
  field: "projects",
  types: ["refined-note"],
  multiple: false,
  values: ["Lighthouse", "Harbour"],
};

let reply: unknown;
let choice: unknown;

async function store(
  groupings: readonly EntityGrouping[] = [],
): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    refinedNotePackage,
    "@brains/refined-note",
    "refined-note",
    (entityType) =>
      entityType === "refined-note"
        ? {
            projectionSourceRole: "primary",
            consumesSources: ["note"],
            requiresGroupingMembership: true,
          }
        : { projectionSourceRole: "primary", markdownImport: true },
    [],
    {},
    (registry: EntityRegistry): void => {
      // The declared note, as the canonical brain installs it.
      const note = declaredType(notePackage, "@brains/note", "note");
      registry.registerEntityType("note", note.schema, note.adapter);
      groupings.forEach((grouping) => registry.registerGrouping(grouping));
    },
  );
  // The type's checks read the groupings off the shell's one registry.
  opened.shell.getEntityRegistry().getGroupings = (): EntityGrouping[] => [
    ...groupings,
  ];
  opened.shell.generateContent = async (): Promise<unknown> => reply;
  opened.shell.generateObject = async <T>(
    _prompt: string,
    schema: { parse(input: unknown): T },
  ): Promise<{ object: T }> => ({ object: schema.parse(choice) });
  stores.push(opened);
  return opened;
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<string | undefined> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "refined-note", id, markdown },
  });
  return (await opened.stored("refined-note", id))?.content;
}

/** A generation the package queued for itself, as the runtime queues it. */
async function generate(
  opened: DeclaredEntityStore,
  input: unknown,
  entityId?: string,
): Promise<unknown> {
  const handler = opened.shell
    .getJobQueueService()
    .getHandler("refined-note:generation");
  if (!handler) throw new Error("No refined note generation");
  return handler.process(
    handler.validateAndParse({
      authority: {
        actor: { kind: "service", serviceId: "refined-note" },
        permissionCeiling: "public",
      },
      input,
      byPackage: true,
      ...(entityId !== undefined && { entityId }),
    }),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function looseNote(opened: DeclaredEntityStore): Promise<void> {
  await opened.service.createEntityFromMarkdown({
    input: {
      entityType: "note",
      id: "dashboard",
      markdown: "Sam stopped using the dashboard after a week.",
    },
  });
}

const refined = [
  "---",
  "title: Push beats pull",
  "summary: People use what comes to them.",
  "---",
  "The worked-out argument.",
  "",
].join("\n");

describe("the declared refined notes on the entity store", () => {
  test("stores a refined note as its title and summary over its body", async () => {
    const opened = await store();

    expect(await imported(opened, "push-beats-pull", refined)).toBe(refined);
  });

  test.each([
    ["no summary", "---\ntitle: Push beats pull\n---\nThe argument."],
    ["no title", "---\nsummary: People use what comes.\n---\nThe argument."],
    ["no frontmatter", "The argument."],
  ])("refuses a file with %s", async (_case, markdown) => {
    const opened = await store();

    expect(imported(opened, "push-beats-pull", markdown)).rejects.toThrow(
      "Invalid entity data for refined-note",
    );
    expect(await opened.stored("refined-note", "push-beats-pull")).toBeNull();
  });
});

describe("a refined note where a grouping applies", () => {
  test("is refused when its file states a value in none", async () => {
    const opened = await store([projects]);

    expect(imported(opened, "push-beats-pull", refined)).rejects.toThrow(
      "A refined-note belongs to at least one of: Projects.",
    );
    expect(await opened.stored("refined-note", "push-beats-pull")).toBeNull();
  });

  test("is stored with its membership in the file", async () => {
    const opened = await store([projects]);
    const placed = refined.replace(
      "---\nThe worked-out",
      "projects:\n  - Lighthouse\n---\nThe worked-out",
    );

    expect(await imported(opened, "push-beats-pull", placed)).toBe(placed);
  });
});

describe("the declared refined note generation on the entity store", () => {
  const written = {
    title: "Push beats pull",
    summary: "People use what comes to them.",
    body: "The worked-out argument.",
  };

  test("writes the title and summary into the file, over the body", async () => {
    const opened = await store();
    await looseNote(opened);
    reply = written;

    expect(
      await generate(opened, {
        sourceEntityType: "note",
        sourceEntityIds: ["dashboard"],
      }),
    ).toMatchObject({ success: true, entityId: "push-beats-pull" });

    expect(
      (await opened.stored("refined-note", "push-beats-pull"))?.content,
    ).toBe(refined);
  });

  test("places what it wrote in the grouping the brain chooses", async () => {
    const opened = await store([projects]);
    await looseNote(opened);
    reply = written;
    choice = { grouping: "projects", value: "Lighthouse" };

    expect(
      await generate(opened, {
        sourceEntityType: "note",
        sourceEntityIds: ["dashboard"],
      }),
    ).toMatchObject({ success: true, entityId: "push-beats-pull" });

    expect(
      (await opened.stored("refined-note", "push-beats-pull"))?.content,
    ).toBe(
      refined.replace(
        "---\nThe worked-out",
        "projects:\n  - Lighthouse\n---\nThe worked-out",
      ),
    );
  });

  test("writes nothing when the brain chooses a value the grouping refuses", async () => {
    const opened = await store([projects]);
    await looseNote(opened);
    reply = written;
    choice = { grouping: "projects", value: "Tides" };

    expect(
      await generate(opened, {
        sourceEntityType: "note",
        sourceEntityIds: ["dashboard"],
      }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("could not be placed in a grouping"),
    });

    expect(await opened.stored("refined-note", "push-beats-pull")).toBeNull();
    expect(await opened.stored("note", "dashboard")).not.toBeNull();
  });

  test("fills system_generate's placeholder and places it", async () => {
    const opened = await store([projects]);
    await looseNote(opened);
    const adapter = opened.shell.getEntityRegistry().getAdapter("refined-note");
    const stub = adapter.buildStub?.({ id: "alloc", title: "Dashboard" });
    if (!stub) throw new Error("The refined note builds no stub");
    await opened.service.createEntity({
      entity: { id: "alloc", entityType: "refined-note", ...stub },
    });
    // The placeholder is stored though it belongs nowhere yet.
    expect((await opened.stored("refined-note", "alloc"))?.content).toContain(
      "status: generating",
    );
    reply = written;
    choice = { grouping: "projects", value: "Harbour" };

    expect(
      await generate(
        opened,
        { sourceEntityType: "note", sourceEntityIds: ["dashboard"] },
        "alloc",
      ),
    ).toMatchObject({ success: true, entityId: "alloc" });

    expect((await opened.stored("refined-note", "alloc"))?.content).toBe(
      refined.replace(
        "---\nThe worked-out",
        "projects:\n  - Harbour\n---\nThe worked-out",
      ),
    );
  });
});
