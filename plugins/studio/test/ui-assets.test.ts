import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "@brains/utils/zod";

const manifestSchema = z.object({
  version: z.literal(1),
  assets: z.record(z.string(), z.string()),
});
const uiDirectory = join(import.meta.dir, "..", "dist", "ui");

function readManifest(): z.output<typeof manifestSchema> {
  return manifestSchema.parse(
    JSON.parse(
      readFileSync(join(uiDirectory, "studio-asset-manifest.json"), "utf8"),
    ),
  );
}

describe("Studio split UI assets", () => {
  it("emits one bounded manifest with a lazy Account chunk", () => {
    const manifest = readManifest();
    const entries = Object.entries(manifest.assets);

    expect(manifest.assets["app.js"]).toBe("studio-app.js");
    expect(manifest.assets["app.css"]).toBe("studio-app.css");
    expect(
      entries.every(
        ([publicPath, filePath]) =>
          /^(?:app\.(?:js|css)|studio-app\.js\.map|studio-chunks\/[A-Za-z0-9_-]+\.(?:js|js\.map))$/.test(
            publicPath,
          ) &&
          /^(?:studio-app\.(?:js|css)|studio-app\.js\.map|studio-chunks\/[A-Za-z0-9_-]+\.(?:js|js\.map))$/.test(
            filePath,
          ),
      ),
    ).toBe(true);

    const accountEntry = entries.find(([publicPath]) =>
      /^studio-chunks\/account-view-[a-z0-9]+\.js$/.test(publicPath),
    );
    expect(accountEntry).toBeDefined();
    if (!accountEntry) throw new Error("Missing lazy Account asset");

    const stylesheet = readFileSync(
      join(uiDirectory, manifest.assets["app.css"] ?? ""),
      "utf8",
    );
    expect(stylesheet).toContain("var(--console-accent)");
    expect(stylesheet).not.toContain("insertRule");

    const entrySource = readFileSync(
      join(uiDirectory, manifest.assets["app.js"] ?? ""),
      "utf8",
    );
    const accountSource = readFileSync(
      join(uiDirectory, accountEntry[1]),
      "utf8",
    );

    expect(entrySource).toContain(accountEntry[0]);
    expect(entrySource).not.toContain("/auth/account/passkeys/options");
    expect(accountSource).toContain("/auth/account/passkeys/options");
    expect(accountSource).toContain("Signed-in sessions");
  });
});
