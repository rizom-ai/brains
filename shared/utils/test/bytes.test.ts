import { describe, expect, it } from "bun:test";
import { bufferView, toDataUrl } from "../src/bytes";

describe("bufferView", () => {
  it("views the same memory rather than copying it", () => {
    const bytes = new Uint8Array([104, 105]);
    const view = bufferView(bytes);
    bytes[0] = 72;
    expect(Buffer.isBuffer(view)).toBe(true);
    expect(view.toString("utf8")).toBe("Hi");
  });

  it("keeps a subarray's offset and length", () => {
    const whole = new TextEncoder().encode("xx-hello-xx");
    expect(bufferView(whole.subarray(3, 8)).toString("utf8")).toBe("hello");
  });

  it("returns a Buffer as it is", () => {
    const buffer = Buffer.from("same");
    expect(bufferView(buffer)).toBe(buffer);
  });
});

describe("toDataUrl", () => {
  it("encodes only the viewed bytes as a base64 data URL", () => {
    const whole = new TextEncoder().encode("xx-hello-xx");
    expect(toDataUrl("text/plain", whole.subarray(3, 8))).toBe(
      "data:text/plain;base64,aGVsbG8=",
    );
  });
});
