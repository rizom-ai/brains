import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { createSilentLogger } from "@brains/test-utils";
import { Head } from "@brains/ui-library";
import type { LayoutComponent } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import { Fragment, h, type VNode } from "preact";
import { createPreactBuilder } from "../../src/lib/preact-builder";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";
import { MockCSSProcessor } from "../mocks/mock-css-processor";
import { createRendererTestContext } from "../test-helpers";

const pageSchema = z.object({
  heading: z.string(),
  pageTitle: z.string(),
  pageLabel: z.string().optional(),
});

const fullscreenSchema = z.object({ message: z.string() });

async function listFiles(root: string, directory = root): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(root, path);
      return [relative(root, path)];
    }),
  );
  return files.flat().sort();
}

function count(text: string, value: string): number {
  return text.split(value).length - 1;
}

describe("PreactBuilder behavioral baseline", () => {
  let testDir: string;
  let outputDir: string;
  let workingDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "preact-builder-baseline-"));
    outputDir = join(testDir, "output");
    workingDir = join(testDir, "working");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("characterizes representative routes, metadata, scripts, assets, theme CSS, and progress", async () => {
    const layout: LayoutComponent = ({ sections, title, path, siteInfo }) =>
      h("div", { "data-layout": "default", "data-path": path }, [
        h("header", {}, `${siteInfo.title} | ${title}`),
        h(
          "nav",
          {},
          siteInfo.navigation.primary.map((item) =>
            h("a", { href: item.href }, item.label),
          ),
        ),
        h("main", {}, sections),
      ]);

    const pageComponent = (props: Record<string, unknown>): VNode => {
      const { heading, pageTitle, pageLabel } = pageSchema.parse(props);
      return h("section", {}, [
        h("h1", {}, heading),
        h("p", { "data-page-title": pageTitle }, pageLabel ?? "no-label"),
      ]);
    };

    const authoredHeadComponent = (props: Record<string, unknown>): VNode => {
      const { heading, pageTitle, pageLabel } = pageSchema.parse(props);
      return h(Fragment, {}, [
        h(Head, {
          title: "Authored Head",
          description: "Authored description",
          canonicalUrl: "/canonical-writing",
        }),
        h("article", { "data-section": "article" }, [
          h("h1", {}, heading),
          h("p", {}, `${pageTitle} | ${pageLabel ?? "no-label"}`),
        ]),
      ]);
    };

    const templates: Record<string, SiteViewTemplate> = {
      "baseline:page": {
        name: "baseline:page",
        schema: pageSchema,
        pluginId: "baseline",
        renderers: { web: pageComponent },
        runtimeScripts: [{ src: "/scripts/page.js", defer: true }],
        staticAssets: {
          "/scripts/page.js": "console.log('template asset');",
        },
      },
      "baseline:article": {
        name: "baseline:article",
        schema: pageSchema,
        pluginId: "baseline",
        renderers: { web: authoredHeadComponent },
      },
      "baseline:fullscreen": {
        name: "baseline:fullscreen",
        schema: fullscreenSchema,
        pluginId: "baseline",
        renderers: {
          web: (props: Record<string, unknown>): VNode => {
            const { message } = fullscreenSchema.parse(props);
            return h("div", {}, message);
          },
        },
        fullscreen: true,
      },
    };

    const context = createRendererTestContext({
      routes: [
        {
          id: "home",
          path: "/",
          title: "Home Route",
          description: "Home description",
          layout: "default",
          sections: [
            {
              id: "hero",
              template: "baseline:page",
              content: { heading: "Home heading" },
            },
          ],
        },
        {
          id: "writing",
          path: "/writing",
          title: "Writing Route",
          pageLabel: "Essays",
          description: "Writing description",
          layout: "default",
          sections: [
            {
              id: "article",
              template: "baseline:article",
              content: { heading: "Writing heading" },
            },
          ],
        },
        {
          id: "canvas",
          path: "/canvas",
          title: "Canvas Route",
          description: "Canvas description",
          layout: "default",
          sections: [
            {
              id: "canvas",
              template: "baseline:fullscreen",
              content: { message: "Fullscreen output" },
            },
          ],
        },
      ],
      siteConfig: {
        title: "Baseline Site",
        description: "Baseline description",
        themeMode: "light",
        analyticsScript: '<script id="analytics"></script>',
      },
      getViewTemplate: (name) => templates[name],
      layouts: { default: layout },
      siteLayoutInfo: {
        title: "Baseline Site",
        description: "Baseline description",
        copyright: "Baseline copyright",
        navigation: {
          primary: [{ label: "Writing", href: "/writing", priority: 10 }],
          secondary: [],
        },
      },
      themeCSS: ":root { --color-brand: #123456; }",
      headScripts: ['<script id="global-head"></script>'],
      staticAssets: {
        "/scripts/page.js": "console.log('site package override');",
        "/assets/site.txt": "site asset",
      },
    });

    const progress: string[] = [];
    const builder = createPreactBuilder({
      logger: createSilentLogger(),
      outputDir,
      workingDir,
      cssProcessor: new MockCSSProcessor(),
    });

    await builder.build(context, (notification) => {
      if (notification.message) progress.push(notification.message);
    });

    const home = await fs.readFile(join(outputDir, "index.html"), "utf-8");
    const writing = await fs.readFile(
      join(outputDir, "writing", "index.html"),
      "utf-8",
    );
    const canvas = await fs.readFile(
      join(outputDir, "canvas", "index.html"),
      "utf-8",
    );
    const css = await fs.readFile(
      join(outputDir, "styles", "main.css"),
      "utf-8",
    );

    expect({
      files: await listFiles(outputDir),
      home: {
        title: home.includes("<title>Home Route</title>"),
        description: home.includes(
          '<meta name="description" content="Home description">',
        ),
        lightTheme: home.includes('data-theme="light"'),
        layout: home.includes('<div data-layout="default" data-path="/">'),
        navigation: home.includes('<a href="/writing">Writing</a>'),
        section: home.includes("Home heading"),
        injectedPageTitle: home.includes(
          '<p data-page-title="Home Route">no-label</p>',
        ),
        analytics: home.includes('<script id="analytics"></script>'),
        globalHead: home.includes('<script id="global-head"></script>'),
        routeScriptCount: count(home, 'src="/scripts/page.js"'),
      },
      writing: {
        authoredTitle: writing.includes("<title>Authored Head</title>"),
        authoredDescription: writing.includes(
          '<meta name="description" content="Authored description">',
        ),
        canonical: writing.includes(
          '<link rel="canonical" href="/canonical-writing">',
        ),
        injectedPageData: writing.includes("Writing Route | Essays"),
        routeScriptCount: count(writing, 'src="/scripts/page.js"'),
      },
      canvas: {
        fullscreenContent: canvas.includes("<div>Fullscreen output</div>"),
        layoutApplied: canvas.includes('data-layout="default"'),
      },
      assets: {
        routeAsset: await fs.readFile(
          join(outputDir, "scripts", "page.js"),
          "utf-8",
        ),
        siteAsset: await fs.readFile(
          join(outputDir, "assets", "site.txt"),
          "utf-8",
        ),
      },
      css: {
        theme: css.includes(":root { --color-brand: #123456; }"),
        generatedUtility: css.includes(".text-theme { color: #1a202c; }"),
      },
      progress: {
        lifecycle: progress.filter((message) =>
          [
            "Starting Preact build",
            "Processing Tailwind CSS",
            "Copying static assets",
            "Preact build complete",
          ].includes(message),
        ),
        routes: progress
          .filter((message) => message.startsWith("Building route:"))
          .sort(),
      },
    }).toEqual({
      files: [
        "assets/site.txt",
        "canvas/index.html",
        "index.html",
        "scripts/page.js",
        "styles/main.css",
        "writing/index.html",
      ],
      home: {
        title: true,
        description: true,
        lightTheme: true,
        layout: true,
        navigation: true,
        section: true,
        injectedPageTitle: true,
        analytics: true,
        globalHead: true,
        routeScriptCount: 1,
      },
      writing: {
        authoredTitle: true,
        authoredDescription: true,
        canonical: true,
        injectedPageData: true,
        routeScriptCount: 0,
      },
      canvas: {
        fullscreenContent: true,
        layoutApplied: false,
      },
      assets: {
        routeAsset: "console.log('site package override');",
        siteAsset: "site asset",
      },
      css: {
        theme: true,
        generatedUtility: true,
      },
      progress: {
        lifecycle: [
          "Starting Preact build",
          "Processing Tailwind CSS",
          "Copying static assets",
          "Preact build complete",
        ],
        routes: [
          "Building route: /",
          "Building route: /canvas",
          "Building route: /writing",
        ],
      },
    });
  });
});
