import { expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "@brains/utils/run-process";
import manifest from "../package.json";
import { z } from "zod";

it("packs compiled widgets and declarations without private workspace dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "brain-ui-packed-"));
  async function run(command: string[], cwd: string): Promise<void> {
    const result = await runProcess(command, { cwd });
    if (result.exitCode !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.exitCode).toBe(0);
  }
  try {
    await run(
      [process.execPath, "pm", "pack", "--destination", root],
      join(import.meta.dir, ".."),
    );
    const consumer = join(root, "consumer");
    await mkdir(consumer);
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        scripts: { check: "tsc --noEmit", smoke: "bun smoke.tsx" },
        dependencies: {
          "@rizom/brain-ui": `file:${join(root, `rizom-brain-ui-${manifest.version}.tgz`)}`,
          react: manifest.devDependencies.react,
          "react-dom": manifest.devDependencies["react-dom"],
          "@types/react": manifest.devDependencies["@types/react"],
          "@types/react-dom": manifest.devDependencies["@types/react-dom"],
          typescript: manifest.devDependencies.typescript,
        },
      }),
    );
    await writeFile(
      join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: "ESNext",
          moduleResolution: "bundler",
          target: "ES2022",
          jsx: "react-jsx",
          types: ["react"],
          lib: ["ES2022", "DOM"],
        },
        include: ["smoke.tsx"],
      }),
    );
    await writeFile(
      join(consumer, "smoke.tsx"),
      `
import { renderToStaticMarkup } from "react-dom/server";
import { CardHeader, WidgetEmptyState, WidgetTabs, operatorViewStylexCSS } from "@rizom/brain-ui";
const html = renderToStaticMarkup(<><CardHeader title="Queue" source="Fixture" /><WidgetEmptyState>No items</WidgetEmptyState><WidgetTabs id="fixture" label="Items" defaultValue="all" tabs={[{ value: "all", label: "All", content: "Items" }]} /></>);
if (!html.includes("No items") || !html.includes("Queue")) throw new Error(html);
const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap(match => (match[1] ?? "").split(" "));
if (!classes.some(name => operatorViewStylexCSS.includes("." + name + "{") || operatorViewStylexCSS.includes("." + name + ":"))) throw new Error("Widget stylesheet does not contain the rendered StyleX classes");
`,
    );
    await run([process.execPath, "install"], consumer);
    await run([process.execPath, "run", "check"], consumer);
    await run([process.execPath, "run", "smoke"], consumer);
    const installed = z
      .object({
        dependencies: z.record(z.string(), z.string()),
        files: z.array(z.string()),
      })
      .parse(
        JSON.parse(
          await readFile(
            join(consumer, "node_modules/@rizom/brain-ui/package.json"),
            "utf8",
          ),
        ),
      );
    expect(
      Object.keys(installed.dependencies).filter((name) =>
        name.startsWith("@brains/"),
      ),
    ).toEqual([]);
    expect(installed.files).toEqual(["dist"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
