import { describe, expect, it } from "bun:test";
import { generateCloudflareBeaconScript } from "../src/lib/beacon-script";

describe("generateCloudflareBeaconScript", () => {
  it("generates the exact script tag with a public site token", () => {
    expect(generateCloudflareBeaconScript("abc123")).toBe(
      `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"abc123"}'></script>`,
    );
  });

  it("embeds the token in the data-cf-beacon attribute", () => {
    expect(generateCloudflareBeaconScript("my-custom-token")).toContain(
      '"token":"my-custom-token"',
    );
  });

  it("uses the defer attribute", () => {
    expect(generateCloudflareBeaconScript("test")).toContain("defer");
  });
});

describe("beacon token serialization", () => {
  for (const token of [
    "public-token",
    `quote'"\\\n</script><script>unexpected</script>&#39;`,
  ]) {
    it(`preserves ${token === "public-token" ? "ordinary" : "special"} characters as one JSON token`, () => {
      const script = generateCloudflareBeaconScript(token);
      const match =
        /^<script defer src='https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js' data-cf-beacon='([^']*)'><\/script>$/.exec(
          script,
        );
      expect(match).not.toBeNull();
      const data = match?.[1];
      if (data === undefined)
        throw new Error("Missing intact beacon attribute");
      expect(data).not.toContain("<");
      expect(data).not.toContain("&");
      expect(JSON.parse(data)).toEqual({ token });
    });
  }
});
