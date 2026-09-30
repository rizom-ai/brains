#!/usr/bin/env bun
/**
 * Pins the console's web fonts for the visual regression harness: fetches each
 * Google stylesheet console pages load, as Google serves it to CI's pinned
 * Chrome, and every face it names, then writes them under
 * test/visual/console/fonts with local URLs. Run it when a console page's
 * fonts change, then review and regenerate the baselines.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PINNED_CONSOLE_FONTS_DIR,
  PINNED_CONSOLE_FONTS_PREFIX,
  consoleFontStylesheets,
} from "./lib/pinned-console-fonts";

// Google Fonts varies its stylesheets by browser; match CI's pinned Chrome.
const CHROME_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36";

async function download(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": CHROME_USER_AGENT },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

const sheets = await Promise.all(
  consoleFontStylesheets().map(async (url, index) => ({
    url,
    file: `console-fonts-${index + 1}.css`,
    css: await (await download(url)).text(),
  })),
);
const faces = [
  ...new Set(
    sheets.flatMap(
      ({ css }) => css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) ?? [],
    ),
  ),
];
if (faces.length === 0) throw new Error("The stylesheets name no font files.");

await rm(PINNED_CONSOLE_FONTS_DIR, { recursive: true, force: true });
await mkdir(PINNED_CONSOLE_FONTS_DIR, { recursive: true });
// /s/<family>/<version>/<file>.woff2 → <family>-<version>-<file>.woff2
const local = new Map(
  faces.map((url) => [
    url,
    new URL(url).pathname.replace(/^\/s\//, "").replaceAll("/", "-"),
  ]),
);
await Promise.all(
  faces.map(async (url) =>
    writeFile(
      path.join(PINNED_CONSOLE_FONTS_DIR, local.get(url) ?? ""),
      new Uint8Array(await (await download(url)).arrayBuffer()),
    ),
  ),
);
await Promise.all(
  sheets.map(({ url, file, css }) =>
    writeFile(
      path.join(PINNED_CONSOLE_FONTS_DIR, file),
      `/* ${url} */\n${faces.reduce(
        (sheet, face) =>
          sheet.replaceAll(
            face,
            `${PINNED_CONSOLE_FONTS_PREFIX}${local.get(face)}`,
          ),
        css,
      )}`,
    ),
  ),
);
await writeFile(
  path.join(PINNED_CONSOLE_FONTS_DIR, "stylesheets.json"),
  `${JSON.stringify(
    Object.fromEntries(
      sheets.map(({ url, file }) => [
        url,
        `${PINNED_CONSOLE_FONTS_PREFIX}${file}`,
      ]),
    ),
    null,
    2,
  )}\n`,
);
console.log(
  `Pinned ${sheets.length} stylesheets and ${faces.length} font files.`,
);
