import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import sharp from "sharp";
import { renderChatPage } from "../interfaces/web-chat/src/chat-page";
import { renderEditorShellHtml } from "../plugins/cms/src/editor-shell";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "../plugins/dashboard/src/dashboard-page";
import { createMockAppInfo } from "../shared/test-utils/src/mock-app-info";

const ROOT = path.resolve(import.meta.dir, "..");
const BASELINE_DIR = path.join(ROOT, "test/visual/console/baselines");
const ARTIFACT_DIR = path.join(ROOT, "test/visual/console/artifacts");
const UPDATE = process.argv.includes("--update");
const FIXED_NOW = Date.parse("2026-07-11T16:40:00.000Z");
const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;
const CLIMATES = ["instrument", "paper"] as const;
const SURFACES = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", isActive: false },
  { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
  { id: "cms", label: "CMS", href: "/cms", isActive: false },
];

const types = [
  {
    entityType: "posts",
    label: "Field notes",
    isSingleton: false,
    hasBody: true,
    count: 4,
  },
  {
    entityType: "docs",
    label: "Documentation",
    isSingleton: false,
    hasBody: true,
    count: 7,
  },
  {
    entityType: "settings",
    label: "Site settings",
    isSingleton: true,
    hasBody: false,
    count: 1,
  },
];
const entities = [
  {
    id: "responsive-console",
    entityType: "posts",
    // Published entity so the library pins both publication chip states.
    frontmatter: { title: "A console that travels well", published: true },
    updated: "2026-07-10T10:32:00.000Z",
  },
  {
    id: "field-notes",
    entityType: "posts",
    frontmatter: { title: "Notes from the rhizome" },
    updated: "2026-07-08T17:12:00.000Z",
  },
  {
    id: "release-log",
    entityType: "posts",
    frontmatter: { title: "Alpha release log" },
    updated: "2026-07-03T08:00:00.000Z",
  },
  {
    id: "quiet-infrastructure",
    entityType: "posts",
    frontmatter: { title: "Quiet infrastructure" },
    updated: "2026-06-28T15:24:00.000Z",
  },
];
const entity = {
  ...entities[1],
  // The full colophon the mockups author: slug, select, tags, toggle,
  // schedule, and cover image — every widget the editor renders.
  frontmatter: {
    title: "Notes from the rhizome",
    slug: "field-notes",
    summary: "",
    series: "Trust & Identity",
    topics: ["console", "responsive"],
    published: false,
    publishedAt: "2026-07-14T09:00:00.000Z",
    coverImageId: "image/verdigris-board",
  },
  body: "# Notes from the rhizome\n\nA good console should make dense systems feel calm. Its structure needs to remain legible while the viewport changes around it.\n\n> The interface is not a dashboard pasted onto every screen. It is a continuous instrument with distinct working climates.\n\n## Responsive field rules\n\n- Keep shared wayfinding stable.\n- Let local tools adapt to the task.\n- Preserve touch targets and safe areas.\n\nThe result should feel authored at every width.",
  contentHash: "fixture-hash",
  created: "2026-06-18T09:00:00.000Z",
};
const sessions = [
  {
    id: "responsive",
    title: "Responsive console audit",
    lastActiveAt: "2026-07-10T12:04:00.000Z",
  },
  {
    id: "cards",
    title: "Verdigris export review",
    lastActiveAt: "2026-07-10T11:15:00.000Z",
  },
  {
    id: "release",
    title: "Prepare alpha release",
    lastActiveAt: "2026-07-09T16:30:00.000Z",
  },
  {
    id: "cms",
    title: "Revise field notes",
    lastActiveAt: "2026-07-08T09:20:00.000Z",
  },
];
const messages = [
  {
    id: "m1",
    role: "user",
    content:
      "Can you check the responsive console foundation before the next release?",
    // Pins the user upload chip in the top-anchored conversation, where it
    // stays visible at every viewport.
    attachments: [
      {
        kind: "text",
        filename: "verdigris-field-notes.md",
        mediaType: "text/markdown",
        sizeBytes: 4182,
        createdAt: "2026-07-10T11:58:00.000Z",
        source: { kind: "upload", id: "upload-verdigris" },
      },
    ],
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "The shared chrome is aligned across the three operator surfaces. Chat keeps the active conversation compact while the session rail reads as a quiet index.\n\nAt narrow widths, the index moves into a drawer and the composer remains inside the safe area.",
  },
  { id: "m3", role: "user", content: "And the CMS?" },
  {
    id: "m4",
    role: "assistant",
    content:
      "The CMS preserves its warm editorial climate. Desktop separates colophon from manuscript; tablet and phone retain Details, Write, and Preview.",
  },
];
// A second, short session pinning the dynamic message states the mockups
// specify: user upload chip, retrieved-source citations, suggested actions,
// and an exported attachment card. Cards render as <details>; the capture
// opens them. Short enough that the whole exchange fits at 1440×1000.
const cardMessages = [
  {
    id: "m5",
    role: "user",
    content: "Pull the verdigris research together for the trust series.",
  },
  {
    id: "m6",
    role: "assistant",
    content:
      "Queued for the trust series. Two notes ground the draft, and the excerpt board below is exported for review.",
    cards: [
      {
        kind: "sources",
        id: "card-sources",
        title: "Grounding notes",
        sources: [
          {
            id: "src-1",
            title: "Verdigris pigments in early print",
            source: "entity",
            entityType: "note",
            entityId: "verdigris-pigments",
            excerpt:
              "The copper acetate greens survive best in dry margins; the trust series should lead with the 1503 plates.",
            provenance: { score: 0.92 },
          },
          {
            id: "src-2",
            title: "Domain as identity",
            source: "entity",
            entityType: "post",
            entityId: "domain-as-identity",
          },
        ],
      },
      {
        kind: "actions",
        id: "card-actions",
        title: "Next moves",
        defaultOpen: true,
        actions: [
          {
            type: "prompt",
            id: "act-1",
            label: "Draft the series opener",
            prompt: "Draft the trust series opener from the verdigris notes.",
            description: "Uses both grounding notes",
          },
          {
            type: "event",
            id: "act-2",
            label: "Queue for export",
            event: "publishing:queue",
          },
        ],
      },
      {
        kind: "attachment",
        id: "card-attachment",
        title: "Verdigris excerpt board",
        description: "Exported preview for the trust series review.",
        attachment: {
          mediaType: "image/png",
          url: "/fixture/verdigris.png",
          previewUrl: "/fixture/verdigris.png",
          filename: "verdigris-board.png",
          sizeBytes: 48213,
          source: { entityType: "note", entityId: "verdigris-pigments" },
        },
      },
    ],
  },
];

