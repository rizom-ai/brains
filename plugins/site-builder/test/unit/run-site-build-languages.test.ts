import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { createElement as h, type ReactElement } from "react";
import { z } from "@brains/utils/zod";
import type { RouteDefinitionInput } from "@brains/site-composition";
import type { SiteBuildContext } from "@brains/site-engine";
import { createTestPipelineContext } from "../pipeline-context";
import { runSiteBuild } from "../../src/lib/run-site-build";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";
import { TestLayout } from "../test-helpers";

const HOME: RouteDefinitionInput = {
  id: "home",
  path: "/",
  title: "Home",
  sections: [
    { id: "cover", template: "home:cover", content: { line: "Hello" } },
  ],
};

const lineSchema = z.object({ line: z.string() });

const coverTemplate: SiteViewTemplate = {
  name: "home:cover",
  schema: lineSchema,
  pluginId: "test-site",
  renderers: {
    web: (props: Record<string, unknown>): ReactElement =>
      h("p", null, lineSchema.parse(props).line),
  },
};

interface Page {
  id: string;
  path: string;
  language: string;
  line: unknown;
}

describe("runSiteBuild languages", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "run-site-build-languages-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function build(savedCopy: Record<string, string>): Promise<Page[]> {
    const { pipeline } = createTestPipelineContext([HOME]);
    pipeline.services.getViewTemplate = (name): SiteViewTemplate | undefined =>
      name === coverTemplate.name ? coverTemplate : undefined;
    pipeline.services.hasSavedContent = async (id): Promise<boolean> =>
      id in savedCopy;
    pipeline.services.resolveTemplateContent = async (
      _name,
      options,
    ): Promise<unknown> => {
      const id = options?.savedContent?.entityId ?? "";
      return savedCopy[id] ? { line: savedCopy[id] } : options?.fallback;
    };

    const pages: Page[] = [];
    const factory: StaticSiteBuilderFactory = (factoryOptions) => ({
      clean: mock(async () => undefined),
      build: mock(async (context: SiteBuildContext, _progress, signal) => {
        for (const [path, content] of Object.entries(
          context.preparedBuild.staticAssets,
        )) {
          const file = join(factoryOptions.outputDir, path.replace(/^\//, ""));
          await fs.mkdir(dirname(file), { recursive: true });
          await fs.writeFile(file, content);
        }
        await context.routes.each(async (page) => {
          pages.push({
            id: page.id,
            path: page.path,
            language: page.language,
            line: page.sections[0]?.data["line"],
          });
          const file = join(
            factoryOptions.outputDir,
            page.path === "/"
              ? "index.html"
              : `${page.path.slice(1)}/index.html`,
          );
          await fs.mkdir(dirname(file), { recursive: true });
          await fs.writeFile(file, "");
        }, signal);
        await fs.mkdir(join(factoryOptions.outputDir, "styles"), {
          recursive: true,
        });
        await fs.writeFile(
          join(factoryOptions.outputDir, "styles/main.css"),
          "",
        );
      }),
    });

    const result = await runSiteBuild({
      buildOptions: {
        environment: "preview",
        outputDir: join(testDir, "site-preview"),
        sharedImagesDir: join(testDir, "images"),
        enableContentGeneration: false,
        cleanBeforeBuild: true,
        siteConfig: {
          title: "Bilingual",
          description: "Two languages",
          translations: { "zh-TW": { title: "雙語" } },
        },
        siteUrl: "https://bilingual.example",
        layouts: { default: TestLayout },
        languages: ["en", "zh-TW"],
      },
      progress: undefined,
      pipelineContext: pipeline,
      staticSiteBuilderFactory: factory,
      signal: new AbortController().signal,
    });
    expect(result.errors ?? []).toEqual([]);
    return pages;
  }

  it("builds the home page again under /zh-tw from its Chinese copy", async () => {
    const pages = await build({ "zh-tw:home:cover": "你好" });

    expect(pages).toEqual([
      { id: "home", path: "/", language: "en", line: "Hello" },
      { id: "zh-tw:home", path: "/zh-tw", language: "zh-TW", line: "你好" },
    ]);
  });

  it("lists both versions of the page in the sitemap", async () => {
    await build({ "zh-tw:home:cover": "你好" });
    const sitemap = await fs.readFile(
      join(testDir, "site-preview", "sitemap.xml"),
      "utf8",
    );

    expect(sitemap).toContain("<loc>https://bilingual.example/</loc>");
    expect(sitemap).toContain("<loc>https://bilingual.example/zh-tw</loc>");
  });

  it("builds no Chinese page while its copy is missing", async () => {
    const pages = await build({});

    expect(pages.map(({ path }) => path)).toEqual(["/"]);
  });
});
