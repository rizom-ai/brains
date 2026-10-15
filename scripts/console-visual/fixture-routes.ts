import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "@brains/utils/zod";
import { isRecord } from "@brains/utils/is-record";
import { renameChatSessionRequestSchema } from "@brains/contracts/chat";
import { renderEditorShellHtml, studioTypeHierarchy } from "@brains/studio";
import { renderDashboardPageHtml } from "@brains/dashboard";
import type { studioAssetManifestSchema } from "../../plugins/studio/src/ui-assets";
import type { createAdministrationFixture } from "../fixtures/studio-administration";
import type { createDeliveryViewFixtures } from "../fixtures/studio-delivery-views";
import type { createSyncViewFixture } from "../fixtures/studio-sync-view";
import { systemFixtures } from "../fixtures/studio-system";
import type { StudioStudyState } from "../fixtures/studio-study-state";
import type { createWorkViewFixtures } from "../fixtures/studio-work-views";
import { dashboardFixtureInput } from "./dashboard-fixture";
import { dashboardWidgetRendering } from "./dashboard-widgets";
import {
  accountFixture,
  cardMessages,
  entities,
  entity,
  messages,
  postsSchema,
  sessions,
  studioWorkspaces,
  systemTypes,
  types,
} from "./studio-fixtures";

/** Fixture state the capture loop steers and inspects between requests. */
export interface FixtureServerState {
  /** Studio System surfaces swap the type list to the system types. */
  reviewingSystem: boolean;
  /** The last save of a System entity, to verify its exact payload. */
  lastSystemSave:
    { frontmatter?: Record<string, unknown>; body?: string } | undefined;
}

export interface StudioAssets {
  directory: string;
  manifest: z.output<typeof studioAssetManifestSchema>;
}

export interface FixtureRouteContext {
  studyState: StudioStudyState | undefined;
  state: FixtureServerState;
  studio: StudioAssets;
  /** The attachment card's preview image. */
  fixtureImage: Uint8Array<ArrayBuffer>;
  administration: Awaited<ReturnType<typeof createAdministrationFixture>>;
  workViews: Awaited<ReturnType<typeof createWorkViewFixtures>>;
  deliveryViews: Awaited<ReturnType<typeof createDeliveryViewFixtures>>;
  syncView: Awaited<ReturnType<typeof createSyncViewFixture>>;
}

export interface FixtureRoutes {
  fetch(request: Request): Promise<Response>;
  /** Answers every upload the fixture still holds in flight. */
  releasePendingUploads(): void;
}

/** A route answers its request, or passes it on with `undefined`. */
type FixtureRoute = (
  request: Request,
  url: URL,
) => Response | undefined | Promise<Response | undefined>;

function json(value: unknown): Response {
  return Response.json(value);
}

function climateHtml(html: string, request: Request): string {
  const climate = new URL(request.url).searchParams.get("climate");
  return climate === "paper" || climate === "instrument"
    ? html.replace(
        /data-climate="(?:paper|instrument)"/,
        `data-climate="${climate}"`,
      )
    : html;
}

/** The workspace query a provider reads: everything but routing and climate. */
function workspaceQuery(url: URL): Record<string, string> {
  return Object.fromEntries(
    [...url.searchParams].filter(([key]) => key !== "id" && key !== "climate"),
  );
}

function systemFixtureFor(url: URL): ReturnType<typeof systemFixtures.get> {
  return systemFixtures.get(url.searchParams.get("type") ?? "");
}

/**
 * The console's HTTP surface as the captures see it: rendered pages, Studio
 * assets, and the JSON APIs, answered from fixtures. Routes are tried in
 * order; the first answer wins and anything unanswered is a 404.
 */
