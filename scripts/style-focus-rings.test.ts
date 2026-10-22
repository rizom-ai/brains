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
 * pane or navigation row. Two exceptions: a list row rings 6px out when its
 * title has focus, since a row has no side padding to keep a 2px ring off
 * its text; and the primary button's reduced-motion hover cue, which is not
 * a focus ring.
 */
const allowed = new Set(["2", "-2", '"2px"', '"-2px"']);
const exceptions = new Set([
  'shared/app-ui-react/src/controls.tsx: "-4px"',
  "shared/operator-view-react/src/operator-list.styles.ts: 6",
]);

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
