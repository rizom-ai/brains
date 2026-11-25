import { createAtprotoPlugin, type AtprotoTestPlugin } from "./atproto-plugins";
import { createMockShell as createBaseMockShell } from "@brains/plugins/test";
import { describe, expect, it, mock } from "bun:test";
import { SYSTEM_CHANNELS, type BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  ATPROTO_PUBLISH_FAILED,
  AtprotoProjectionRegistry,
  type AtprotoLexicon,
  type AtprotoPdsClientLike,
} from "../src";

const REPO = "did:plc:repo";
const NOTES = "ai.rizom.brain.note";

type StoredRecord = Record<string, unknown>;
type ListInput = Parameters<
  NonNullable<AtprotoPdsClientLike["listRecords"]>
>[0];
type PutInput = Parameters<NonNullable<AtprotoPdsClientLike["putRecord"]>>[0];
type DeleteInput = Parameters<
  NonNullable<AtprotoPdsClientLike["deleteRecord"]>
>[0];

function createMockShell(): ReturnType<typeof createBaseMockShell> {
  const shell = createBaseMockShell({
    domain: "brain.example.com",
    profileKind: "collective",
  });
  shell.getProfileKindRegistry().register("test", {
    kind: "collective",
    category: "organization",
    fields: z.object({}),
    labels: { singular: "Collective", plural: "Collectives" },
  });
  shell.getProfileKindRegistry().finalize();
  return shell;
}

function note(
  id: string,
  input: {
    title?: string;
    visibility?: BaseEntity["visibility"];
    status?: string;
  } = {},
): BaseEntity {
  return {
    id,
    entityType: "note",
    content: `Body of ${id}`,
    created: "2026-07-20T10:00:00.000Z",
    updated: "2026-07-20T10:00:00.000Z",
    visibility: input.visibility ?? "public",
    contentHash: `${id}-hash`,
    metadata: {
      title: input.title ?? `Title of ${id}`,
      status: input.status ?? "published",
    },
  };
}

/**
 * The record the test projection builds for a note. A brain with no site
 * and no configured DIDs is named, as its anchor is, by its repo.
 */
function noteRecord(
  entity: BaseEntity,
  extra: StoredRecord = {},
): StoredRecord {
  return {
    $type: NOTES,
    title: String(entity.metadata["title"]),
    createdAt: entity.created,
    brainDid: REPO,
    anchorDid: REPO,
    ...extra,
  };
}

/** A record as an earlier release wrote it: naming no brain and no anchor. */
function unnamedRecord(entity: BaseEntity): StoredRecord {
  return {
    $type: NOTES,
    title: String(entity.metadata["title"]),
    createdAt: entity.created,
  };
}

const noteLexicon: AtprotoLexicon = {
  lexicon: 1,
  id: NOTES,
  defs: {
    main: {
      type: "record",
      key: "tid",
      record: {
        type: "object",
        required: ["title", "createdAt"],
        properties: {
          title: { type: "string" },
          createdAt: { type: "string", format: "datetime" },
          brainDid: { type: "string" },
          anchorDid: { type: "string" },
        },
      },
    },
  },
};

/** Notes project when published; the record names the configured brain. */
function createRegistry(): AtprotoProjectionRegistry {
  const registry = new AtprotoProjectionRegistry();
  registry.register({
    entityType: "note",
    collection: NOTES,
    lexicon: noteLexicon,
    validate: false,
    isPublishable: (entity) => entity.metadata["status"] === "published",
    buildRecord: async ({ entity, config }) => ({
      ...unnamedRecord(entity),
      ...(config.brainDid && { brainDid: config.brainDid }),
      ...(config.anchorDid && { anchorDid: config.anchorDid }),
    }),
  });
  return registry;
}

