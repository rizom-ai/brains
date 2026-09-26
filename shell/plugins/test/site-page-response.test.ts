import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { SitePageResponse } from "../src/types/web-routes";

test("recognizes admitted site pages across independently bundled SDK copies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-page-bundle-"));
  try {
    const built = await Bun.build({
      entrypoints: [
        new URL("../src/types/web-routes.ts", import.meta.url).pathname,
      ],
      outdir: directory,
      target: "bun",
    });
    expect(built.success).toBe(true);
    const output = built.outputs[0];
    if (!output) throw new Error("Missing isolated route bundle");
    const isolated = z
      .object({
        SitePageResponse: z.custom<typeof SitePageResponse>(
          (value) => typeof value === "function",
        ),
      })
      .parse(await import(output.path));
    const page = new isolated.SitePageResponse("<main>Guest</main>");
    expect(page).not.toBeInstanceOf(SitePageResponse);
    expect(SitePageResponse.is(page)).toBe(true);
    expect(isolated.SitePageResponse.is(new SitePageResponse("local"))).toBe(
      true,
    );
    expect(SitePageResponse.is(new Response("ordinary"))).toBe(false);
    expect(SitePageResponse.is({})).toBe(false);
    expect(await page.text()).toBe("<main>Guest</main>");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
