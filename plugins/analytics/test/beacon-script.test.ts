import { describe, it, expect } from "bun:test";
import { generateCloudflareBeaconScript } from "../src/lib/beacon-script";

describe("generateCloudflareBeaconScript", () => {
  it("should generate correct script tag with site tag", () => {
    const script = generateCloudflareBeaconScript("abc123");
    expect(script).toBe(
      `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"abc123"}'></script>`,
    );
  });

  it("should embed the site tag in the data-cf-beacon attribute", () => {
    const script = generateCloudflareBeaconScript("my-custom-tag");
    expect(script).toContain('"token":"my-custom-tag"');
  });

  it("should use defer attribute", () => {
    const script = generateCloudflareBeaconScript("test");
    expect(script).toContain("defer");
  });
});
