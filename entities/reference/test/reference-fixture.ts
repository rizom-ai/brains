import {
  instantiatePluginPackageDefinition,
  type JobHandler,
  type Plugin,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockProgressReporter } from "@brains/test-utils";
import type { FetchLike } from "@brains/utils/fetch-like";
import { createReferencePackage, type ReferenceNetwork } from "../src";
import { sourceCheckStore } from "../src/lib/recheck";
import packageJson from "../package.json";

export const AUTHOR_REPO = "did:plc:author";
export const AUTHOR_PDS = "https://pds.author.example";
export const POSTS = "ai.rizom.brain.post";

type Harness = ReturnType<typeof createPluginHarness>;

/** The reference type and its service, as the brain installs them. */
export function referencePlugins(network: ReferenceNetwork = {}): Plugin[] {
  return instantiatePluginPackageDefinition(
    createReferencePackage(network),
    {},
    { name: packageJson.name, version: packageJson.version },
    // Under the ids the canonical brain installs them by.
    { pluginId: "references", ownedTypePluginId: "reference" },
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A post record as a brain publishes it, body and all. */
export function postRecord(
  rkey: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    $type: POSTS,
    title: `Essay ${rkey}`,
    summary: `What ${rkey} is about.`,
    body: `THE WHOLE BODY OF ${rkey}`,
    format: "text/markdown",
    canonicalUrl: `https://author.example/essays/${rkey}`,
    sourceEntityType: "post",
    sourceEntityId: rkey,
    createdAt: "2026-05-01T08:00:00.000Z",
    publishedAt: "2026-05-02T09:00:00.000Z",
    ...fields,
  };
}

export interface AuthorRepo {
  /** Post records by record key; mutate to change what the author publishes. */
  posts: Map<string, Record<string, unknown>>;
  /** The author's brain card, or none. */
  card: Record<string, unknown> | undefined;
  /** The handle the repo answers to. */
  handle: string;
  /** Set to make the PDS fail every request. */
  down: boolean;
  /** Set to make the PLC directory forget the repo. */
  unresolvable: boolean;
  urls: string[];
  fetch: FetchLike;
}

/**
 * The public network as one author's repo: the PLC directory names its PDS,
 * a resolver knows its handle, and the PDS serves its posts and brain card.
 */
export function authorRepo(
  posts: Record<string, Record<string, unknown>> = {},
): AuthorRepo {
  const repo: AuthorRepo = {
    posts: new Map(Object.entries(posts)),
    card: {
      anchor: { did: "did:web:author.example:anchor", name: "Ada Author" },
    },
    handle: "author.example",
    down: false,
    unresolvable: false,
    urls: [],
    fetch: async (request) => {
      const url = new URL(String(request));
      repo.urls.push(url.toString());
      if (url.pathname === "/xrpc/com.atproto.identity.resolveHandle") {
        return url.searchParams.get("handle") === repo.handle
          ? jsonResponse({ did: AUTHOR_REPO })
          : jsonResponse({ message: "Unable to resolve handle" }, 400);
      }
      if (
        url.href === `https://plc.directory/${encodeURIComponent(AUTHOR_REPO)}`
      ) {
        if (repo.unresolvable) return jsonResponse({}, 404);
        return jsonResponse({
          id: AUTHOR_REPO,
          service: [{ id: "#atproto_pds", serviceEndpoint: AUTHOR_PDS }],
        });
      }
      if (url.origin !== AUTHOR_PDS) return jsonResponse({}, 404);
      if (repo.down) return jsonResponse({ message: "Upstream failure" }, 502);
      const collection = url.searchParams.get("collection");
      const record = (
        rkey: string,
        value: Record<string, unknown>,
      ): { uri: string; cid: string; value: Record<string, unknown> } => ({
        uri: `at://${AUTHOR_REPO}/${String(collection)}/${rkey}`,
        cid: `cid-${JSON.stringify(value).length}-${rkey}`,
        value,
      });
      if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
        if (collection !== POSTS) return jsonResponse({ records: [] });
        const keys = [...repo.posts.keys()];
        const limit = Number(url.searchParams.get("limit"));
        const cursor = url.searchParams.get("cursor");
        const start = cursor ? keys.indexOf(cursor) + 1 : 0;
        const page = keys.slice(start, start + limit);
        const last = page.at(-1);
        return jsonResponse({
          records: page.map((rkey) => record(rkey, repo.posts.get(rkey) ?? {})),
          ...(last !== undefined &&
            start + limit < keys.length && { cursor: last }),
        });
      }
      if (url.pathname === "/xrpc/com.atproto.repo.getRecord") {
        const rkey = url.searchParams.get("rkey") ?? "";
        const value =
          collection === "ai.rizom.brain.card"
            ? repo.card
            : repo.posts.get(rkey);
        return value
          ? jsonResponse(record(rkey, value))
          : jsonResponse(
              { error: "RecordNotFound", message: "Could not locate record" },
              400,
            );
      }
      return jsonResponse({}, 404);
    },
  };
  return repo;
}

