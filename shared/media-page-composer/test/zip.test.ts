import { describe, expect, it } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { zip } from "../src/zip";

const encoder = new TextEncoder();
const modified = new Date("2026-10-06T12:34:56Z");

describe("zip", () => {
  const entries = [
    {
      name: "mimetype",
      data: encoder.encode("application/epub+zip"),
      store: true,
    },
    { name: "OEBPS/text.xhtml", data: encoder.encode("Wort ".repeat(500)) },
  ];
  const archive = zip(entries, modified);

  it("holds every entry as written", () => {
    const files = unzipSync(archive);
    expect(Object.keys(files)).toEqual(["mimetype", "OEBPS/text.xhtml"]);
    expect(strFromU8(files["OEBPS/text.xhtml"] ?? new Uint8Array())).toBe(
      "Wort ".repeat(500),
    );
  });

  it("stores what it is told to store and deflates the rest", () => {
    const view = new DataView(archive.buffer, archive.byteOffset);
    const second = 30 + "mimetype".length + "application/epub+zip".length;
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint16(second + 8, true)).toBe(8);
    expect(view.getUint32(second + 18, true)).toBeLessThan(2500);
  });

  it("yields the same bytes for the same entries", () => {
    expect(zip(entries, modified)).toEqual(archive);
  });
});
