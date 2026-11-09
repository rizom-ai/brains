import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { productionReactJsx } from "@brains/build-tools";
import { renderToStaticMarkup } from "react-dom/server";
import type * as HeadModule from "../src/Head";
import type * as PublicEntry from "../src/index";
import type { HeadProps } from "../src/internal";
import { HeadProvider, ImageRendererProvider } from "../src/internal";

/**
 * A site or plugin package installs its own copy of the library, or bundles
 * one, and the brain renders it inside the providers of the copy the brain
 * bundles. Each test builds a copy the way such a package does: a separate
 * module instance that shares only React with the host.
 */
const packageDir = join(import.meta.dir, "..");
let copies: string;

async function buildCopy(entry: string, name: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(packageDir, entry)],
    outdir: join(copies, name),
    target: "bun",
    format: "esm",
    jsx: productionReactJsx,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
  });
  const [output] = result.outputs;
  if (!result.success || output === undefined) {
    throw new AggregateError(result.logs, `Could not build a copy of ${entry}`);
  }
  return output.path;
}

beforeAll(async () => {
  // Inside the package, so the copy resolves the workspace's one React.
  copies = await mkdtemp(join(packageDir, ".copies-"));
});

afterAll(async () => {
  await rm(copies, { recursive: true, force: true });
});

describe("contexts across copies of the library", () => {
  it("renders a copy's markdown images with the brain's image renderer", async () => {
    const copy: typeof PublicEntry = await import(
      await buildCopy("src/index.ts", "public")
    );

    const html = renderToStaticMarkup(
      <ImageRendererProvider
        imageRenderer={(image) =>
          `<img src="https://images.example/${image.href.split("/").at(-1)}.webp" class="host-rendered" alt="${image.alt}">`
        }
      >
        <copy.MarkdownContent markdown="![Cover](entity://image/cover)" />
      </ImageRendererProvider>,
    );

    expect(html).toContain(
      '<img src="https://images.example/cover.webp" class="host-rendered" alt="Cover" />',
    );
    expect(html).not.toContain("entity://image/cover");
  });

  it("collects a copy's head metadata in the brain's head collector", async () => {
    const copy: typeof HeadModule = await import(
      await buildCopy("src/Head.tsx", "head")
    );
    const collected: HeadProps[] = [];

    renderToStaticMarkup(
      <HeadProvider
        headCollector={{ setHeadProps: (props) => collected.push(props) }}
      >
        <copy.Head title="Reading library" description="Saved pages" />
      </HeadProvider>,
    );

    expect(collected).toEqual([
      { title: "Reading library", description: "Saved pages" },
    ]);
  });
});
