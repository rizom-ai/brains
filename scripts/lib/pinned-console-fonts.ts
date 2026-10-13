import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONSOLE_FONTS_URL,
  resolveConsoleThemeCSS,
} from "@brains/console-theme";
import { z } from "@brains/utils/zod";

/** Where the harness serves the pinned fonts, beside the pages it captures. */
export const PINNED_CONSOLE_FONTS_PREFIX: string = "/__visual/fonts/";
export const PINNED_CONSOLE_FONTS_DIR: string = path.resolve(
  import.meta.dir,
  "../../test/visual/console/fonts",
);
const MANIFEST = path.join(PINNED_CONSOLE_FONTS_DIR, "stylesheets.json");

/** Each Google stylesheet a console page loads, by its local path. */
const manifestSchema: z.ZodRecord<z.ZodURL, z.ZodString> = z.record(
  z.url(),
  z.string(),
);

/**
 * The Google font stylesheets console pages load: the console's own link and
 * the default theme's imports.
 */
export function consoleFontStylesheets(): string[] {
  const imports = [
    ...resolveConsoleThemeCSS().matchAll(/@import url\("([^"]+)"\)/g),
  ].flatMap((match) =>
    match[1]?.startsWith("https://fonts.googleapis.com/") ? [match[1]] : [],
  );
  return [...new Set([CONSOLE_FONTS_URL, ...imports])];
}

export async function pinnedConsoleFontStylesheets(): Promise<
  z.output<typeof manifestSchema>
> {
  return manifestSchema.parse(JSON.parse(await readFile(MANIFEST, "utf8")));
}

// A stylesheet or a face; a bare-origin preconnect fetches neither.
const NETWORK_FONTS = /fonts\.googleapis\.com\/css|fonts\.gstatic\.com\/s\//;

/**
 * Points a captured page at the pinned fonts instead of Google's. A page that
 * would still fetch fonts from the network fails the run: its rendering would
 * depend on which build of a face was served.
 */
export async function pinConsoleFonts(page: string): Promise<string> {
  const pinned = Object.entries(await pinnedConsoleFontStylesheets()).reduce(
    (text, [url, local]) =>
      text
        .replaceAll(url, local)
        .replaceAll(url.replaceAll("&", "&amp;"), local),
    page,
  );
  const network = NETWORK_FONTS.exec(pinned);
  if (network)
    throw new Error(
      `A captured page still loads ${network[0]}; pin its fonts with scripts/vendor-console-visual-fonts.ts: ${pinned.slice(Math.max(0, network.index - 80), network.index + 160)}`,
    );
  return pinned;
}

/** A pinned stylesheet or face, or undefined for any other path. */
export async function servePinnedConsoleFont(
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith(PINNED_CONSOLE_FONTS_PREFIX)) return undefined;
  const name = pathname.slice(PINNED_CONSOLE_FONTS_PREFIX.length);
  if (name !== path.basename(name)) return undefined;
  const type = name.endsWith(".css")
    ? "text/css"
    : name.endsWith(".woff2")
      ? "font/woff2"
      : undefined;
  if (!type) return undefined;
  const body = await readFile(path.join(PINNED_CONSOLE_FONTS_DIR, name)).catch(
    () => undefined,
  );
  return body
    ? new Response(body, { headers: { "content-type": type } })
    : undefined;
}
