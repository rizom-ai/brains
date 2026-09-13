import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import {
  resolveAuthenticatedSidecars,
  authenticatedProfileSchema,
} from "./fixtures/turso-authenticated-sidecars";

const installed = {
  nativeWorker: "file:///tmp/native.js",
  readBridge: "file:///tmp/read-bridge.js",
  consumer: "file:///tmp/consumer.js",
  uploadBridge: "file:///tmp/upload-bridge.js",
  producer: "file:///tmp/producer.js",
  control: "file:///tmp/control.js",
  bunExecutable: "/explicit/bun",
};
describe("authenticated installed actor selection", () => {
  it("distinguishes the focused crash profile from full acceptance", () => {
    expect(authenticatedProfileSchema.parse("consumer-kill")).toBe(
      "consumer-kill",
    );
    assert.equal(authenticatedProfileSchema.parse("full"), "full");
    for (const invalid of ["", "quick", "consumer-kil", null, undefined])
      assert.equal(
        authenticatedProfileSchema.safeParse(invalid).success,
        false,
      );
  });
  it("requires a complete bounded manifest without source fallback", () => {
    expect(
      resolveAuthenticatedSidecars("installed", JSON.stringify(installed)),
    ).toEqual(installed);
    for (const encoded of [
      undefined,
      "{}",
      " ".repeat(32769),
      JSON.stringify({ ...installed, control: undefined }),
      JSON.stringify({ ...installed, extra: true }),
    ])
      assert.throws(() => resolveAuthenticatedSidecars("installed", encoded));
  });
  it("rejects relative executables and remote or query-bearing sidecars", () => {
    expect(() =>
      resolveAuthenticatedSidecars(
        "installed",
        JSON.stringify({ ...installed, bunExecutable: "bun" }),
      ),
    ).toThrow("explicit absolute Bun");
    for (const control of [
      "https://example.invalid/control.js",
      "./control.js",
      "file:///tmp/control.js?fallback=source",
      "file:///tmp/control.js#source",
    ])
      assert.throws(() =>
        resolveAuthenticatedSidecars(
          "installed",
          JSON.stringify({ ...installed, control }),
        ),
      );
  });
  it("keeps source selection explicit and rejects installed overrides in source mode", () => {
    expect(
      resolveAuthenticatedSidecars("source").control.endsWith(
        "/scripts/fixtures/turso-read-control-process.ts",
      ),
    ).toBe(true);
    assert.throws(
      () => resolveAuthenticatedSidecars("source", JSON.stringify(installed)),
      /does not accept installed/,
    );
  });
});
