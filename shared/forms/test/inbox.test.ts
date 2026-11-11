import { describe, expect, it, spyOn } from "bun:test";
import { baseEntitySchema, createServicePluginContext } from "@brains/plugins";
import {
  createPluginHarness,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import { FormInboxSource, type FormInboxTarget } from "../src";
import { noteTarget, type NoteRequest } from "./fake-target";

const admin = { permissionLevel: "admin" as const };
const receivedAt = "2026-11-10T10:00:00.000Z";

function fields(entity: NoteRequest): Record<string, unknown> {
  return parseMarkdown(entity.content).frontmatter;
}

/** Notes as Inbox items: a note left without a name is no to-do. */
const target: FormInboxTarget<NoteRequest> = {
  ...noteTarget,
  inbox: {
    sourceId: "note-requests",
    displayName: "Note requests",
    label: "Note",
    recordLabel: "Note request",
    listFilter: { kind: "note" },
    item: (entity) => {
      const { name, receivedAt: at } = fields(entity);
      if (typeof at !== "string") throw new Error("Malformed note");
      return typeof name === "string"
        ? { title: "Note request", summary: `From ${name}`, receivedAt: at }
        : undefined;
    },
    detail: (entity) => `Name: ${String(fields(entity)["name"])}`,
    withHandled: (entity) => ({
      content: generateMarkdown({ ...fields(entity), status: "handled" }, ""),
      metadata: { ...entity.metadata, status: "handled" },
    }),
  },
};

async function fixture(): Promise<{
  context: ReturnType<typeof createServicePluginContext>;
  source: FormInboxSource<NoteRequest>;
  add: (
    id: string,
    note: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
}> {
  const harness = createPluginHarness();
  harness
    .getEntityRegistry()
    .registerEntityType(
      "note-request",
      baseEntitySchema.partial().passthrough(),
      createTestEntityAdapter("note-request"),
    );
  const context = createServicePluginContext(harness.getMockShell(), "notes");
  const add = async (
    id: string,
    note: Record<string, unknown>,
    metadata: Record<string, unknown> = {},
  ): Promise<void> => {
    const status = note["status"] ?? "new";
    await harness.getEntityService().createEntity({
      entity: {
        id,
        entityType: "note-request",
        visibility: "restricted",
        content: generateMarkdown(
          { receivedAt, notification: "pending", status, ...note },
          "",
        ),
        metadata: { status, kind: "note", ...metadata },
      },
    });
  };
  return { context, source: new FormInboxSource(context, target), add };
}

async function status(
  context: ReturnType<typeof createServicePluginContext>,
  id: string,
): Promise<Record<string, unknown>> {
  const entity = await context.entityService.getEntity({
    entityType: "note-request",
    id,
    visibilityScope: "restricted",
  });
  if (!entity) throw new Error(`Missing ${id}`);
  return parseMarkdown(entity.content).frontmatter;
}

describe("a form target's Inbox source", () => {
  it("is named by its target", async () => {
    const { source } = await fixture();
    expect(source.sourceId).toBe("note-requests");
    expect(source.displayName).toBe("Note requests");
  });

  it("lists only new records its target calls a to-do, each with its Done action", async () => {
    const { source, add } = await fixture();
    await add("note-new", { name: "Ada" });
    await add("note-handled", { name: "Grace", status: "handled" });
    // Its metadata still says new; the record itself is handled.
    await add(
      "note-stale",
      { name: "Linus", status: "handled" },
      {
        status: "new",
      },
    );
    await add("note-quiet", {});
    await add("note-other", { name: "Alan" }, { kind: "other" });
    expect(await source.list()).toEqual([
      {
        id: "note-new",
        title: "Note request",
        summary: "From Ada",
        receivedAt,
        urgency: "normal",
        entityRef: { entityType: "note-request", entityId: "note-new" },
        actions: [{ id: "mark-handled", label: "Done" }],
      },
    ]);
  });

  it("reports a listing failure without the records' content", async () => {
    const { source, add } = await fixture();
    await add("note-broken", { name: "Ada private", receivedAt: 1 });
    expect(source.list()).rejects.toThrow(new Error("Note inbox unavailable"));
  });

  it("refuses a non-admin its details and actions", async () => {
    const { context, source, add } = await fixture();
    await add("note-new", { name: "Ada" });
    for (const permissionLevel of ["public", "trusted"] as const) {
      expect(
        source.resolveDetail(
          "note-new",
          { permissionLevel },
          new AbortController().signal,
        ),
      ).rejects.toThrow(new Error("Note inbox requires admin permission"));
      expect(
        source.act("note-new", "mark-handled", { permissionLevel }),
      ).rejects.toThrow(new Error("Note inbox requires admin permission"));
    }
    expect(source.act("note-new", "publish", admin)).rejects.toThrow(
      new Error("Invalid note inbox action"),
    );
    expect(await status(context, "note-new")).toMatchObject({ status: "new" });
  });

  it("reads a detail at the actor's scope, and hides why one is unavailable", async () => {
    const { context, source, add } = await fixture();
    await add("note-new", { name: "Ada" });
    const read = spyOn(context.entityService, "getEntity");
    expect(
      await source.resolveDetail(
        "note-new",
        admin,
        new AbortController().signal,
      ),
    ).toEqual({ kind: "plain", text: "Name: Ada", truncated: false });
    expect(read.mock.calls.map(([request]) => request.visibilityScope)).toEqual(
      ["restricted"],
    );
    expect(
      source.resolveDetail("note-gone", admin, new AbortController().signal),
    ).rejects.toThrow(new Error("Note request unavailable"));
    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      source.resolveDetail("note-new", admin, cancelled.signal),
    ).rejects.toThrow(cancelled.signal.reason);
  });

  it("marks a record handled once, on the record it read", async () => {
    const { context, source, add } = await fixture();
    await add("note-new", { name: "Ada" });
    const update = spyOn(context.entityService, "updateEntity");
    const before = await context.entityService.getEntity({
      entityType: "note-request",
      id: "note-new",
      visibilityScope: "restricted",
    });
    await source.act("note-new", "mark-handled", admin);
    expect(
      update.mock.calls.map(
        ([request]) => request.options?.expectedContentHash,
      ),
    ).toEqual([before?.contentHash]);
    expect(await status(context, "note-new")).toMatchObject({
      status: "handled",
    });
    expect(await source.list()).toEqual([]);
    // Already handled: nothing is written again.
    await source.act("note-new", "mark-handled", admin);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("fails the action, never overwriting, when the record changes meanwhile", async () => {
    const { context, source, add } = await fixture();
    await add("note-new", { name: "Ada" });
    const update = context.entityService.updateEntity.bind(
      context.entityService,
    );
    context.entityService.updateEntity = async (
      request,
    ): ReturnType<typeof update> => {
      const current = await context.entityService.getEntity({
        entityType: "note-request",
        id: "note-new",
        visibilityScope: "restricted",
      });
      if (!current) throw new Error("Missing note");
      await update({
        entity: {
          ...current,
          content: generateMarkdown(
            {
              ...parseMarkdown(current.content).frontmatter,
              notification: "sent",
            },
            "",
          ),
        },
      });
      return update(request);
    };
    expect(source.act("note-new", "mark-handled", admin)).rejects.toThrow(
      new Error("Note request unavailable"),
    );
    expect(await status(context, "note-new")).toMatchObject({
      status: "new",
      notification: "sent",
    });
  });
});
