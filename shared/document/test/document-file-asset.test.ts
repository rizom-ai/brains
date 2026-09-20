import { expect, test } from "bun:test";
import { MAX_ASSET_BYTES } from "@brains/assets";
import type { FileInspectionResult } from "@brains/db/file-process-owner";
import {
  assertDocumentFileMatches,
  documentAssetFactsFromInspection,
  documentAssetFactsSchema,
  documentFileLimitsSchema,
} from "../src/document-file-asset";

const inspection: FileInspectionResult = {
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  details: { mimeType: "application/pdf", pageCount: 2 },
};
const limits = { maxBytes: 1024, maxPageCount: 2 };
const descriptor = {
  sizeBytes: 1024,
  sha256: inspection.sha256,
  mimeType: "application/pdf",
};

test("derives reference-only PDF facts from inspection without a payload", () => {
  const facts = documentAssetFactsFromInspection(inspection, limits);
  expect(facts).toEqual({
    ref: `asset://sha256/${inspection.sha256}`,
    digest: inspection.sha256,
    sizeBytes: 1024,
    mimeType: "application/pdf",
    pageCount: 2,
  });
  expect(() => assertDocumentFileMatches(facts, descriptor)).not.toThrow();
  expect(
    documentAssetFactsSchema.parse(JSON.parse(JSON.stringify(facts))),
  ).toEqual(facts);
});

test("unknown page counts stay unknown, rather than inventing document validity", () => {
  const facts = documentAssetFactsFromInspection(
    { ...inspection, details: { mimeType: "application/pdf", pageCount: 0 } },
    limits,
  );
  expect(facts.pageCount).toBe(0);
});

test("enforces actual byte and page limits, including exact boundaries", () => {
  expect(() =>
    documentAssetFactsFromInspection(inspection, { ...limits, maxBytes: 1023 }),
  ).toThrow("exceeds maxBytes=1023");
  expect(() =>
    documentAssetFactsFromInspection(inspection, {
      ...limits,
      maxPageCount: 1,
    }),
  ).toThrow("exceeding maxPageCount=1");
  expect(
    documentAssetFactsFromInspection(
      { ...inspection, sizeBytes: MAX_ASSET_BYTES },
      { ...limits, maxBytes: MAX_ASSET_BYTES },
    ).sizeBytes,
  ).toBe(MAX_ASSET_BYTES);
  expect(() =>
    documentAssetFactsFromInspection(
      { ...inspection, sizeBytes: MAX_ASSET_BYTES + 1 },
      { ...limits, maxBytes: MAX_ASSET_BYTES },
    ),
  ).toThrow();
});

test.each([0, -1, 1.5, Infinity, NaN])(
  "rejects invalid inspected byte size %s",
  (sizeBytes) => {
    expect(() =>
      documentAssetFactsFromInspection({ ...inspection, sizeBytes }, limits),
    ).toThrow();
  },
);

test.each([0, -1, 1.5, Infinity, NaN, MAX_ASSET_BYTES + 1])(
  "rejects invalid byte limit %s",
  (maxBytes) => {
    expect(
      documentFileLimitsSchema.safeParse({ ...limits, maxBytes }).success,
    ).toBe(false);
  },
);
test.each([0, -1, 1.5, Infinity, NaN])(
  "rejects invalid page limit %s",
  (maxPageCount) => {
    expect(
      documentFileLimitsSchema.safeParse({ ...limits, maxPageCount }).success,
    ).toBe(false);
  },
);

test.each([
  { mimeType: "image/png", pageCount: 2 },
  { mimeType: "application/pdf", pageCount: -1 },
  { mimeType: "application/pdf", pageCount: 1.5 },
  { mimeType: "application/pdf", pageCount: NaN },
  { mimeType: "application/pdf", pageCount: 2, data: "inline payload" },
  { mimeType: "application/pdf" },
])("rejects non-PDF or malformed inspection details %j", (details) => {
  expect(() =>
    documentAssetFactsFromInspection({ ...inspection, details }, limits),
  ).toThrow();
});

test.each([
  { ...descriptor, sizeBytes: 1023 },
  { ...descriptor, sha256: "b".repeat(64) },
  { ...descriptor, mimeType: "image/png" },
])("rejects descriptor/receipt disagreement %j", (declared) => {
  const facts = documentAssetFactsFromInspection(inspection, limits);
  expect(() => assertDocumentFileMatches(facts, declared)).toThrow(
    "does not match its attachment metadata",
  );
});

test.each(["", "A".repeat(64), "a".repeat(63)])(
  "rejects malformed inspected digests %s",
  (sha256) => {
    expect(() =>
      documentAssetFactsFromInspection({ ...inspection, sha256 }, limits),
    ).toThrow();
  },
);

test("rejects malformed or payload-bearing descriptors", () => {
  const facts = documentAssetFactsFromInspection(inspection, limits);
  const payload = { ...descriptor, data: "JVBERi0=" };
  expect(() => assertDocumentFileMatches(facts, payload)).toThrow();
  expect(() =>
    assertDocumentFileMatches(facts, { ...descriptor, sha256: "not-a-digest" }),
  ).toThrow();
  expect(() =>
    assertDocumentFileMatches(facts, { ...descriptor, sizeBytes: 0 }),
  ).toThrow();
});

test("rejects inconsistent references and extra payload fields", () => {
  const facts = documentAssetFactsFromInspection(inspection, limits);
  expect(
    documentAssetFactsSchema.safeParse({
      ...facts,
      ref: `asset://sha256/${"b".repeat(64)}`,
    }).success,
  ).toBe(false);
  expect(
    documentAssetFactsSchema.safeParse({
      ...facts,
      ref: "data:application/pdf;base64,JVBERi0=",
    }).success,
  ).toBe(false);
  expect(
    documentAssetFactsSchema.safeParse({ ...facts, data: "JVBERi0=" }).success,
  ).toBe(false);
  expect(() =>
    assertDocumentFileMatches({ ...facts, digest: "b".repeat(64) }, descriptor),
  ).toThrow();
});