/** A PDS repo held in memory: what it stores, and every call made to it. */
function createRepo(
  stored: Record<string, StoredRecord> = {},
  options: { pageSize?: number; listError?: Error } = {},
): {
  client: AtprotoPdsClientLike;
  records: Map<string, StoredRecord>;
  createSession: ReturnType<typeof mock>;
  listRecords: ReturnType<typeof mock<(input: ListInput) => unknown>>;
  putRecord: ReturnType<typeof mock<(input: PutInput) => unknown>>;
  deleteRecord: ReturnType<typeof mock<(input: DeleteInput) => unknown>>;
} {
  const records = new Map(Object.entries(stored));
  const pageSize = options.pageSize ?? 100;
  const listRecords = mock(async (input: ListInput) => {
    if (options.listError) throw options.listError;
    if (input.collection !== NOTES) return { records: [] };
    const keys = [...records.keys()].sort();
    const start = input.cursor ? keys.indexOf(input.cursor) + 1 : 0;
    const page = keys.slice(start, start + pageSize);
    const last = page.at(-1);
    return {
      records: page.map((rkey) => ({
        uri: `at://${REPO}/${NOTES}/${rkey}`,
        cid: `cid-${rkey}`,
        value: records.get(rkey) ?? {},
      })),
      ...(last !== undefined &&
        start + pageSize < keys.length && { cursor: last }),
    };
  });
  const putRecord = mock(async (input: PutInput) => {
    if (input.collection === NOTES) records.set(input.rkey, input.record);
    return {
      uri: `at://${REPO}/${input.collection}/${input.rkey}`,
      cid: "cid",
    };
  });
  const deleteRecord = mock(async (input: DeleteInput) => {
    records.delete(input.rkey);
  });
  const createSession = mock(async () => ({
    did: REPO,
    handle: "brain.example.com",
    accessJwt: "access-token",
    refreshJwt: "refresh-token",
  }));
  return {
    createSession,
    client: {
      createSession,
      createRecord: mock(async () => ({ uri: "at://x", cid: "cid" })),
      putRecord,
      deleteRecord,
      listRecords,
    },
    records,
    listRecords,
    putRecord,
    deleteRecord,
  };
}

function createPlugin(
  client: AtprotoPdsClientLike,
  config: { brainDid?: string; appPassword?: string } = {},
  registry: AtprotoProjectionRegistry = createRegistry(),
): AtprotoTestPlugin {
  return createAtprotoPlugin(
    {
      identifier: "brain.example.com",
      appPassword: "secret",
      repoDid: REPO,
      ...config,
    },
    { projectionRegistry: registry, createPdsClient: () => client },
  );
}

type Shell = ReturnType<typeof createMockShell>;

async function broadcast(shell: Shell, type: string): Promise<void> {
  await shell.getMessageBus().send({
    type,
    payload: { timestamp: "2026-11-25T00:00:00.000Z" },
    sender: "test",
    broadcast: true,
  });
}

/** A full start whose startup content is in place, run until its work is done. */
async function start(
  client: AtprotoPdsClientLike,
  entities: BaseEntity[],
  config: Parameters<typeof createPlugin>[1] = {},
): Promise<Shell> {
  const plugin = createPlugin(client, config);
  const shell = createMockShell();
  shell.addEntities(entities);
  await plugin.register(shell);
  await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);
  await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
  await plugin.shutdown();
  return shell;
}

/** The note records a start wrote, by record key. */
function noteWrites(repo: ReturnType<typeof createRepo>): string[] {
  return repo.putRecord.mock.calls
    .map(([input]) => input)
    .filter((input) => input.collection === NOTES)
    .map((input) => input.rkey);
}