function activeSurfaces(activeId: string): Array<{
  id: string;
  label: string;
  href: string;
  isActive: boolean;
}> {
  return SURFACES.map((surface) => ({
    ...surface,
    isActive: surface.id === activeId,
  }));
}

function dashboardInput(): DashboardRenderInput {
  return {
    title: "Rover Collective",
    baseUrl: "http://127.0.0.1",
    surfaces: activeSurfaces("dashboard"),
    character: {
      role: "A professional brain for the agentic web",
      purpose: "captures · connects · publishes",
      values: ["trust", "clarity", "continuity"],
    },
    profile: {
      name: "Rover Collective",
      description: "A public professional brain.",
    },
    appInfo: createMockAppInfo({
      uptime: 37_200,
      entities: 269,
      entityCounts: [
        { entityType: "post", count: 24 },
        { entityType: "note", count: 112 },
        { entityType: "link", count: 86 },
        { entityType: "agent", count: 2 },
      ],
    }),
    widgets: {
      "content-pipeline:pipeline": {
        widget: {
          id: "pipeline",
          pluginId: "content-pipeline",
          title: "Publication Pipeline",
          group: "publishing",
          section: "primary",
          priority: 10,
          rendererName: "PipelineWidget",
          visibility: "public",
        },
        data: {
          summary: { draft: 2, queued: 4, published: 13, failed: 0 },
          items: [
            {
              id: "q1",
              title: "Domain as identity",
              type: "post",
              status: "queued",
            },
            {
              id: "d1",
              title: "Verdigris pigments",
              type: "note",
              status: "draft",
            },
          ],
          generating: [
            {
              id: "job-1",
              label: "og-image",
              target: "post/domain-as-identity",
              status: "processing",
            },
          ],
        },
      },
    },
    widgetScripts: [],
    activityLog: [
      {
        action: "created",
        entityType: "note",
        entityId: "verdigris-pigments",
        timestamp: "2026-07-11T16:36:00.000Z",
      },
      {
        action: "updated",
        entityType: "post",
        entityId: "domain-as-identity",
        timestamp: "2026-07-11T16:24:00.000Z",
      },
    ],
    indexReady: true,
    indexStatus: {
      ready: true,
      embeddableEntities: 269,
      embeddedEntities: 269,
    },
    directorySyncStatus: {
      syncPath: "content",
      isInitialized: true,
      watchEnabled: true,
      totalFiles: 269,
      lastSync: "2026-07-11T16:32:00.000Z",
    },
    operatorAccess: {
      isOperator: true,
      hiddenWidgetCount: 0,
      loginUrl: "/login",
      logoutUrl: "/logout",
    },
  };
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

function json(value: unknown): Response {
  return Response.json(value);
}

async function checkLayout(
  page: Page,
  surface: string,
  width: number,
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`No viewport configured for ${surface}`);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth !== dimensions.clientWidth) {
    throw new Error(
      `${surface} at ${width}px has document overflow (${dimensions.scrollWidth} > ${dimensions.clientWidth})`,
    );
  }

  if (surface.startsWith("chat")) {
    const mobileTrigger = await page
      .locator(".web-chat-mobile-trigger")
      .evaluate((node) => getComputedStyle(node).display);
    if (width <= 640 !== (mobileTrigger !== "none"))
      throw new Error(`chat responsive mode mismatch at ${width}px`);
    const composer = await page.locator(".web-chat-prompt-input").boundingBox();
    if (!composer || composer.y + composer.height > viewport.height + 1)
      throw new Error(`chat composer escaped the viewport at ${width}px`);
  }
  if (
    surface === "cms-editor" ||
    surface === "cms-delete" ||
    surface === "cms-conflict"
  ) {
    const modes = await page
      .locator(".cms-mobile-modes")
      .evaluate((node) => getComputedStyle(node).display);
    if (width <= 640 !== (modes !== "none"))
      throw new Error(`CMS responsive mode mismatch at ${width}px`);
    if (width <= 900) {
      const pipeline = await page.locator(".pipeline").boundingBox();
      if (!pipeline || pipeline.y + pipeline.height > viewport.height + 1)
        throw new Error(`CMS save bar escaped the viewport at ${width}px`);
    }
  }
}

