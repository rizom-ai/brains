import { describe, expect, it } from "bun:test";
import { normalizeRendererHtml } from "./html-equivalence";

function expectEquivalent(left: string, right: string): void {
  expect(normalizeRendererHtml(left, { ignoreImagePreloads: true })).toEqual(
    normalizeRendererHtml(right, { ignoreImagePreloads: true }),
  );
}

describe("normalizeRendererHtml", () => {
  it("folds the measured Preact and React serialization differences", () => {
    expectEquivalent(
      `<input disabled readonly style="width:10px;" value="&gt; '&quot;">`,
      `<input disabled="" readOnly="" style="width:10px" value="> '&quot;">`,
    );
  });

  it("folds React 19 renderer-owned eager-image preloads", () => {
    expectEquivalent(
      `<img src="/cover.jpg" alt="Cover">`,
      `<link rel="preload" as="image" href="/cover.jpg"><img src="/cover.jpg" alt="Cover">`,
    );
  });

  it("folds React 19 preconnect hoisting without dropping the hints", () => {
    expectEquivalent(
      `<head><title>Example</title><script>boot()</script><link rel="preconnect" href="https://fonts.example"></head>`,
      `<head><title>Example</title><link rel="preconnect" href="https://fonts.example"><script>boot()</script></head>`,
    );
  });

  it("keeps non-image resource hints and semantic attributes", () => {
    const baseline = normalizeRendererHtml(
      `<link rel="preload" as="font" href="/font.woff2"><img src="/cover.jpg" alt="Cover">`,
      { ignoreImagePreloads: true },
    );
    const changed = normalizeRendererHtml(
      `<img src="/cover.jpg" alt="Changed">`,
      { ignoreImagePreloads: true },
    );

    expect(changed).not.toEqual(baseline);
  });

  it("normalizes complete documents without losing the doctype", () => {
    expectEquivalent(
      `<!doctype html><html><head><title>Example</title></head><body><p>Text</p></body></html>`,
      `<!DOCTYPE html><html><head><title>Example</title></head><body><p>Text</p></body></html>`,
    );
  });
});