describe("AT Protocol records kept complete on every start", () => {
  it("writes the records that are missing and nothing else", async () => {
    const kept = note("kept");
    const repo = createRepo({ kept: noteRecord(kept) });

    await start(repo.client, [kept, note("missing")]);

    expect(noteWrites(repo)).toEqual(["missing"]);
    expect(repo.records.get("missing")).toEqual(noteRecord(note("missing")));
    expect(repo.deleteRecord).not.toHaveBeenCalled();
  });

  it("rewrites a record that no longer matches its entity", async () => {
    const entity = note("renamed", { title: "The new title" });
    const repo = createRepo({
      renamed: noteRecord(note("renamed", { title: "The old title" })),
    });

    await start(repo.client, [entity]);

    expect(noteWrites(repo)).toEqual(["renamed"]);
    expect(repo.records.get("renamed")).toEqual(noteRecord(entity));
  });

  it("rewrites a record written before the brain's DID was configured", async () => {
    const entity = note("essay");
    const repo = createRepo({ essay: noteRecord(entity) });

    await start(repo.client, [entity], {
      brainDid: "did:web:brain.example.com",
    });

    expect(noteWrites(repo)).toEqual(["essay"]);
    expect(repo.records.get("essay")).toEqual(
      noteRecord(entity, { brainDid: "did:web:brain.example.com" }),
    );
  });

  it("rewrites a record written before records named their brain", async () => {
    const entity = note("essay");
    const repo = createRepo({ essay: unnamedRecord(entity) });

    await start(repo.client, [entity]);

    expect(noteWrites(repo)).toEqual(["essay"]);
    expect(repo.records.get("essay")).toEqual(noteRecord(entity));
  });

  it("names a brain with a site, and its anchor, by the site", async () => {
    const entity = note("essay");
    const repo = createRepo({ essay: unnamedRecord(entity) });
    const plugin = createPlugin(repo.client);
    const shell = createMockShell();
    shell.serveHttp();
    shell.addEntities([entity]);
    await plugin.register(shell);
    await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);

    await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
    await plugin.shutdown();

    expect(repo.records.get("essay")).toEqual(
      noteRecord(entity, {
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:web:brain.example.com:anchor",
      }),
    );
  });

  it("writes nothing on a second start when the repo is the session's, not configured", async () => {
    const entity = note("essay");
    const repo = createRepo();
    const boot = async (): Promise<void> => {
      const plugin = createAtprotoPlugin(
        { identifier: "brain.example.com", appPassword: "secret" },
        {
          projectionRegistry: createRegistry(),
          createPdsClient: () => repo.client,
        },
      );
      const shell = createMockShell();
      shell.addEntities([entity]);
      await plugin.register(shell);
      await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);
      await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
      await plugin.shutdown();
    };
    await boot();
    expect(repo.records.get("essay")).toEqual(noteRecord(entity));
    repo.putRecord.mockClear();

    await boot();

    expect(noteWrites(repo)).toEqual([]);
  });

  it("deletes a record whose entity is gone", async () => {
    const kept = note("kept");
    const repo = createRepo({
      kept: noteRecord(kept),
      orphan: noteRecord(note("orphan")),
    });

    await start(repo.client, [kept]);

    expect(repo.deleteRecord).toHaveBeenCalledTimes(1);
    expect(repo.deleteRecord).toHaveBeenCalledWith({
      repo: REPO,
      collection: NOTES,
      rkey: "orphan",
    });
    expect(noteWrites(repo)).toEqual([]);
  });

  it("gives drafts and non-public entities no record, and deletes one they had", async () => {
    const draft = note("draft", { status: "draft" });
    const shared = note("shared", { visibility: "shared" });
    const restricted = note("restricted", { visibility: "restricted" });
    const repo = createRepo({
      draft: noteRecord(draft),
      restricted: noteRecord(restricted),
    });

    await start(repo.client, [draft, shared, restricted]);

    expect(noteWrites(repo)).toEqual([]);
    expect([...repo.records.keys()]).toEqual([]);
  });

  it("writes nothing on a second start", async () => {
    const entities = [note("one"), note("two")];
    const repo = createRepo();
    await start(repo.client, entities);
    expect(noteWrites(repo).sort()).toEqual(["one", "two"]);
    repo.putRecord.mockClear();
    repo.listRecords.mockClear();

    await start(repo.client, entities);

    expect(noteWrites(repo)).toEqual([]);
    expect(repo.deleteRecord).not.toHaveBeenCalled();
    // One request for the one projected collection.
    expect(repo.listRecords).toHaveBeenCalledTimes(1);
  });

  it("leaves a record alone when only its uploaded blob's address differs", async () => {
    const entity = note("with-cover");
    const blob = (link: string): StoredRecord => ({
      $type: "blob",
      ref: { $link: link },
      mimeType: "image/png",
      size: 1234,
    });
    const registry = new AtprotoProjectionRegistry();
    registry.register({
      entityType: "note",
      collection: NOTES,
      lexicon: noteLexicon,
      validate: false,
      buildRecord: async ({ entity: built, dryRun }) =>
        noteRecord(built, {
          coverImage: { blob: blob(dryRun ? "dry-run" : "bafy-uploaded") },
        }),
    });
    const repo = createRepo({
      "with-cover": noteRecord(entity, {
        coverImage: { blob: blob("bafy-stored") },
      }),
    });
    const plugin = createPlugin(repo.client, {}, registry);
    const shell = createMockShell();
    shell.addEntities([entity]);
    await plugin.register(shell);
    await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);

    await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
    await plugin.shutdown();

    expect(noteWrites(repo)).toEqual([]);
  });

  it("settles the other records when one entity's record cannot be built", async () => {
    const registry = new AtprotoProjectionRegistry();
    registry.register({
      entityType: "note",
      collection: NOTES,
      lexicon: noteLexicon,
      validate: false,
      buildRecord: async ({ entity }) => {
        if (entity.id === "broken") throw new Error("No record for this one");
        return noteRecord(entity);
      },
    });
    const repo = createRepo({
      broken: noteRecord(note("broken")),
      orphan: noteRecord(note("orphan")),
    });
    const plugin = createPlugin(repo.client, {}, registry);
    const shell = createMockShell();
    shell.addEntities([note("broken"), note("missing")]);
    const failures: unknown[] = [];
    shell.getMessageBus().subscribe(ATPROTO_PUBLISH_FAILED, async (message) => {
      failures.push(message.payload);
      return { success: true };
    });
    await plugin.register(shell);
    await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);

    await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
    await plugin.shutdown();

    expect(noteWrites(repo)).toEqual(["missing"]);
    expect([...repo.records.keys()].sort()).toEqual(["broken", "missing"]);
    expect(failures).toEqual([
      {
        operation: "upsert-record",
        entityType: "note",
        entityId: "broken",
        collection: NOTES,
        error: "No record for this one",
      },
    ]);
  });

  it("signs in once however many records it writes and deletes", async () => {
    const repo = createRepo({
      gone: noteRecord(note("gone")),
      "also-gone": noteRecord(note("also-gone")),
    });
    const plugin = createAtprotoPlugin(
      { identifier: "brain.example.com", appPassword: "secret" },
      {
        projectionRegistry: createRegistry(),
        createPdsClient: () => repo.client,
      },
    );
    const shell = createMockShell();
    shell.addEntities([note("one"), note("two"), note("three")]);
    await plugin.register(shell);
    await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);

    await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
    await plugin.shutdown();

    expect(noteWrites(repo).sort()).toEqual(["one", "three", "two"]);
    expect([...repo.records.keys()].sort()).toEqual(["one", "three", "two"]);
    expect(repo.createSession).toHaveBeenCalledTimes(1);
  });

  it("writes one record at a time", async () => {
    const repo = createRepo();
    const inFlight = { now: 0, most: 0 };
    repo.putRecord.mockImplementation(async (input: PutInput) => {
      inFlight.now += 1;
      inFlight.most = Math.max(inFlight.most, inFlight.now);
      await Bun.sleep(0);
      inFlight.now -= 1;
      return {
        uri: `at://${REPO}/${input.collection}/${input.rkey}`,
        cid: "cid",
      };
    });

    await start(repo.client, [note("one"), note("two"), note("three")]);

    expect(repo.putRecord).toHaveBeenCalledTimes(3);
    expect(inFlight.most).toBe(1);
  });

  it("reads every page of a collection before deciding", async () => {
    const entities = [note("a"), note("b"), note("c")];
    const repo = createRepo(
      {
        a: noteRecord(note("a")),
        b: noteRecord(note("b")),
        c: noteRecord(note("c")),
        z: noteRecord(note("z")),
      },
      { pageSize: 1 },
    );

    await start(repo.client, entities);

    expect(repo.listRecords).toHaveBeenCalledTimes(4);
    expect(noteWrites(repo)).toEqual([]);
    expect([...repo.records.keys()]).toEqual(["a", "b", "c"]);
  });

  it("waits for startup content: ready alone reads and deletes nothing", async () => {
    // A database still importing holds no entities; every record would look
    // like an orphan.
    const repo = createRepo({ essay: noteRecord(note("essay")) });
    const plugin = createPlugin(repo.client);
    const shell = createMockShell();
    await plugin.register(shell);
    await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);

    await plugin.ready();
    await plugin.shutdown();

    expect(repo.listRecords).not.toHaveBeenCalled();
    expect(repo.deleteRecord).not.toHaveBeenCalled();
    expect([...repo.records.keys()]).toEqual(["essay"]);
  });

  it("does nothing without publishing credentials", async () => {
    const repo = createRepo({ orphan: noteRecord(note("orphan")) });

    await start(repo.client, [note("missing")], { appPassword: "" });

    expect(repo.listRecords).not.toHaveBeenCalled();
    expect(repo.putRecord).not.toHaveBeenCalled();
    expect(repo.deleteRecord).not.toHaveBeenCalled();
  });

  it("reports a failed listing and changes nothing", async () => {
    const repo = createRepo(
      { orphan: noteRecord(note("orphan")) },
      { listError: new Error("PDS unavailable") },
    );
    const plugin = createPlugin(repo.client);
    const shell = createMockShell();
    shell.addEntities([note("missing")]);
    const failures: unknown[] = [];
    shell.getMessageBus().subscribe(ATPROTO_PUBLISH_FAILED, async (message) => {
      failures.push(message.payload);
      return { success: true };
    });
    await plugin.register(shell);
    await broadcast(shell, SYSTEM_CHANNELS.pluginsRegistered);

    await broadcast(shell, SYSTEM_CHANNELS.startupContentSettled);
    await plugin.shutdown();

    expect(noteWrites(repo)).toEqual([]);
    expect(repo.deleteRecord).not.toHaveBeenCalled();
    expect(failures).toEqual([
      {
        operation: "reconcile-records",
        entityType: "note",
        entityId: "*",
        collection: NOTES,
        error: "PDS unavailable",
      },
    ]);
  });
});