const admin = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test-user" },
  userPermissionLevel: "admin" as const,
};

export interface StoredReference {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ReferenceBrain {
  harness: Harness;
  /** Ask for a reference as a curator does; the create route's answer. */
  create(input: Record<string, unknown>): Promise<unknown>;
  /** Run the capture a create queued, and answer its result. */
  runCapture(): Promise<unknown>;
  /** Create from an address and run its capture. */
  feature(url: string): Promise<unknown>;
  references(): Promise<StoredReference[]>;
  /** Mark a stored reference published, as a curator does. */
  publish(id: string): Promise<void>;
  /** Run the daily recheck. */
  recheck(): Promise<void>;
  /** What the recheck keeps about one reference, outside the entity. */
  checkState(id: string): Promise<unknown>;
  /** The reasons of the site rebuilds asked for so far. */
  rebuilds: string[];
}

/** A brain with references installed, reaching one author's repo. */
export async function referenceBrain(
  repo: AuthorRepo,
): Promise<ReferenceBrain> {
  const harness = createPluginHarness({
    // The curator who creates through system_create is signed in.
    resolvePrincipal: async () => ({
      userId: "test-user",
      permissionLevel: "admin",
    }),
  });
  const plugins = referencePlugins({
    fetch: repo.fetch,
    resolveHostname: async () => ["203.0.114.10"],
    handleResolverEndpoint: "https://resolver.example",
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  const jobs = harness.getMockShell().getJobQueueService();

  const create: ReferenceBrain["create"] = async (input) => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("reference");
    if (!interceptor) throw new Error("References intercept no create");
    return interceptor({ entityType: "reference", ...input }, admin);
  };
  // Two jobs queued in one millisecond have no "most recent"; each runs once.
  const ran = new Set<string>();
  const runCapture: ReferenceBrain["runCapture"] = async () => {
    const queued = (await jobs.getRecentJobs(undefined, 50)).find(
      ({ id }) => !ran.has(id),
    );
    if (!queued) throw new Error("No capture was queued");
    ran.add(queued.id);
    const handler: JobHandler | undefined = jobs.getHandler(queued.type);
    if (!handler) throw new Error(`No handler for ${queued.type}`);
    return handler.process(
      handler.validateAndParse(JSON.parse(queued.data)),
      queued.id,
      createMockProgressReporter(),
      new AbortController().signal,
    );
  };
  const rebuilds: string[] = [];
  harness.subscribe("site:build:requested", (message) => {
    rebuilds.push(String(Reflect.get(Object(message.payload), "reason")));
    return { success: true };
  });
  const entityService = harness.getEntityService();
  return {
    harness,
    rebuilds,
    checkState: (id) =>
      sourceCheckStore(harness.getMockShell().getRuntimeState()).get(id),
    publish: async (id): Promise<void> => {
      const entity = await entityService.getEntity({
        entityType: "reference",
        id,
        visibilityScope: "restricted",
      });
      if (!entity) throw new Error(`No reference ${id}`);
      await entityService.updateEntity({
        entity: {
          ...entity,
          metadata: { ...entity.metadata, status: "published" },
        },
      });
    },
    recheck: async (): Promise<void> => {
      const check = harness
        .getMockShell()
        .getRecurringCheck("references:source-recheck");
      if (!check) throw new Error("No recheck is registered");
      await check.run({ signal: new AbortController().signal });
    },
    create,
    runCapture,
    feature: async (url): Promise<unknown> => {
      await create({ url });
      return runCapture();
    },
    references: async () =>
      (
        await harness.getEntityService().listEntities({
          entityType: "reference",
          options: { filter: { visibilityScope: "restricted" } },
        })
      ).map(({ id, content, metadata }) => ({ id, content, metadata })),
  };
}