export function createFixtureRoutes(
  context: FixtureRouteContext,
): FixtureRoutes {
  const { studyState, state, studio } = context;
  const sessionTitleOverrides = new Map<string, string>();
  const pendingUploadResponses = new Set<() => void>();
  let retryImageUploadFailed = false;

  const fixtureImage: FixtureRoute = (_request, url) =>
    url.pathname === "/fixture/verdigris.png"
      ? new Response(context.fixtureImage, {
          headers: { "content-type": "image/png" },
        })
      : undefined;

  const dashboard: FixtureRoute = (request, url) =>
    url.pathname === "/dashboard"
      ? new Response(
          climateHtml(
            renderDashboardPageHtml(
              dashboardFixtureInput(
                url.searchParams.get("fixture-state"),
                dashboardWidgetRendering,
              ),
            ),
            request,
          ),
          { headers: { "content-type": "text/html" } },
        )
      : undefined;

  const ask: FixtureRoute = (_request, url) =>
    url.pathname === "/ask"
      ? new Response(null, {
          status: 303,
          headers: { Location: "/chat" },
        })
      : undefined;

  const chatSessions: FixtureRoute = async (request, url) => {
    if (url.pathname !== "/api/chat/sessions") return undefined;
    if (request.method === "PUT") {
      const { title } = renameChatSessionRequestSchema.parse(
        await request.json(),
      );
      sessionTitleOverrides.set(url.searchParams.get("id") ?? "", title);
      return json({ renamed: true, title });
    }
    const records =
      url.searchParams.get("archived") === "true"
        ? [
            {
              id: "archived-review",
              title: "Archived review",
              lastActiveAt: "2026-07-01T12:00:00Z",
              archived: true,
            },
          ]
        : sessions.map((session) => ({
            ...session,
            title: sessionTitleOverrides.get(session.id) ?? session.title,
          }));
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    return json({
      sessions:
        studyState === "empty"
          ? []
          : records.filter((session) =>
              session.title.toLowerCase().includes(query),
            ),
    });
  };

  // A busy study holds the reply mid-stream so Stop stays on screen.
  const busyChatStream: FixtureRoute = (request, url) =>
    url.pathname === "/api/chat" &&
    request.method === "POST" &&
    studyState === "busy"
      ? new Response(
          new ReadableStream({
            start(controller): void {
              for (const event of [
                { type: "start", messageId: "fixture-busy" },
                { type: "text-start", id: "text" },
                {
                  type: "text-delta",
                  id: "text",
                  delta: "Fixture response remains in progress.",
                },
              ])
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify(event)}\n\n`,
                  ),
                );
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
              "x-vercel-ai-ui-message-stream": "v1",
            },
          },
        )
      : undefined;

  const chatUploads: FixtureRoute = (_request, url) =>
    url.pathname === "/api/chat/uploads"
      ? new Response("# Verdigris field notes\n", {
          headers: { "content-type": "text/markdown" },
        })
      : undefined;

  const chatMessages: FixtureRoute = (_request, url) => {
    if (url.pathname !== "/api/chat/messages") return undefined;
    const id = url.searchParams.get("id");
    return json({
      messages:
        studyState === "empty"
          ? []
          : id === "cards"
            ? cardMessages
            : id === "empty"
              ? []
              : messages,
    });
  };

  const studioShell: FixtureRoute = (request, url) =>
    url.pathname === "/chat" ||
    url.pathname === "/studio" ||
    url.pathname.startsWith("/studio/entities/") ||
    url.pathname.startsWith("/studio/workspaces/")
      ? new Response(
          climateHtml(
            renderEditorShellHtml({
              assetPath: `/studio/assets/${studio.manifest.entrypoints.script}`,
              stylesheetPath: `/studio/assets/${studio.manifest.entrypoints.stylesheet}`,
              basePath: "/studio",
              sessionHref: "/logout",
              dashboardHref: "/dashboard",
              brandName: "Rover Collective",
              principal: { displayName: "Mira Reyes", role: "admin" },
            }),
            request,
          ),
          { headers: { "content-type": "text/html" } },
        )
      : undefined;

  const studioAsset: FixtureRoute = async (_request, url) => {
    if (!url.pathname.startsWith("/studio/assets/")) return undefined;
    const publicPath = url.pathname.slice("/studio/assets/".length);
    const filePath = studio.manifest.assets[publicPath];
    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(await readFile(path.join(studio.directory, filePath)), {
      headers: {
        "content-type": filePath.endsWith(".map")
          ? "application/json"
          : filePath.endsWith(".css")
            ? "text/css"
            : "text/javascript",
      },
    });
  };

  const studioTypes: FixtureRoute = async (_request, url) => {
    if (url.pathname !== "/studio/api/types") return undefined;
    // Each type carries the hierarchy the real type list sends for it.
    const typeList = (
      state.reviewingSystem
        ? [
            ...types.filter(
              (item) =>
                !systemFixtures.has(item.entityType) &&
                item.entityType !== "settings",
            ),
            ...systemTypes,
          ]
        : types
    ).map((item) => ({
      ...item,
      hierarchy: studioTypeHierarchy(item.entityType),
    }));
    const overview = await context.workViews.overviewBadge();
    const administration = await context.administration.badge();
    return json({
      types: typeList,
      workspaces: studioWorkspaces({ overview, administration }),
    });
  };

  const workspaceData = new Map<string, (url: URL) => Promise<unknown>>([
    ["studio:overview", (): Promise<unknown> => context.workViews.overview()],
    [
      "unified-inbox:inbox",
      (url): Promise<unknown> => context.workViews.inbox(workspaceQuery(url)),
    ],
    ["directory-sync:sync", (): Promise<unknown> => context.syncView()],
    ["site-builder:site", (): Promise<unknown> => context.deliveryViews.site()],
    [
      "content-pipeline:publishing",
      (): Promise<unknown> => context.deliveryViews.publishing(),
    ],
    [
      "admin:administration",
      (url): Promise<unknown> =>
        context.administration.read(workspaceQuery(url)),
    ],
  ]);
  const studioWorkspace: FixtureRoute = async (_request, url) => {
    const id = url.searchParams.get("id") ?? "";
    const read = workspaceData.get(id);
    if (url.pathname !== "/studio/api/workspace" || !read) return undefined;
    return json({
      workspace: {
        id,
        rendererName: "DeclarativeOperatorWorkspace",
        data: await read(url),
      },
    });
  };

  const account: FixtureRoute = (_request, url) =>
    url.pathname === "/auth/account"
      ? json({ account: accountFixture(studyState) })
      : undefined;

  const schema: FixtureRoute = (_request, url) => {
    if (url.pathname !== "/studio/api/schema") return undefined;
    const systemFixture = systemFixtureFor(url);
    return json(
      systemFixture
        ? {
            entityType: systemFixture.entityType,
            format: "frontmatter",
            isSingleton: systemFixture.isSingleton,
            hasBody: systemFixture.hasBody,
            fields: systemFixture.fields,
          }
        : postsSchema,
    );
  };

  const saveEntity: FixtureRoute = async (request, url) => {
    if (url.pathname !== "/studio/api/entities" || request.method !== "PUT")
      return undefined;
    // Saves only happen in the secondary-state scenarios: an emptied
    // title pins the validation error line (studio-invalid), any other
    // save pins the reconcile card (studio-conflict).
    const body = (await request.json()) as {
      entityType?: string;
      frontmatter?: { title?: string; [key: string]: unknown };
      body?: string;
    };
    if (body.entityType && systemFixtures.has(body.entityType)) {
      state.lastSystemSave = body;
      const voice = body.frontmatter?.["voice"];
      if (isRecord(voice) && voice["summary"] === "!!")
        return Response.json(
          {
            error: "Validation failed",
            issues: [
              { path: ["voice", "summary"], message: "Review this summary." },
            ],
          },
          { status: 400 },
        );
      return json({
        entityId: body.entityType,
        jobId: "system-save",
        skipped: true,
      });
    }
    if (body.frontmatter?.title?.includes("!!"))
      return Response.json(
        {
          error: "Validation failed",
          issues: [{ path: ["title"], message: "Title may not contain '!!'." }],
        },
        { status: 400 },
      );
    return Response.json(
      {
        error:
          "The entry changed after you opened it — directory sync imported a newer version of this manuscript.",
      },
      { status: 409 },
    );
  };

  const upload: FixtureRoute = async (request, url) => {
    if (url.pathname !== "/studio/api/upload") return undefined;
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File && file.name === "retry-cover.png") {
      retryImageUploadFailed = !retryImageUploadFailed;
      return retryImageUploadFailed
        ? Response.json(
            { error: "Fixture upload interrupted" },
            { status: 503 },
          )
        : json({ entityId: "image/recovered-cover" });
    }
    // Hold the fixture at an observable in-flight boundary until its page
    // closes; teardown releases any request the browser did not abort.
    return new Promise<Response>((resolve) => {
      const release = (): void => {
        pendingUploadResponses.delete(release);
        resolve(json({ entityId: "image/verdigris-board" }));
      };
      pendingUploadResponses.add(release);
      request.signal.addEventListener("abort", release, { once: true });
    });
  };

  const listEntities: FixtureRoute = (_request, url) => {
    const hierarchyRequest = url.pathname === "/studio/api/hierarchy";
    if (!hierarchyRequest && url.pathname !== "/studio/api/entities")
      return undefined;
    const systemFixture = systemFixtureFor(url);
    if (systemFixture)
      return json(
        url.searchParams.has("id")
          ? { entity: systemFixture.entity }
          : {
              ...(hierarchyRequest ? { prefix: null, folders: [] } : {}),
              entities: [
                { ...systemFixture.entity, path: [systemFixture.entity.id] },
              ],
              total: 1,
            },
      );
    if (!hierarchyRequest && url.searchParams.has("id"))
      return json({ entity });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    const visibility = url.searchParams.get("visibility") ?? "all";
    const filtered = entities.filter(
      (item) =>
        item.frontmatter.title.toLowerCase().includes(query) &&
        (visibility === "all" || visibility === "public"),
    );
    if (url.searchParams.get("sort")?.endsWith("asc")) filtered.reverse();
    return json({
      ...(hierarchyRequest ? { prefix: null, folders: [] } : {}),
      // These fixtures have flat IDs; the real service owns hierarchy derivation.
      entities: filtered
        .slice(offset, offset + limit)
        .map((item) => ({ ...item, path: [item.id] })),
      total: filtered.length,
    });
  };

  const syncStatus: FixtureRoute = (_request, url) =>
    url.pathname === "/studio/api/sync-status"
      ? json({
          directorySync: {
            lastSync: "2026-07-11T16:32:00.000Z",
            watching: true,
          },
          git: {
            branch: "main",
            hasChanges: false,
            ahead: 0,
            behind: 0,
            lastCommit: "3bfa1e6",
            remote: "origin",
          },
        })
      : undefined;

  const consoleJump: FixtureRoute = (_request, url) =>
    url.pathname === "/api/console/jump" ? json({ groups: [] }) : undefined;

  const routes: readonly FixtureRoute[] = [
    fixtureImage,
    dashboard,
    ask,
    chatSessions,
    busyChatStream,
    chatUploads,
    chatMessages,
    studioShell,
    studioAsset,
    studioTypes,
    studioWorkspace,
    account,
    schema,
    saveEntity,
    upload,
    listEntities,
    syncStatus,
    consoleJump,
  ];

  return {
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);
      for (const route of routes) {
        const response = await route(request, url);
        if (response) return response;
      }
      return new Response("Not found", { status: 404 });
    },
    releasePendingUploads(): void {
      for (const release of pendingUploadResponses) release();
    },
  };
}
