import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const root = join(import.meta.dir, "..");
const styled = [
  "shared/app-ui-react/src",
  "shared/operator-view-react/src",
  "plugins/studio/ui-react/src",
];
/**
 * A focus ring sits 2px outside a button or link, or 2px inside a field,
 * pane or navigation row. The primary button's reduced-motion hover cue is
 * not a focus ring: it draws inside the filled button, clear of its edge.
 */
const allowed = new Set(["2", "-2", '"2px"', '"-2px"']);
const exceptions = new Set(['shared/app-ui-react/src/controls.tsx: "-4px"']);

describe("console focus rings", () => {
  test("every outline offset is one of the two focus-ring offsets", () => {
    const strays = styled.flatMap((dir) =>
      Array.from(new Glob("**/*.{ts,tsx}").scanSync(join(root, dir)))
        .filter((file) => !/\.test\.tsx?$/.test(file))
        .flatMap((file) =>
          Array.from(
            readFileSync(join(root, dir, file), "utf8").matchAll(
              /outlineOffset: (-?\d+|"[^"]*")/g,
            ),
          )
            .map((match) => match[1] ?? "")
            .filter((offset) => !allowed.has(offset))
            .map((offset) => `${dir}/${file}: ${offset}`)
            .filter((stray) => !exceptions.has(stray)),
        ),
    );

    expect(strays).toEqual([]);
  });
});
