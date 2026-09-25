import { expect, test } from "bun:test";
import {
  PartialLinkedInUploadError,
  type LinkedInUploadRecovery,
} from "../../src/lib/linkedin-client";
import {
  collectLinkedInUploadEvidence,
  linkedInUploadEvidenceSchema,
} from "../../src/lib/linkedin-upload-evidence";

const receipt: LinkedInUploadRecovery = {
  kind: "document",
  resourceUrn: "urn:li:document:doc1",
  sha256: "a".repeat(64),
  sizeBytes: 17,
  stage: "uploaded",
};
const failure = (): PartialLinkedInUploadError =>
  new PartialLinkedInUploadError(
    receipt,
    new Error("private https://provider/token=secret /loan/path"),
  );

test("collects shared/cyclic cause and aggregate branches once without private diagnostics", () => {
  const upload = failure();
  const root = new AggregateError(
    [upload, new Error("private sibling")],
    "private aggregate",
    { cause: upload },
  );
  Object.defineProperty(upload, "cause", { value: root });
  const result = collectLinkedInUploadEvidence(root);
  expect(result).toEqual({
    nodes: [
      { kind: "aggregate", cause: 1, errors: [1, 2] },
      { kind: "error", upload: 0, cause: 0 },
      { kind: "error" },
    ],
    uploads: [receipt],
    invalid: false,
    truncated: false,
  });
  expect(linkedInUploadEvidenceSchema.safeParse(result).success).toBe(true);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result?.uploads)).toBe(true);
  expect(Object.isFrozen(result?.uploads[0])).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(JSON.stringify(result)).not.toContain("token");
});

test("schema rejects dangling evidence references", () => {
  expect(
    linkedInUploadEvidenceSchema.safeParse({
      uploads: [],
      nodes: [{ kind: "error", cause: 1 }],
      invalid: false,
      truncated: false,
    }).success,
  ).toBe(false);
  expect(
    linkedInUploadEvidenceSchema.safeParse({
      uploads: [],
      nodes: [{ kind: "error", upload: 0 }],
      invalid: false,
      truncated: false,
    }).success,
  ).toBe(false);
});

test("does not infer receipts from unbranded errors", () => {
  expect(
    collectLinkedInUploadEvidence(
      Object.assign(new Error("failed"), { recovery: receipt }),
    ),
  ).toBeUndefined();
});

test("malformed or hostile markers do not hide an independent valid branch", () => {
  const hostile = failure();
  Object.defineProperty(hostile, "recovery", {
    get: (): never => {
      throw new Error("private getter");
    },
  });
  const invalid = failure();
  Object.defineProperty(invalid, "recovery", {
    value: { ...receipt, resourceUrn: "https://private/secret" },
  });
  const root = new AggregateError([hostile, invalid, failure()], "private");
  Object.defineProperty(root, "cause", {
    get: (): never => {
      throw new Error("private cause");
    },
  });
  expect(collectLinkedInUploadEvidence(root)).toMatchObject({
    uploads: [receipt],
    invalid: true,
    truncated: false,
  });
});

test("bounds branches, node visits and receipt bytes without hiding truncation", () => {
  const branches = Array.from(
    { length: 8 },
    () =>
      new AggregateError(
        Array.from({ length: 9 }, () => failure()),
        "private",
      ),
  );
  const result = collectLinkedInUploadEvidence(
    new AggregateError(branches, "private", { cause: failure() }),
  );
  expect(result?.truncated).toBe(true);
  expect(result?.uploads.length).toBeGreaterThan(0);
  expect(result?.uploads.length).toBeLessThanOrEqual(8);
  expect(
    new TextEncoder().encode(JSON.stringify(result)).byteLength,
  ).toBeLessThan(16 * 1024);
});

test("a graph limit reports uncertainty even when the marker lies beyond the scan", () => {
  let root: Error = failure();
  for (let index = 0; index < 20; index++)
    root = new Error("private", { cause: root });
  const result = collectLinkedInUploadEvidence(root);
  expect(result?.uploads).toEqual([]);
  expect(result?.nodes).toHaveLength(16);
  expect(result?.truncated).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private");
});

test("receipt count is capped independently of graph node limits", () => {
  const bounded = (): PartialLinkedInUploadError =>
    new PartialLinkedInUploadError(
      { ...receipt, resourceUrn: `urn:li:${"a".repeat(1017)}` },
      undefined,
    );
  const result = collectLinkedInUploadEvidence(
    new AggregateError(Array.from({ length: 8 }, bounded), "private", {
      cause: bounded(),
    }),
  );
  expect(
    new TextEncoder().encode(JSON.stringify(result)).byteLength,
  ).toBeLessThan(16 * 1024);
  expect(result?.uploads).toHaveLength(8);
  expect(result?.truncated).toBe(true);
});
