import { expect, test } from "bun:test";
import {
  linkedInUploadEvidenceSchema,
  parseLinkedInUploadEvidence,
  type LinkedInUploadEvidence,
} from "../src/publish-recovery";

const evidence: LinkedInUploadEvidence = {
  uploads: [
    {
      kind: "image",
      resourceUrn: "urn:li:digitalmediaAsset:image",
      sha256: "a".repeat(64),
      sizeBytes: 17,
      stage: "upload-received",
    },
  ],
  nodes: [
    { kind: "aggregate", cause: 1, errors: [1] },
    { kind: "error", upload: 0, cause: 0 },
  ],
  truncated: false,
  invalid: false,
};

test("wire recovery survives JSON and preserves cycles through bounded indices", () => {
  const parsed = parseLinkedInUploadEvidence(
    JSON.parse(JSON.stringify(evidence)),
  );
  expect(parsed).toEqual(evidence);
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed.nodes)).toBe(true);
  expect(Object.isFrozen(parsed.nodes[0]?.errors)).toBe(true);
  expect(Object.isFrozen(parsed.uploads[0])).toBe(true);
});

test("receipt projections drop private fields and do not retain caller aliases", () => {
  const input = {
    ...evidence,
    uploads: evidence.uploads.map((upload) => ({
      ...upload,
      uploadUrl: "https://private/secret",
      sourceFile: "/loan/file",
      authorization: "secret",
    })),
  };
  const result = parseLinkedInUploadEvidence(input);
  input.uploads.length = 0;
  expect(result).toEqual(evidence);
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(JSON.stringify(result)).not.toContain("/loan/");
});

test.each([
  { nodes: [{ kind: "error", cause: 15 }] },
  { nodes: [{ kind: "error", upload: 7 }] },
  { nodes: Array.from({ length: 17 }, () => ({ kind: "error" })) },
  { uploads: Array.from({ length: 9 }, () => evidence.uploads[0]) },
])("invalid graph bounds are rejected: %j", (invalid) => {
  expect(
    linkedInUploadEvidenceSchema.safeParse({ ...evidence, ...invalid }).success,
  ).toBe(false);
});

test("the 100 MiB wire ceiling and stage vocabulary cannot authorize larger or published uploads", () => {
  const upload = evidence.uploads[0];
  expect(
    linkedInUploadEvidenceSchema.safeParse({
      ...evidence,
      uploads: [{ ...upload, sizeBytes: 100 * 1024 * 1024 }],
    }).success,
  ).toBe(true);
  expect(
    linkedInUploadEvidenceSchema.safeParse({
      ...evidence,
      uploads: [{ ...upload, sizeBytes: 100 * 1024 * 1024 + 1 }],
    }).success,
  ).toBe(false);
  expect(
    linkedInUploadEvidenceSchema.safeParse({
      ...evidence,
      uploads: [{ ...upload, stage: "published" }],
    }).success,
  ).toBe(false);
});