async function comparePng(
  actual: Buffer,
  baselinePath: string,
): Promise<number> {
  const baseline = await readFile(baselinePath);
  const [left, right] = await Promise.all([
    sharp(actual).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(baseline).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (
    left.info.width !== right.info.width ||
    left.info.height !== right.info.height
  )
    return 1;
  let changed = 0;
  const pixels = left.info.width * left.info.height;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    if (
      Math.abs(left.data.readUInt8(offset) - right.data.readUInt8(offset)) >
        12 ||
      Math.abs(
        left.data.readUInt8(offset + 1) - right.data.readUInt8(offset + 1),
      ) > 12 ||
      Math.abs(
        left.data.readUInt8(offset + 2) - right.data.readUInt8(offset + 2),
      ) > 12 ||
      Math.abs(
        left.data.readUInt8(offset + 3) - right.data.readUInt8(offset + 3),
      ) > 12
    )
      changed += 1;
  }
  return changed / pixels;
}

await mkdir(BASELINE_DIR, { recursive: true });
await mkdir(ARTIFACT_DIR, { recursive: true });
const cmsAsset = path.join(ROOT, "plugins/cms/dist/ui/cms-app.js");
const chatAsset = path.join(ROOT, "interfaces/web-chat/dist/ui/app.js");
await Promise.all([readFile(cmsAsset), readFile(chatAsset)]).catch(() => {
  throw new Error(
    "Build @brains/cms and @brains/web-chat UI assets before visual regression.",
  );
});

// Deterministic preview image for the attachment card: a flat verdigris
// board rendered once at startup.
const fixtureImage = await sharp({
  create: {
    width: 480,
    height: 270,
    channels: 3,
    background: { r: 61, g: 107, b: 92 },
  },
})
  .png()
  .toBuffer();

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/fixture/verdigris.png")
      return new Response(fixtureImage, {
        headers: { "content-type": "image/png" },
      });
    if (url.pathname === "/dashboard")
      return new Response(
        climateHtml(renderDashboardPageHtml(dashboardInput()), request),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname === "/chat")
      return new Response(
        climateHtml(
          renderChatPage({
            surfaces: activeSurfaces("web-chat"),
            sessionHref: "/logout",
          }),
          request,
        ),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname === "/chat/assets/app.js")
      return new Response(await readFile(chatAsset), {
        headers: { "content-type": "text/javascript" },
      });
    if (url.pathname === "/api/chat/sessions") return json({ sessions });
    if (url.pathname === "/api/chat/uploads")
      return new Response("# Verdigris field notes\n", {
        headers: { "content-type": "text/markdown" },
      });
    if (url.pathname === "/api/chat/messages") {
      const id = url.searchParams.get("id");
      return json({
        messages:
          id === "cards" ? cardMessages : id === "empty" ? [] : messages,
      });
    }
    if (url.pathname === "/cms")
      return new Response(
        climateHtml(
          renderEditorShellHtml({
            assetPath: "/cms/assets/cms-app.js",
            surfaces: activeSurfaces("cms"),
            sessionHref: "/logout",
          }),
          request,
        ),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname === "/cms/assets/cms-app.js")
      return new Response(await readFile(cmsAsset), {
        headers: { "content-type": "text/javascript" },
      });
    if (url.pathname === "/cms/api/types") return json({ types });
    if (url.pathname === "/cms/api/schema")
      return json({
        entityType: "posts",
        format: "frontmatter",
        isSingleton: false,
        hasBody: true,
        fields: [
          { name: "title", label: "Title", widget: "string", required: true },
          { name: "slug", label: "Slug", widget: "string", required: false },
          {
            name: "summary",
            label: "Summary",
            widget: "text",
            required: false,
          },
          {
            name: "series",
            label: "Series",
            widget: "select",
            required: false,
            options: ["Trust & Identity", "Field Notes", "Infrastructure"],
          },
          {
            name: "topics",
            label: "Topics",
            widget: "list",
            required: false,
            field: { name: "topics", label: "Topics", widget: "string" },
          },
          {
            name: "published",
            label: "Published",
            widget: "boolean",
            required: false,
          },
          {
            name: "publishedAt",
            label: "Publish date",
            widget: "datetime",
            required: false,
          },
          {
            name: "coverImageId",
            label: "Cover image",
            widget: "image",
            required: false,
          },
        ],
      });
    if (url.pathname === "/cms/api/entities" && request.method === "PUT")
      // Every fixture save conflicts, so the cms-conflict scenario can pin
      // the reconcile card. No other scenario saves.
      return Response.json(
        {
          error:
            "The entry changed after you opened it — directory sync imported a newer version of this manuscript.",
        },
        { status: 409 },
      );
    if (url.pathname === "/cms/api/entities" && url.searchParams.has("id"))
      return json({ entity });
    if (url.pathname === "/cms/api/entities") return json({ entities });
    if (url.pathname === "/cms/api/sync-status")
      return json({
        directorySync: { lastSync: "2026-07-11T16:32:00.000Z", watching: true },
        git: {
          branch: "main",
          hasChanges: false,
          ahead: 0,
          behind: 0,
          lastCommit: "3bfa1e6",
          remote: "origin",
        },
      });
    if (url.pathname === "/api/console/jump") return json({ groups: [] });
    return new Response("Not found", { status: 404 });
  },
});

