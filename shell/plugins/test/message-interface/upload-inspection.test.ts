import { expect, test } from "bun:test";
import {
  UploadInspection,
  uploadInspectionDetailsSchema,
} from "../../src/message-interface/upload-inspection";
import {
  validateMessageUpload,
  validateMessageUploadFacts,
  messageTextUploadMaxBytes,
  messageUploadMaxBytes,
} from "../../src/message-interface/upload-policy";

function inspect(
  bytes: Uint8Array,
  creditSize = 32 * 1024,
): ReturnType<UploadInspection["finish"]> {
  const inspector = new UploadInspection(bytes.length);
  for (let offset = 0; offset < bytes.length; offset += creditSize) {
    const credit = bytes.slice(offset, offset + creditSize);
    inspector.observe(credit);
    credit.fill(0); // Borrowed backing is immediately reusable.
  }
  return inspector.finish();
}

test("signature inspection copies only its prefix and respects split UTF-8 credits", () => {
  expect(inspect(new TextEncoder().encode("%PDF-1.7\nText 🎉"), 1)).toEqual({
    binaryMediaType: "application/pdf",
    validText: true,
  });
  expect(inspect(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), 1)).toEqual({
    binaryMediaType: "image/png",
    validText: false,
  });
  expect(inspect(new Uint8Array())).toEqual({ validText: true });
  expect(inspect(new Uint8Array([0xc3]), 1)).toEqual({ validText: false });
  expect(inspect(new Uint8Array([65, 0, 66]), 1)).toEqual({ validText: false });
});

test("native facts preserve the existing filename, MIME, size and signature policy", () => {
  const cases: Array<{
    filename: string;
    mediaType: string | undefined;
    content: Uint8Array;
  }> = [
    {
      filename: "note.txt",
      mediaType: "text/plain",
      content: new TextEncoder().encode("\uFEFFHello 🎉"),
    },
    { filename: "note.md", mediaType: undefined, content: new Uint8Array() },
    {
      filename: "note.txt",
      mediaType: "text/plain",
      content: Uint8Array.from([0]),
    },
    {
      filename: "note.txt",
      mediaType: "text/plain",
      content: new Uint8Array(messageTextUploadMaxBytes + 1),
    },
    {
      filename: "document.pdf",
      mediaType: "application/pdf",
      content: new TextEncoder().encode("%PDF-1.7"),
    },
    {
      filename: "document.pdf",
      mediaType: undefined,
      content: new TextEncoder().encode("wrong"),
    },
    {
      filename: "document.pdf",
      mediaType: "image/jpeg",
      content: new TextEncoder().encode("%PDF-1.7"),
    },
    {
      filename: "large.pdf",
      mediaType: "application/pdf",
      content: new Uint8Array(messageUploadMaxBytes + 1),
    },
    {
      filename: "x.bin",
      mediaType: undefined,
      content: Uint8Array.from([1, 2]),
    },
    {
      filename: "folder/image.png",
      mediaType: "image/png; extra=ignored",
      content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    },
    {
      filename: "image.jpg",
      mediaType: "application/octet-stream",
      content: Uint8Array.from([0xff, 0xd8, 0xff]),
    },
    {
      filename: "image.gif",
      mediaType: undefined,
      content: new TextEncoder().encode("GIF89a"),
    },
    {
      filename: "image.webp",
      mediaType: undefined,
      content: new TextEncoder().encode("RIFF0000WEBP"),
    },
  ];
  for (const input of cases) {
    const result = validateMessageUpload(input);
    const facts = validateMessageUploadFacts({
      filename: input.filename,
      mediaType: input.mediaType,
      sizeBytes: input.content.length,
      ...inspect(input.content),
    });
    if (result.ok && result.kind === "text") {
      const { text: _text, ...metadata } = result;
      expect(facts).toEqual(metadata);
    } else expect(facts).toEqual(result);
  }
});

test("inspection rejects invalid credits, sizes, duplicate completion and extra metadata", () => {
  expect(() => new UploadInspection(100 * 1024 * 1024 + 1)).toThrow();
  expect(() => new UploadInspection(-1)).toThrow();
  const overflow = new UploadInspection(1);
  expect(() => overflow.observe(new Uint8Array(2))).toThrow(/size mismatch/);
  expect(() => overflow.finish()).toThrow(/closed/);
  expect(() => new UploadInspection(1).finish()).toThrow(/size mismatch/);
  const largeCredit = new UploadInspection(32769);
  expect(() => largeCredit.observe(new Uint8Array(32769))).toThrow(/credit/);
  const complete = new UploadInspection(0);
  complete.finish();
  expect(() => complete.finish()).toThrow(/closed/);
  expect(() => complete.observe(new Uint8Array())).toThrow(/closed/);
  expect(
    uploadInspectionDetailsSchema.safeParse({
      validText: true,
      binaryMediaType: "text/html",
    }).success,
  ).toBe(false);
  expect(
    uploadInspectionDetailsSchema.safeParse({
      validText: true,
      payload: "forbidden",
    }).success,
  ).toBe(false);
});
