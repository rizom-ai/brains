import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { SitePageResponse } from "../src/types/web-routes";

test("detaches and freezes slot metadata without granting admission", () => {
  const slot = { name: "form", html: "<form>original</form>" };
  const page = new SitePageResponse("fallback", { status: 403, slot });
  slot.name = "other";
  slot.html = "changed";
  expect(page.slot).toEqual({ name: "form", html: "<form>original</form>" });
  expect(Reflect.set(page, "slot", slot)).toBe(false);
  expect(Object.isFrozen(page.slot)).toBe(true);
  expect(page.status).toBe(403);
});

test.each([
  { name: 'bad"name', html: "PRIVATE_MARKER" },
  { name: "form", html: 123 },
  { name: "form", html: "PRIVATE_MARKER", unknown: true },
])("rejects malformed slot metadata with a sanitized error", (slot) => {
  let failure: unknown;
  try {
    Reflect.construct(SitePageResponse, ["fallback", { slot }]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: "invalid_input" });
  expect(JSON.stringify(failure)).not.toContain("PRIVATE_MARKER");
});

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
    const page = new isolated.SitePageResponse("<main>Guest</main>", {
      slot: { name: "guest-form", html: "<form>Guest</form>" },
    });
    expect(page.slot).toEqual({
      name: "guest-form",
      html: "<form>Guest</form>",
    });
    expect(Object.isFrozen(page.slot)).toBe(true);
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
