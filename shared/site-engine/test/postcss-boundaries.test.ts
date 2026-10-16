import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postcss, { type Plugin } from "postcss";
import { createSilentLogger } from "@brains/test-utils";
import { TailwindCSSProcessor } from "../src/css-processor";

const sourceMap = {
  version: 3,
  file: "input.css",
  names: [],
  sources: ["fixture.css"],
  sourcesContent: [".fixture { color: red }"],
  mappings: "AAAA",
};

function cssWithMap(path: string): string {
  return `.fixture { color: red }\n/*# sourceMappingURL=${path} */`;
}

describe("PostCSS source-map file boundary", () => {
  let directory: string;
  let cssDirectory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "postcss-boundary-"));
    cssDirectory = join(directory, "css");
    await mkdir(cssDirectory);
    await writeFile(join(directory, "outside.map"), JSON.stringify(sourceMap));
    await writeFile(
      join(cssDirectory, "inside.map"),
      JSON.stringify(sourceMap),
    );
    await symlink(
      join(directory, "outside.map"),
      join(cssDirectory, "escape.map"),
    );
    await symlink(directory, join(cssDirectory, "linked"));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("accepts a map within the CSS source directory", () => {
    const root = postcss.parse(cssWithMap("inside.map"), {
      from: join(cssDirectory, "input.css"),
    });
    expect(root.source?.input.map).toBeDefined();
    expect(root.source?.input.map.consumer().sources).toEqual(["fixture.css"]);
  });

  for (const kind of [
    "parent",
    "absolute",
    "file symlink",
    "directory symlink",
  ] as const) {
    it(`ignores a map escaping through ${kind}`, () => {
      const paths = {
        parent: "../outside.map",
        absolute: join(directory, "outside.map"),
        "file symlink": "escape.map",
        "directory symlink": "linked/outside.map",
      };
      const root = postcss.parse(cssWithMap(paths[kind]), {
        from: join(cssDirectory, "input.css"),
      });
      expect(root.source?.input.map).toBeUndefined();
      expect(root.first?.type).toBe("rule");
    });
  }

  it("does not inline outside map data in the real Tailwind processor output", async () => {
    await new TailwindCSSProcessor().process(
      cssWithMap("../outside.map"),
      "unused.css",
      directory,
      cssDirectory,
      createSilentLogger(),
      new AbortController().signal,
    );
    const css = await readFile(join(cssDirectory, "styles/main.css"), "utf8");
    // A refused map is not loaded/inlined; its original annotation is retained.
    expect(css).toBe(cssWithMap("../outside.map"));
    expect(css).not.toContain("data:application/json");
  });
});

describe("PostCSS indexed source-map validation", () => {
  function section(line: number, map: unknown = sourceMap): unknown {
    return { version: 3, sections: [{ offset: { line, column: 0 }, map }] };
  }
  // Construct consumers only; never flatten enormous indexed offsets into output.
  for (const [name, map, message] of [
    ["fractional offset", section(0.5), "non-negative integers"],
    ["excessive offset", section(10000001), "must not exceed 10000000"],
    [
      "excessive nested sum",
      section(5000001, section(5000000)),
      "including offsets of nested sections",
    ],
  ] as const) {
    it(`refuses ${name} before source-map generation`, () => {
      expect(() =>
        postcss.parse(".fixture {}", {
          from: "input.css",
          map: { prev: JSON.stringify(map) },
        }),
      ).toThrow(message);
    });
  }
  it("accepts a small indexed map", () => {
    const root = postcss.parse(".fixture {}", {
      from: "input.css",
      map: { prev: JSON.stringify(section(1)) },
    });
    expect(root.source?.input.map.consumer().sources).toEqual(["fixture.css"]);
  });
});

describe("PostCSS tree processing", () => {
  it("does not import inherited or prototype-changing node defaults", () => {
    const defaults = { prop: "color", value: "red" };
    Object.setPrototypeOf(defaults, { fixtureInherited: true });
    Object.defineProperty(defaults, "__proto__", {
      value: { fixtureInjected: true },
      enumerable: true,
    });
    const declaration = postcss.decl(defaults);
    expect(Object.getPrototypeOf(declaration)).toBe(
      postcss.Declaration.prototype,
    );
    expect(Object.hasOwn(declaration, "fixtureInherited")).toBe(false);
    expect(declaration.toString()).toBe("color: red");
  });

  for (const [before, selector, escaped] of [
    ["</", "style>", "\\3c /style>"],
    ["<", "style>", "\\3c style>"],
    ["<", "!--", "\\3c !--"],
  ] as const) {
    it(`escapes HTML delimiters split between raw spacing and selector ${selector}`, () => {
      const root = postcss.root();
      root.append(postcss.rule({ selector, raws: { before, between: "" } }));
      expect(root.toString()).toBe(`${escaped}{}`);
    });
  }

  it("walks, clones and rehydrates a fixed deeply nested fixture", () => {
    const depth = 6000;
    const css = ".a{".repeat(depth) + "color:red" + "}".repeat(depth);
    const root = postcss.parse(css, { from: undefined });
    let visited = 0;
    root.walk(() => {
      visited++;
    });
    expect(visited).toBe(depth + 1);
    expect(root.clone().toString()).toBe(css);
    expect(postcss.fromJSON(root.toJSON()).toString()).toBe(css);
  });

  it("does not split commas or spaces inside comments", () => {
    expect(postcss.list.comma("red/* , hidden */, blue")).toEqual([
      "red/* , hidden */",
      "blue",
    ]);
    expect(postcss.list.space("red/* hidden space */ blue")).toEqual([
      "red/* hidden space */",
      "blue",
    ]);
  });

  it("visits newly inserted siblings before the parent exit in async processing", async () => {
    const order: string[] = [];
    const plugin: Plugin = {
      postcssPlugin: "fixture-insertion-order",
      async Declaration(declaration): Promise<void> {
        await Promise.resolve();
        order.push(declaration.prop);
        if (declaration.prop === "first")
          declaration.cloneAfter({ prop: "second" });
      },
      RuleExit(): void {
        order.push("exit");
      },
    };
    const result = await postcss([plugin]).process(".fixture{first:1}", {
      from: undefined,
    });
    expect(result.css).toBe(".fixture{first:1;second:1}");
    // Insertion dirties the parent, which legitimately gets another exit pass.
    expect(order).toEqual(["first", "second", "exit", "exit"]);
  });
});