const executablePath = process.env["CONSOLE_CHROMIUM_PATH"];
if (!executablePath) {
  await server.stop(true);
  throw new Error("Set CONSOLE_CHROMIUM_PATH to a Chromium executable.");
}
const browser = await chromium.launch({ executablePath, headless: true });
const failures: string[] = [];
try {
  for (const climate of CLIMATES) {
    for (const viewport of VIEWPORTS) {
      for (const surface of [
        "dashboard",
        "chat",
        "chat-cards",
        "chat-empty",
        "chat-drawer",
        "cms-library",
        "cms-editor",
        "cms-delete",
        "cms-conflict",
      ] as const) {
        // The sessions drawer only exists at phone widths.
        if (surface === "chat-drawer" && viewport.width > 760) continue;
        // The delete dialog and conflict card are pinned at desktop and
        // phone; tablet adds no distinct composition for these overlays.
        if (
          (surface === "cms-delete" || surface === "cms-conflict") &&
          viewport.width === 768
        )
          continue;
        const isChat = surface.startsWith("chat");
        const conversationId =
          surface === "chat-cards"
            ? "cards"
            : surface === "chat-empty"
              ? "empty"
              : "responsive";
        const page = await browser.newPage({
          viewport,
          locale: "en-GB",
          deviceScaleFactor: 1,
        });
        await page.addInitScript(
          ({ now, conversation }): void => {
            Date.now = (): number => now;
            localStorage.setItem(
              "console.climate",
              new URL(location.href).searchParams.get("climate") ??
                "instrument",
            );
            localStorage.setItem(
              "brain:web-chat:conversation-id",
              conversation,
            );
          },
          { now: FIXED_NOW, conversation: conversationId },
        );
        const isCmsEditor =
          surface === "cms-editor" ||
          surface === "cms-delete" ||
          surface === "cms-conflict";
        const route =
          surface === "dashboard" ? "/dashboard" : isChat ? "/chat" : "/cms";
        const hash = isCmsEditor
          ? "#/posts/field-notes"
          : isChat
            ? `#s/${conversationId}`
            : "";
        await page.goto(
          `http://127.0.0.1:${server.port}${route}?climate=${climate}${hash}`,
          { waitUntil: "networkidle" },
        );
        if (surface === "chat" || surface === "chat-drawer") {
          await page.getByText("And the CMS?").waitFor();
        }
        if (surface === "chat-empty") {
          await page.getByText("Begin a field note.").waitFor();
        }
        if (surface === "chat-drawer") {
          await page.locator(".web-chat-mobile-trigger").click();
          // The drawer slides in over 0.3s; wait for the transform to land.
          await page.locator(".web-chat-sessions").evaluate(
            (node) =>
              new Promise<void>((resolve) => {
                const check = (): void => {
                  const { left } = node.getBoundingClientRect();
                  if (Math.abs(left) < 0.5) resolve();
                  else requestAnimationFrame(check);
                };
                check();
              }),
          );
        }
        if (surface === "chat-cards") {
          await page.getByText("Queued for the trust series.").waitFor();
          // Cards ship collapsed; the baselines pin their expanded bodies.
          await page.evaluate(() => {
            for (const details of Array.from(
              document.querySelectorAll("details"),
            )) {
              details.open = true;
            }
          });
          await page.evaluate(() =>
            Promise.all(
              Array.from(document.images)
                .filter((image) => !image.complete)
                .map(
                  (image) =>
                    new Promise((resolve) => {
                      image.addEventListener("load", resolve, { once: true });
                      image.addEventListener("error", resolve, { once: true });
                    }),
                ),
            ),
          );
          // Fonts must settle before pinning scroll — a late swap reflows
          // the thread and shifts the captured scroll position.
          await page.evaluate(() => document.fonts.ready);
          // Pin the end of the exchange: scroll every scrollable ancestor
          // of the final message to its bottom, and repeat until the
          // positions survive a frame — the thread's stick-to-bottom
          // spring keeps animating past the first pin.
          const pinConversationEnd = (): number[] => {
            const marker = Array.from(document.querySelectorAll("p"))
              .reverse()
              .find((node) =>
                node.textContent?.includes("Queued for the trust series"),
              );
            const tops: number[] = [];
            let node: HTMLElement | null = marker ?? null;
            while (node) {
              if (node.scrollHeight > node.clientHeight + 4) {
                node.scrollTop = node.scrollHeight;
                tops.push(node.scrollTop);
              }
              node = node.parentElement;
            }
            return tops;
          };
          let previousTops = "";
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const tops = JSON.stringify(
              await page.evaluate(pinConversationEnd),
            );
            await page.waitForTimeout(150);
            const settled = JSON.stringify(
              await page.evaluate(pinConversationEnd),
            );
            if (settled === tops && settled === previousTops) break;
            previousTops = settled;
          }
        }
        if (surface === "cms-delete") {
          // Open the delete confirmation. Phone tucks the control behind
          // the ••• disclosure; wider widths show it in the pipeline bar.
          if (viewport.width <= 640) {
            await page.locator(".cms-mobile-more summary").click();
            await page.getByRole("button", { name: "Delete entry" }).click();
          } else {
            await page.locator(".pipeline .btn.danger").click();
          }
          await page.locator(".delete-modal").waitFor();
        }
        if (surface === "cms-conflict") {
          // Save against the fixture's unconditional 409 to raise the
          // reconcile card above the save bar.
          await page.locator(".save-btn").click();
          await page.locator(".conflict").waitFor();
        }
        await page.evaluate(() => document.fonts.ready);
        await checkLayout(page, surface, viewport.width);
        const image = await page.screenshot({
          animations: "disabled",
          type: "png",
        });
        const name = `${surface}-${viewport.width}x${viewport.height}-${climate}.png`;
        const baselinePath = path.join(BASELINE_DIR, name);
        if (UPDATE) {
          // Only rewrite baselines that actually changed — wholesale
          // rewrites churn every pinned file with re-encode noise.
          const ratio = await comparePng(image, baselinePath).catch(() => 1);
          if (ratio > 0.002) await writeFile(baselinePath, image);
        } else {
          try {
            const ratio = await comparePng(image, baselinePath);
            if (ratio > 0.002) {
              await writeFile(path.join(ARTIFACT_DIR, name), image);
              failures.push(
                `${name}: ${(ratio * 100).toFixed(2)}% pixels changed`,
              );
            }
          } catch (error) {
            await writeFile(path.join(ARTIFACT_DIR, name), image);
            failures.push(
              `${name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.stop(true);
}

if (failures.length > 0) {
  throw new Error(
    `Console visual regression failed:\n${failures.join("\n")}\nReview artifacts in ${ARTIFACT_DIR}.`,
  );
}
console.log(
  UPDATE
    ? `Updated console baselines in ${BASELINE_DIR}`
    : "Console visual regression passed.",
);
