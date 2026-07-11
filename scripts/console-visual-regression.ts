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
    frontmatter: { title: "A console that travels well" },
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

  if (surface === "chat") {
    const mobileTrigger = await page
      .locator(".web-chat-mobile-trigger")
      .evaluate((node) => getComputedStyle(node).display);
    if (width <= 640 !== (mobileTrigger !== "none"))
      throw new Error(`chat responsive mode mismatch at ${width}px`);
    const composer = await page.locator(".web-chat-prompt-input").boundingBox();
    if (!composer || composer.y + composer.height > viewport.height + 1)
      throw new Error(`chat composer escaped the viewport at ${width}px`);
  }
  if (surface === "cms-editor") {
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

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
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
    if (url.pathname === "/api/chat/messages") return json({ messages });
    if (url.pathname === "/api/chat/bootstrap") return json({ starters: [] });
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
          {
            name: "summary",
            label: "Summary",
            widget: "text",
            required: false,
          },
        ],
      });
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
        "cms-library",
        "cms-editor",
      ] as const) {
        const page = await browser.newPage({
          viewport,
          locale: "en-GB",
          deviceScaleFactor: 1,
        });
        await page.addInitScript((now): void => {
          Date.now = (): number => now;
          localStorage.setItem(
            "console.climate",
            new URL(location.href).searchParams.get("climate") ?? "instrument",
          );
          localStorage.setItem("brain:web-chat:conversation-id", "responsive");
        }, FIXED_NOW);
        const route =
          surface === "dashboard"
            ? "/dashboard"
            : surface === "chat"
              ? "/chat"
              : "/cms";
        const hash =
          surface === "cms-editor"
            ? "#/posts/field-notes"
            : surface === "chat"
              ? "#s/responsive"
              : "";
        await page.goto(
          `http://127.0.0.1:${server.port}${route}?climate=${climate}${hash}`,
          { waitUntil: "networkidle" },
        );
        if (surface === "chat") {
          await page.getByText("And the CMS?").waitFor();
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
          await writeFile(baselinePath, image);
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
