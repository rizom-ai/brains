import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { canonicalCheckoutPath } from "../src/lib/broker/checkout-identity";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A real directory and a symlink to it, side by side. */
function linkedDirectory(): { real: string; link: string } {
  const root = mkdtempSync(join(tmpdir(), "checkout-identity-"));
  roots.push(root);
  const real = join(root, "real");
  const link = join(root, "link");
  mkdirSync(real);
  symlinkSync(real, link);
  return { real: realpathSync(real), link };
}

describe("canonicalCheckoutPath", () => {
  it("names a checkout behind a symlink by its real path", async () => {
    const { real, link } = linkedDirectory();
    mkdirSync(join(real, "checkout"));

    expect(await canonicalCheckoutPath(join(link, "checkout"))).toBe(
      join(real, "checkout"),
    );
  });

  it("gives a checkout the same identity before and after it is created", async () => {
    const { real, link } = linkedDirectory();
    const checkout = join(link, "data", "checkout");

    const before = await canonicalCheckoutPath(checkout);
    mkdirSync(checkout, { recursive: true });
    const after = await canonicalCheckoutPath(checkout);

    expect(before).toBe(join(real, "data", "checkout"));
    expect(after).toBe(before);
  });
});
